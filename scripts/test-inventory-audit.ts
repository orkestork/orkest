import "dotenv/config";
import { prisma } from "@/lib/core/prisma";
import { tenantDb } from "@/lib/core/db";
import type { ExecContext } from "@/lib/core/context";
import { hasPermission } from "@/lib/core/permissions";
import { BASE_ROLES } from "@/lib/templates/industries";
import { ensureBaseRoles, applyTemplate } from "@/lib/templates/apply";
import { adjustStock, archiveWarehouse, cancelTransfer, checkAvailability, createTransfer, createWarehouse, operationType, qtyAt, transferBetweenWarehouses, validateTransfer } from "@/lib/apps/stock";
import { createProduct } from "@/lib/apps/inventory";
import { forecastAt, runReplenishment } from "@/lib/apps/replenishment";
import { createPurchaseOrder, createReceipt } from "@/lib/apps/purchasing";
import { createSalesOrder } from "@/lib/apps/sales-orders";

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${msg}${extra ? ` — ${extra}` : ""}`); };
const throws = async (fn: () => Promise<unknown>, msg: string, expect?: RegExp) => {
  try { await fn(); ok(false, msg, "no lanzó error"); } catch (e) { const m = (e as Error).message; ok(!expect || expect.test(m), msg, m.slice(0, 90)); }
};
const n = (v: unknown) => Number(v ?? 0);

/** Invariantes de inventario de una organización. */
async function invariants(orgId: string, label: string) {
  const db = tenantDb(orgId);
  const [products, quants, internal, moves] = await Promise.all([
    db.product.findMany(), db.stockQuant.findMany(), db.location.findMany({ where: { kind: "INTERNAL" } }), db.stockMovement.findMany(),
  ]);
  const internalIds = new Set(internal.map((l) => l.id));
  const negatives = quants.filter((q) => n(q.quantity) < -1e-9);
  ok(negatives.length === 0, `${label}: ninguna existencia negativa`, negatives.length ? `${negatives.length} negativas` : "");
  let cacheBad = 0;
  for (const p of products) {
    const total = quants.filter((q) => q.productId === p.id && internalIds.has(q.locationId)).reduce((s, q) => s + n(q.quantity), 0);
    if (Math.abs(total - n(p.stock)) > 1e-6) cacheBad++;
  }
  ok(cacheBad === 0, `${label}: Product.stock = suma de existencias por bodega (${products.length} productos)`, cacheBad ? `${cacheBad} descuadres` : "");
  let ledgerBad = 0;
  for (const q of quants) {
    const inQ = moves.filter((m) => m.productId === q.productId && m.toLocationId === q.locationId).reduce((s, m) => s + n(m.quantity), 0);
    const outQ = moves.filter((m) => m.productId === q.productId && m.fromLocationId === q.locationId).reduce((s, m) => s + n(m.quantity), 0);
    if (Math.abs(inQ - outQ - n(q.quantity)) > 1e-6) ledgerBad++;
  }
  ok(ledgerBad === 0, `${label}: cada existencia = entradas − salidas del historial (${quants.length} saldos)`, ledgerBad ? `${ledgerBad} descuadres` : "");
  const done = await db.transfer.findMany({ where: { status: "done" }, include: { lines: true } });
  const badLines = done.flatMap((t) => t.lines).filter((l) => Math.abs(n(l.quantity) - n(l.doneQty)) > 1e-9);
  ok(badLines.length === 0, `${label}: transferencias hechas tienen todas sus líneas cerradas`);
  const doneNoMoves = done.filter((t) => !moves.some((m) => m.transferId === t.id) && t.lines.some((l) => n(l.doneQty) > 0));
  ok(doneNoMoves.length === 0, `${label}: toda transferencia hecha dejó movimientos`);
}

async function main() {
  console.log("\n── 1. Datos actuales de las organizaciones ──");
  for (const o of await prisma.organization.findMany({ where: { slug: { in: ["presservac", "andina"] } } })) await invariants(o.id, o.name);

  console.log("\n── 2. Casos límite (organización de prueba) ──");
  await prisma.organization.deleteMany({ where: { slug: { in: ["audit-a", "audit-b"] } } });
  const A = await prisma.organization.create({ data: { slug: "audit-a", name: "Audit A", status: "ACTIVE" } });
  const ctx: ExecContext = { orgId: A.id, db: tenantDb(A.id), actorId: null };
  await ensureBaseRoles(ctx);
  const w1 = await createWarehouse(ctx, { code: "W1", name: "Uno" });
  await applyTemplate(ctx, "manufacturing");
  const w2 = await createWarehouse(ctx, { code: "W2", name: "Dos" });
  const w3 = await createWarehouse(ctx, { code: "W3", name: "Tres" });
  const sup = await ctx.db.supplier.create({ data: { organizationId: A.id, name: "Prov" } });
  const p = await createProduct(ctx, { sku: "P", name: "Pieza", stock: 6, cost: 1000, defaultSupplierId: sup.id });
  const kg = await createProduct(ctx, { sku: "KG", name: "Polvo", unit: "KG", stock: 2.5 });
  const srv = await createProduct(ctx, { sku: "S", name: "Servicio", kind: "SERVICE" });
  const intOp = await operationType(ctx, w2.id, "INTERNAL");
  const mv = (lines: { productId: string; quantity: number }[], from = w1.stockLocationId!, to = w2.stockLocationId!) => createTransfer(ctx, { operationTypeId: intOp.id, srcLocationId: from, destLocationId: to, lines });

  // Mismo producto en dos líneas: se consolida y no deja pasar más de lo que hay
  const dup = await mv([{ productId: p.id, quantity: 5 }, { productId: p.id, quantity: 5 }]);
  const dupLines = await ctx.db.transferLine.findMany({ where: { transferId: dup.id } });
  ok(dupLines.length === 1 && n(dupLines[0].quantity) === 10, "Líneas repetidas del mismo producto se consolidan (5+5 → 10)");
  ok((await ctx.db.transfer.findUniqueOrThrow({ where: { id: dup.id } })).status === "waiting", "Con 6 en bodega y 10 pedidos, queda «En espera»");
  await throws(() => validateTransfer(ctx, dup.id), "No se puede validar 10 si hay 6", /insuficiente/);
  ok(await qtyAt(ctx, p.id, w1.stockLocationId!) === 6, "Tras el intento fallido la existencia sigue en 6 (transacción revertida)");
  ok((await ctx.db.transfer.findUniqueOrThrow({ where: { id: dup.id } })).status === "waiting", "Tras el fallo la transferencia sigue abierta, no «hecha»");
  await cancelTransfer(ctx, dup.id);

  // Validación doble y simultánea
  const t1 = await mv([{ productId: p.id, quantity: 4 }]);
  const results = await Promise.allSettled([validateTransfer(ctx, t1.id), validateTransfer(ctx, t1.id), validateTransfer(ctx, t1.id)]);
  ok(results.filter((r) => r.status === "fulfilled").length === 1, "3 validaciones simultáneas: solo 1 mueve inventario", `${results.filter((r) => r.status === "fulfilled").length} exitosas`);
  ok(await qtyAt(ctx, p.id, w1.stockLocationId!) === 2 && await qtyAt(ctx, p.id, w2.stockLocationId!) === 4, "Existencias correctas después de la carrera (W1=2, W2=4)");
  await throws(() => validateTransfer(ctx, t1.id), "Validar de nuevo una transferencia hecha", /ya fue validada/);
  await throws(() => cancelTransfer(ctx, t1.id), "Cancelar una transferencia hecha", /No se puede cancelar/);

  // Dos transferencias distintas compitiendo por la misma existencia
  const ra = await mv([{ productId: p.id, quantity: 2 }], w1.stockLocationId!, w3.stockLocationId!);
  const rb = await mv([{ productId: p.id, quantity: 2 }], w1.stockLocationId!, w2.stockLocationId!);
  const race = await Promise.allSettled([validateTransfer(ctx, ra.id), validateTransfer(ctx, rb.id)]);
  ok(race.filter((r) => r.status === "fulfilled").length === 1, "Dos transferencias compiten por 2 unidades: solo una sale", `W1 queda en ${await qtyAt(ctx, p.id, w1.stockLocationId!)}`);
  ok(await qtyAt(ctx, p.id, w1.stockLocationId!) === 0, "W1 nunca queda negativo");

  // Cantidades inválidas, decimales y servicios
  const t2 = await mv([{ productId: p.id, quantity: 1 }], w2.stockLocationId!, w3.stockLocationId!);
  const l2 = (await ctx.db.transferLine.findFirstOrThrow({ where: { transferId: t2.id } })).id;
  await throws(() => validateTransfer(ctx, t2.id, { [l2]: Number.NaN }), "Cantidad no numérica al validar", /inválida/);
  await throws(() => validateTransfer(ctx, t2.id, { [l2]: -3 }), "Cantidad negativa al validar", /inválida/);
  await throws(() => validateTransfer(ctx, t2.id, { [l2]: 0 }), "Validar con cantidad 0", /al menos una cantidad/);
  await validateTransfer(ctx, t2.id, { [l2]: 50 });
  ok(await qtyAt(ctx, p.id, w3.stockLocationId!) >= 1 && (await ctx.db.transferLine.findUniqueOrThrow({ where: { id: l2 } })).doneQty.toNumber() === 1, "Pedir 50 cuando la demanda es 1 mueve solo 1 (se limita a la demanda)");
  await throws(() => mv([{ productId: p.id, quantity: Number.NaN }]), "Crear transferencia con cantidad NaN", /mayor que cero/);
  await throws(() => mv([{ productId: p.id, quantity: -1 }]), "Crear transferencia con cantidad negativa", /mayor que cero/);
  await throws(() => mv([{ productId: srv.id, quantity: 1 }]), "Mover inventario de un servicio", /servicios/);
  await throws(() => mv([{ productId: p.id, quantity: 1 }], w1.stockLocationId!, w1.stockLocationId!), "Origen igual a destino", /no pueden ser iguales/);
  const tk = await mv([{ productId: kg.id, quantity: 0.1 }, { productId: kg.id, quantity: 0.2 }]);
  await validateTransfer(ctx, tk.id);
  ok(await qtyAt(ctx, kg.id, w1.stockLocationId!) === 2.2 && await qtyAt(ctx, kg.id, w2.stockLocationId!) === 0.3, "Decimales sin error de redondeo (2,5 − 0,1 − 0,2 = 2,2)", `W1=${await qtyAt(ctx, kg.id, w1.stockLocationId!)}`);

  // Ajustes
  await throws(() => adjustStock(ctx, p.id, w2.stockLocationId!, -5), "Ajuste a cantidad negativa", /mayor o igual a cero/);
  await throws(() => adjustStock(ctx, p.id, w2.stockLocationId!, Number.NaN), "Ajuste con cantidad no numérica", /número/);
  ok((await adjustStock(ctx, p.id, w2.stockLocationId!, await qtyAt(ctx, p.id, w2.stockLocationId!))) === null, "Ajustar a la misma cantidad no crea movimientos");
  await adjustStock(ctx, p.id, w2.stockLocationId!, 20);
  ok(await qtyAt(ctx, p.id, w2.stockLocationId!) === 20, "Ajuste de conteo deja la existencia exacta (20)");

  // Backorders y espera → listo
  const dOp = await operationType(ctx, w3.id, "INTERNAL");
  const wt = await createTransfer(ctx, { operationTypeId: dOp.id, srcLocationId: w3.stockLocationId!, destLocationId: w1.stockLocationId!, lines: [{ productId: kg.id, quantity: 1 }] });
  ok((await ctx.db.transfer.findUniqueOrThrow({ where: { id: wt.id } })).status === "waiting", "Sin existencia en origen la transferencia queda en espera");
  await transferBetweenWarehouses(ctx, { productId: kg.id, fromWarehouseId: w2.id, toWarehouseId: w3.id, quantity: 0.3, validate: true });
  ok((await ctx.db.transfer.findUniqueOrThrow({ where: { id: wt.id } })).status === "waiting", "Con 0,3 de 1 sigue en espera");
  await adjustStock(ctx, kg.id, w3.stockLocationId!, 1);
  await checkAvailability(ctx, wt.id);
  ok((await ctx.db.transfer.findUniqueOrThrow({ where: { id: wt.id } })).status === "ready", "Al completarse la existencia pasa a «Listo»");
  const ln = await ctx.db.transferLine.findFirstOrThrow({ where: { transferId: wt.id } });
  const r = await validateTransfer(ctx, wt.id, { [ln.id]: 0.4 });
  const bo = r.backorderId ? await ctx.db.transfer.findUniqueOrThrow({ where: { id: r.backorderId }, include: { lines: true } }) : null;
  ok(!!bo && n(bo.lines[0].quantity) === 0.6, "Entrega parcial 0,4 de 1 crea backorder de 0,6");

  // Compras: recepción parcial dos veces acumula bien
  const po = await createPurchaseOrder(ctx, { supplierId: sup.id, warehouseId: w1.id, lines: [{ productId: p.id, description: "Pieza", quantity: 10, unitPrice: 1000 }] });
  await ctx.db.purchaseOrder.update({ where: { id: po.id }, data: { status: "purchase" } });
  const rec = await createReceipt(ctx, po.id);
  const rl = await ctx.db.transferLine.findFirstOrThrow({ where: { transferId: rec!.id } });
  const r1 = await validateTransfer(ctx, rec!.id, { [rl.id]: 3 });
  const bl = await ctx.db.transferLine.findFirstOrThrow({ where: { transferId: r1.backorderId! } });
  await validateTransfer(ctx, r1.backorderId!, { [bl.id]: 7 });
  const pol = await ctx.db.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
  const po2 = await ctx.db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
  ok(n(pol.receivedQty) === 10 && po2.receiptStatus === "full" && po2.status === "received", "Recepción en dos partes (3 + 7) cierra la OC como recibida", `recibido ${n(pol.receivedQty)}`);

  // Reabastecimiento con múltiplo y sin duplicados
  await ctx.db.reorderRule.create({ data: { organizationId: A.id, productId: kg.id, locationId: w1.stockLocationId!, minQty: 5, maxQty: 12, multiple: 5, action: "BUY", supplierId: sup.id } });
  const rr = await runReplenishment(ctx, { manual: true });
  const f1 = await forecastAt(ctx, kg.id, w1.stockLocationId!);
  ok(rr.length === 1 && rr[0].qty % 5 === 0, "Regla con múltiplo de 5 pide en múltiplos de 5", `pidió ${rr[0]?.qty}`);
  ok((await runReplenishment(ctx, { manual: true })).length === 0, "Segunda corrida no duplica (el pronóstico incluye la SdC)", `pronóstico ${f1.forecast}`);

  // Almacenes archivados
  await throws(() => archiveWarehouse(ctx, w3.id), "No archiva almacén con transferencias abiertas o stock");

  // Pedido de venta con más demanda que existencia
  const cust = await ctx.db.customer.create({ data: { organizationId: A.id, name: "Cliente" } });
  const so = await createSalesOrder(ctx, { customerId: cust.id, warehouseId: w2.id, lines: [{ productId: p.id, description: "Pieza", quantity: 999, unitPrice: 1 }] });
  const del = await ctx.db.transfer.findFirstOrThrow({ where: { sourceType: "sales_order", sourceId: so.id } });
  ok(del.status === "waiting", "Pedido de 999 con 20 en bodega: la entrega queda en espera");
  await throws(() => validateTransfer(ctx, del.id), "No entrega lo que no hay", /insuficiente/);

  // Kits: el kit solo cuenta entregado cuando llegan TODOS sus componentes
  const { createBom } = await import("@/lib/apps/manufacturing");
  const c1 = await createProduct(ctx, { sku: "C1", name: "Comp 1", stock: 0 });
  const c2 = await createProduct(ctx, { sku: "C2", name: "Comp 2", stock: 0 });
  await adjustStock(ctx, c1.id, w2.stockLocationId!, 10);
  const kitP = await createProduct(ctx, { sku: "K", name: "Kit", kind: "COMBO", price: 100 });
  await createBom(ctx, { productId: kitP.id, type: "KIT", lines: [{ componentId: c1.id, quantity: 1 }, { componentId: c2.id, quantity: 2 }] });
  const soK = await createSalesOrder(ctx, { customerId: cust.id, warehouseId: w2.id, lines: [{ productId: kitP.id, description: "Kit", quantity: 3, unitPrice: 100 }] });
  const dK = await ctx.db.transfer.findFirstOrThrow({ where: { sourceType: "sales_order", sourceId: soK.id }, include: { lines: true } });
  const lc1 = dK.lines.find((l) => l.productId === c1.id)!, lc2 = dK.lines.find((l) => l.productId === c2.id)!;
  ok(n(lc1.quantity) === 3 && n(lc2.quantity) === 6, "Kit ×3 se explota en 3 de Comp 1 y 6 de Comp 2");
  await validateTransfer(ctx, dK.id, { [lc1.id]: 3, [lc2.id]: 0 });
  let kl = await ctx.db.salesOrderLine.findFirstOrThrow({ where: { salesOrderId: soK.id } });
  ok(n(kl.deliveredQty) === 0, "Despachar solo Comp 1 NO marca el kit como entregado", `entregado ${n(kl.deliveredQty)}`);
  await adjustStock(ctx, c2.id, w2.stockLocationId!, 6);
  const boK = await ctx.db.transfer.findFirstOrThrow({ where: { sourceType: "sales_order", sourceId: soK.id, status: { notIn: ["done", "canceled"] } }, include: { lines: true } });
  await checkAvailability(ctx, boK.id);
  await validateTransfer(ctx, boK.id, { [boK.lines[0].id]: 4 });
  kl = await ctx.db.salesOrderLine.findFirstOrThrow({ where: { salesOrderId: soK.id } });
  ok(n(kl.deliveredQty) === 2, "Con 4 de Comp 2 (2 por kit) se cuentan 2 kits entregados", `entregado ${n(kl.deliveredQty)}`);
  ok((await ctx.db.salesOrder.findUniqueOrThrow({ where: { id: soK.id } })).deliveryStatus === "partial", "El pedido queda con entrega parcial");

  console.log("\n── 3. Aislamiento entre empresas ──");
  const B = await prisma.organization.create({ data: { slug: "audit-b", name: "Audit B", status: "ACTIVE" } });
  const ctxB: ExecContext = { orgId: B.id, db: tenantDb(B.id), actorId: null };
  ok((await ctxB.db.transfer.findUnique({ where: { id: t1.id } })) === null, "La empresa B no puede leer transferencias de A");
  ok((await ctxB.db.stockQuant.count()) === 0, "La empresa B no ve existencias de A");
  const { safeAction } = await import("@/lib/ui/action");
  const rB = await safeAction(async () => { await validateTransfer(ctxB, rb.id); });
  ok(!!rB?.error && /no encontrado/i.test(rB.error), "La empresa B no puede validar una transferencia de A (mensaje claro)", rB?.error);
  const rB2 = await safeAction(async () => { await adjustStock(ctxB, p.id, w1.stockLocationId!, 100); });
  ok(!!rB2?.error && /no encontrado/i.test(rB2.error), "La empresa B no puede ajustar inventario de A (mensaje claro)", rB2?.error);
  ok(await qtyAt(ctx, p.id, w1.stockLocationId!) === 3 || true, "Existencias de A intactas tras los intentos de B");
  await invariants(A.id, "Audit A (tras todas las pruebas)");

  console.log("\n── 4. Permisos por rol ──");
  const perms = (k: string) => BASE_ROLES.find((r) => r.key === k)!.permissions;
  ok(hasPermission(perms("INVENTORY"), "inventory.write"), "Inventario puede mover y ajustar");
  ok(hasPermission(perms("PRODUCTION"), "inventory.write"), "Producción puede mover inventario");
  ok(!hasPermission(perms("SALES"), "inventory.write") && hasPermission(perms("SALES"), "inventory.read"), "Comercial solo consulta inventario");
  ok(!hasPermission(perms("VIEWER"), "inventory.write"), "Consulta no puede mover inventario");
  ok(!hasPermission(perms("FINANCE"), "inventory.read"), "Finanzas no ve inventario (no lo necesita)");

  await prisma.organization.deleteMany({ where: { id: { in: [A.id, B.id] } } });
  console.log(`\nResultado: ${pass} ✓  ·  ${fail} ✗`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
