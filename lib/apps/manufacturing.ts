import { z } from "zod";
import type { ExecContext } from "@/lib/core/context";
import { nextNumber } from "@/lib/core/db";
import { getWorkflow, initialState, applyStatus } from "@/lib/core/workflow";
import { addActivity } from "@/lib/core/notify";
import { emitEvent } from "@/lib/core/events";
import { ValidationError } from "./crm";
import { defaultWarehouse, moveNow, operationType, qtyAt, virtualLocation } from "./stock";

/**
 * Manufactura: Listas de materiales (BoM normal o kit), órdenes de producción con
 * consumo de componentes y órdenes de trabajo por centro de trabajo.
 * Producir = consumir componentes (Existencias → Producción) + ingresar terminado (Producción → Existencias).
 */
const num = (v: unknown) => Number(v ?? 0);

export const BomInput = z.object({
  productId: z.string().min(1, "Selecciona el producto a fabricar"),
  code: z.string().optional(),
  type: z.enum(["NORMAL", "KIT"]).default("NORMAL"),
  quantity: z.coerce.number().positive().default(1),
  lines: z.array(z.object({ componentId: z.string().min(1), quantity: z.coerce.number().positive("Cantidad > 0") })).min(1, "Agrega al menos un componente"),
  operations: z.array(z.object({ workCenterId: z.string().min(1), name: z.string().min(1), durationMinutes: z.coerce.number().int().positive() })).default([]),
});

export async function createBom(ctx: ExecContext, raw: unknown) {
  const p = BomInput.safeParse(raw);
  if (!p.success) throw new ValidationError(Object.fromEntries(p.error.issues.map((i) => [i.path.join("."), i.message])));
  const d = p.data;
  if (d.lines.some((l) => l.componentId === d.productId)) throw new ValidationError({ lines: "Un producto no puede ser componente de sí mismo" });
  return ctx.db.bom.create({
    data: {
      organizationId: ctx.orgId, productId: d.productId, code: d.code || null, type: d.type, quantity: d.quantity,
      lines: { create: d.lines.map((l) => ({ componentId: l.componentId, quantity: l.quantity })) },
      operations: { create: d.operations.map((o, i) => ({ ...o, position: i })) },
    },
  });
}

export async function findBom(ctx: ExecContext, productId: string, type?: "NORMAL" | "KIT") {
  return ctx.db.bom.findFirst({ where: { productId, active: true, ...(type ? { type } : {}) }, include: { lines: true, operations: { orderBy: { position: "asc" } } }, orderBy: { type: "desc" } });
}

export async function createProduction(ctx: ExecContext, d: { productId: string; quantity: number; warehouseId?: string; bomId?: string; origin?: string; scheduledAt?: string | Date }) {
  if (!(d.quantity > 0)) throw new ValidationError({ quantity: "Cantidad debe ser > 0" });
  const bom = d.bomId
    ? await ctx.db.bom.findUnique({ where: { id: d.bomId }, include: { lines: true, operations: { orderBy: { position: "asc" } } } })
    : await findBom(ctx, d.productId, "NORMAL");
  if (!bom || bom.type !== "NORMAL") throw new ValidationError({ bomId: "El producto no tiene una lista de materiales de fabricación" });
  const wh = d.warehouseId ? await ctx.db.warehouse.findUniqueOrThrow({ where: { id: d.warehouseId } }) : await defaultWarehouse(ctx);
  const factor = d.quantity / num(bom.quantity);
  const wf = await getWorkflow(ctx.db, "production");
  const mo = await ctx.db.productionOrder.create({
    data: {
      organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "OP"), productId: d.productId, bomId: bom.id,
      quantity: d.quantity, warehouseId: wh.id, srcLocationId: wh.stockLocationId!, destLocationId: wh.stockLocationId!,
      origin: d.origin, scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : new Date(), ownerId: ctx.actorId,
      status: initialState(wf, "draft"),
      components: { create: bom.lines.map((l) => ({ productId: l.componentId, required: Math.round(num(l.quantity) * factor * 1000) / 1000 })) },
      workOrders: { create: bom.operations.map((o, i) => ({ workCenterId: o.workCenterId, name: o.name, expectedMinutes: Math.round(o.durationMinutes * factor), position: i })) },
    },
  });
  await emitEvent(ctx, "ProductionCreated", "production", mo.id, { number: mo.number, quantity: d.quantity });
  return mo;
}

