import "dotenv/config";
import { prisma } from "@/lib/core/prisma";
import { tenantDb } from "@/lib/core/db";
import type { ExecContext, OrgContext } from "@/lib/core/context";
import { ensureBaseRoles, applyTemplate } from "@/lib/templates/apply";
import { createWarehouse, qtyAt } from "@/lib/apps/stock";
import { createProduct } from "@/lib/apps/inventory";
import { buyShortages, componentAvailability, createBom, createProduction, materialsPlan, produce } from "@/lib/apps/manufacturing";
import { executeTransition, getWorkflow } from "@/lib/core/workflow";
import { runReplenishment } from "@/lib/apps/replenishment";

async function main() {
  await prisma.organization.deleteMany({ where: { slug: "test-f2" } });
  const o = await prisma.organization.create({ data: { slug: "test-f2", name: "Test F2", status: "ACTIVE" } });
  const u = await prisma.user.upsert({ where: { email: "test-f1@x.co" }, update: {}, create: { email: "test-f1@x.co", name: "Tester", passwordHash: "x" } });
  const base: ExecContext = { orgId: o.id, db: tenantDb(o.id), actorId: u.id };
  await ensureBaseRoles(base);
  const ctx = { ...base, user: { ...u, isPlatformAdmin: false }, role: { id: "x", key: "OWNER", name: "x" }, can: () => true, hasModule: () => true } as unknown as OrgContext;
  const plt = await createWarehouse(ctx, { code: "PLT", name: "Planta" });
  await applyTemplate(ctx, "manufacturing");
  const sup = await ctx.db.supplier.create({ data: { organizationId: o.id, name: "Aceros" } });
  const lam = await createProduct(ctx, { sku: "LAM", name: "Lámina", cost: 500000, stock: 5, defaultSupplierId: sup.id });
  const val = await createProduct(ctx, { sku: "VAL", name: "Válvula", cost: 100000, stock: 10, defaultSupplierId: sup.id });
  const tank = await createProduct(ctx, { sku: "TQ", name: "Tanque", price: 20000000 });
  const wc = await ctx.db.workCenter.create({ data: { organizationId: o.id, code: "SOL", name: "Soldadura" } });
  await createBom(ctx, { productId: tank.id, lines: [{ componentId: lam.id, quantity: 2 }, { componentId: val.id, quantity: 1 }], operations: [{ workCenterId: wc.id, name: "Soldar", durationMinutes: 120 }] });
  const mo = await createProduction(ctx, { productId: tank.id, quantity: 4, warehouseId: plt.id });
  console.log("1. OP:", mo.number, "componentes:", (await componentAvailability(ctx, mo.id)).map((c) => `${c.name} req ${c.required} disp ${c.available} falta ${c.missing}`));
  const wf = await getWorkflow(ctx.db, "production");
  await executeTransition(ctx, "production", mo.id, wf!.transitions.find((t) => t.toKey === "confirmed")!.id);
  try { await produce(ctx, mo.id); } catch (e) { console.log("2. producir todo bloqueado:", (e as Error).message.slice(0, 70)); }
  console.log("   sin transferencias fantasma:", await ctx.db.transfer.count({ where: { sourceType: "production", status: { notIn: ["done", "canceled"] } } }));
  await produce(ctx, mo.id, 2);
  const m2 = await ctx.db.productionOrder.findUniqueOrThrow({ where: { id: mo.id } });
  console.log("3. producción parcial → estado", m2.status, "producido", Number(m2.producedQty), "| lámina", await qtyAt(ctx, lam.id, plt.stockLocationId!), "| tanques", await qtyAt(ctx, tank.id, plt.stockLocationId!));
  console.log("4. plan:", (await materialsPlan(ctx)).map((r) => `${r.name} req ${r.required} falta ${r.shortage}`));
  console.log("5. comprar faltantes:", await buyShortages(ctx));
  // Regla MANUFACTURE
  await ctx.db.reorderRule.create({ data: { organizationId: o.id, productId: tank.id, locationId: plt.stockLocationId!, minQty: 5, maxQty: 6, action: "MANUFACTURE" } });
  console.log("6. regla fabricar:", (await runReplenishment(ctx, { manual: true })).map((r) => `${r.product} ${r.qty} → ${r.document ?? r.skipped}`));
  // Kit
  const kit = await createProduct(ctx, { sku: "KIT", name: "Kit repuestos", price: 300000, kind: "COMBO" });
  await createBom(ctx, { productId: kit.id, type: "KIT", lines: [{ componentId: val.id, quantity: 2 }] });
  const { createSalesOrder } = await import("@/lib/apps/sales-orders");
  const cust = await ctx.db.customer.create({ data: { organizationId: o.id, name: "Cliente" } });
  const so = await createSalesOrder(ctx, { customerId: cust.id, warehouseId: plt.id, lines: [{ productId: kit.id, description: "Kit", quantity: 2, unitPrice: 300000 }, { productId: tank.id, description: "Tanque", quantity: 1, unitPrice: 20000000 }] });
  const del = await ctx.db.transfer.findFirstOrThrow({ where: { sourceType: "sales_order", sourceId: so.id }, include: { lines: true } });
  console.log("7. pedido con kit → entrega", del.number, del.status, del.lines.map((l) => `${l.description}:${Number(l.quantity)}`));
  await prisma.organization.delete({ where: { id: o.id } });
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