export async function componentAvailability(ctx: ExecContext, productionId: string) {
  const mo = await ctx.db.productionOrder.findUniqueOrThrow({ where: { id: productionId }, include: { components: true } });
  const products = new Map((await ctx.db.product.findMany({ where: { id: { in: mo.components.map((c) => c.productId) } } })).map((p) => [p.id, p]));
  return Promise.all(mo.components.map(async (c) => {
    const available = await qtyAt(ctx, c.productId, mo.srcLocationId);
    const pending = num(c.required) - num(c.consumed);
    return { id: c.id, productId: c.productId, name: products.get(c.productId)?.name ?? "", unit: products.get(c.productId)?.unit ?? "", required: num(c.required), consumed: num(c.consumed), pending, available, missing: Math.max(0, pending - available) };
  }));
}

/** Registra producción (total o parcial): consume componentes proporcionalmente e ingresa el terminado. */
export async function produce(ctx: ExecContext, productionId: string, qty?: number) {
  const mo = await ctx.db.productionOrder.findUniqueOrThrow({ where: { id: productionId }, include: { components: true, workOrders: true } });
  if (!["confirmed", "in_progress"].includes(mo.status)) throw new ValidationError({ status: "La orden debe estar confirmada o en proceso" });
  const remaining = num(mo.quantity) - num(mo.producedQty);
  const q = qty === undefined ? remaining : Math.min(qty, remaining);
  if (!(q > 0)) throw new ValidationError({ quantity: "Cantidad a producir inválida" });
  const ratio = q / num(mo.quantity);
  const prodLoc = await virtualLocation(ctx, "PRODUCTION");
  const op = await operationType(ctx, mo.warehouseId, "MANUFACTURING");

  const consume = mo.components.map((c) => ({ c, qty: Math.round(num(c.required) * ratio * 1000) / 1000 })).filter((x) => x.qty > 0);
  if (consume.length) {
    await moveNow(ctx, { // lanza error (y cancela) si faltan componentes
      operationTypeId: op.id, srcLocationId: mo.srcLocationId, destLocationId: prodLoc.id, origin: mo.number, sourceType: "production", sourceId: mo.id,
      lines: consume.map((x) => ({ productId: x.c.productId, quantity: x.qty })),
    });
    for (const x of consume) await ctx.db.productionComponent.update({ where: { id: x.c.id }, data: { consumed: { increment: x.qty } } });
  }
  await moveNow(ctx, {
    operationTypeId: op.id, srcLocationId: prodLoc.id, destLocationId: mo.destLocationId, origin: mo.number, sourceType: "production", sourceId: mo.id,
    lines: [{ productId: mo.productId, quantity: q }],
  });

  const produced = num(mo.producedQty) + q;
  await ctx.db.productionOrder.update({ where: { id: mo.id }, data: { producedQty: produced, ...(mo.startedAt ? {} : { startedAt: new Date() }) } });
  if (mo.status === "confirmed") await applyStatus(ctx, "production", mo.id, "in_progress", "Producción registrada");

  // Costo real unitario = componentes (a costo) / cantidad
  const comps = await ctx.db.product.findMany({ where: { id: { in: consume.map((x) => x.c.productId) } } });
  const cost = consume.reduce((s, x) => s + x.qty * num(comps.find((p) => p.id === x.c.productId)?.cost), 0) / q;
  await addActivity(ctx, "production", mo.id, `Producidas ${q} unidades · costo de materiales ${Math.round(cost).toLocaleString("es-CO")} c/u`);

  if (produced >= num(mo.quantity)) {
    await ctx.db.workOrder.updateMany({ where: { productionId: mo.id, status: { not: "done" } }, data: { status: "done", doneAt: new Date() } });
    await applyStatus(ctx, "production", mo.id, "done", "Producción completa");
  }
  return { produced: q };
}

export async function workOrderAction(ctx: ExecContext, workOrderId: string, action: "start" | "finish") {
  const wo = await ctx.db.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, include: { production: true } });
  const mo = await ctx.db.productionOrder.findUniqueOrThrow({ where: { id: wo.productionId } }); // valida tenencia
  if (action === "start") {
    if (mo.status === "confirmed") await applyStatus(ctx, "production", mo.id, "in_progress", `Inicio: ${wo.name}`);
    await ctx.db.workOrder.update({ where: { id: wo.id }, data: { status: "in_progress", startedAt: new Date() } });
  } else {
    const minutes = wo.startedAt ? Math.max(1, Math.round((Date.now() - wo.startedAt.getTime()) / 60000)) : wo.expectedMinutes;
    await ctx.db.workOrder.update({ where: { id: wo.id }, data: { status: "done", doneAt: new Date(), realMinutes: minutes } });
  }
}

/** Planificación de materiales: faltantes de componentes de las órdenes abiertas. */
export async function materialsPlan(ctx: ExecContext) {
  const orders = await ctx.db.productionOrder.findMany({ where: { status: { in: ["draft", "confirmed", "in_progress"] } }, include: { components: true } });
  const need = new Map<string, { productId: string; locationId: string; required: number; orders: string[] }>();
  for (const o of orders) for (const c of o.components) {
    const k = `${c.productId}:${o.srcLocationId}`;
    const cur = need.get(k) ?? { productId: c.productId, locationId: o.srcLocationId, required: 0, orders: [] };
    cur.required += num(c.required) - num(c.consumed);
    cur.orders.push(o.number);
    need.set(k, cur);
  }
  const products = new Map((await ctx.db.product.findMany({ where: { id: { in: [...need.values()].map((n) => n.productId) } } })).map((p) => [p.id, p]));
  const rows = [];
  for (const n of need.values()) {
    const onHand = await qtyAt(ctx, n.productId, n.locationId);
    const incoming = (await ctx.db.transfer.findMany({ where: { destLocationId: n.locationId, status: { notIn: ["done", "canceled"] } }, include: { lines: { where: { productId: n.productId } } } }))
      .flatMap((t) => t.lines).reduce((s, l) => s + num(l.quantity) - num(l.doneQty), 0);
    const p = products.get(n.productId);
    rows.push({ ...n, name: p?.name ?? "", sku: p?.sku ?? "", unit: p?.unit ?? "", supplierId: p?.defaultSupplierId ?? null, cost: num(p?.cost), taxRate: num(p?.taxRate), onHand, incoming, shortage: Math.max(0, n.required - onHand - incoming) });
  }
  return rows.sort((a, b) => b.shortage - a.shortage);
}

/** Crea solicitudes de cotización por los faltantes (agrupadas por proveedor). */
export async function buyShortages(ctx: ExecContext) {
  const plan = await materialsPlan(ctx);
  const { addToReplenishmentRfq } = await import("./purchasing");
  const out: string[] = [];
  for (const r of plan.filter((x) => x.shortage > 0)) {
    const loc = await ctx.db.location.findUnique({ where: { id: r.locationId } });
    if (!r.supplierId || !loc?.warehouseId) { out.push(`${r.name}: sin proveedor por defecto`); continue; }
    const po = await addToReplenishmentRfq(ctx, { supplierId: r.supplierId, warehouseId: loc.warehouseId, productId: r.productId, description: r.name, quantity: r.shortage, unitPrice: r.cost, taxRate: r.taxRate });
    out.push(`${r.name}: ${r.shortage} ${r.unit} → ${po.number}`);
  }
  return out;
}
