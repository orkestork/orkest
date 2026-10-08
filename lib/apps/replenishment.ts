import type { ExecContext } from "@/lib/core/context";
import { createTransfer, operationType, qtyAt } from "./stock";

/**
 * Reabastecimiento mín/máx (equivalente a orderpoints + rutas).
 * Pronóstico = existencia + entradas pendientes − salidas pendientes − consumos de producción comprometidos.
 * Si pronóstico < mínimo → reponer hasta el máximo (redondeado al múltiplo) con:
 *   BUY (solicitud de cotización al proveedor) · TRANSFER (desde otra bodega) · MANUFACTURE (orden de producción)
 */
const num = (v: unknown) => Number(v ?? 0);

export async function forecastAt(ctx: ExecContext, productId: string, locationId: string) {
  const onHand = await qtyAt(ctx, productId, locationId);
  const open = { status: { notIn: ["done", "canceled"] } };
  const [incoming, outgoing] = await Promise.all([
    ctx.db.transfer.findMany({ where: { ...open, destLocationId: locationId }, include: { lines: { where: { productId } } } }),
    ctx.db.transfer.findMany({ where: { ...open, srcLocationId: locationId }, include: { lines: { where: { productId } } } }),
  ]);
  const sum = (ts: typeof incoming) => ts.flatMap((t) => t.lines).reduce((s, l) => s + num(l.quantity) - num(l.doneQty), 0);

  // Compras aún sin recepción (SdC/por aprobar) hacia el almacén de esta ubicación
  const loc = await ctx.db.location.findUnique({ where: { id: locationId } });
  let rfq = 0;
  if (loc?.warehouseId) {
    const pos = await ctx.db.purchaseOrder.findMany({ where: { warehouseId: loc.warehouseId, status: { in: ["draft", "sent", "to_approve"] } }, include: { lines: { where: { productId } } } });
    rfq = pos.flatMap((p) => p.lines).reduce((s, l) => s + num(l.quantity), 0);
  }
  // Producción: lo que se va a fabricar aquí y lo que se va a consumir de aquí
  const prodIn = await ctx.db.productionOrder.findMany({ where: { productId, destLocationId: locationId, status: { in: ["draft", "confirmed", "in_progress"] } } });
  const prodOut = await ctx.db.productionOrder.findMany({ where: { srcLocationId: locationId, status: { in: ["confirmed", "in_progress"] } }, include: { components: { where: { productId } } } });
  const produce = prodIn.reduce((s, p) => s + num(p.quantity) - num(p.producedQty), 0);
  const consume = prodOut.flatMap((p) => p.components).reduce((s, c) => s + num(c.required) - num(c.consumed), 0);

  return { onHand, forecast: onHand + sum(incoming) + rfq + produce - sum(outgoing) - consume };
}

export type ReplenishResult = { rule: string; product: string; action: string; qty: number; document?: string; skipped?: string };

export async function runReplenishment(ctx: ExecContext, opts: { productIds?: string[]; manual?: boolean; ruleIds?: string[] } = {}) {
  const rules = await ctx.db.reorderRule.findMany({
    where: {
      active: true,
      ...(opts.manual ? {} : { trigger: "AUTO" }),
      ...(opts.productIds ? { productId: { in: opts.productIds } } : {}),
      ...(opts.ruleIds ? { id: { in: opts.ruleIds } } : {}),
    },
  });
  const results: ReplenishResult[] = [];
  for (const r of rules) {
    const product = await ctx.db.product.findUnique({ where: { id: r.productId } });
    if (!product || !product.active) continue;
    const { forecast } = await forecastAt(ctx, r.productId, r.locationId);
    if (forecast >= num(r.minQty)) continue;
    const mult = Math.max(num(r.multiple), 1e-9);
    const qty = Math.ceil((num(r.maxQty) - forecast) / mult) * mult;
    if (qty <= 0) continue;
    const loc = await ctx.db.location.findUniqueOrThrow({ where: { id: r.locationId } });
    const base = { rule: r.id, product: product.name, action: r.action, qty };

    if (r.action === "BUY") {
      const supplierId = r.supplierId ?? product.defaultSupplierId;
      if (!supplierId || !loc.warehouseId) { results.push({ ...base, skipped: "Sin proveedor configurado" }); continue; }
      const { addToReplenishmentRfq } = await import("./purchasing");
      const po = await addToReplenishmentRfq(ctx, { supplierId, warehouseId: loc.warehouseId, productId: product.id, description: product.name, quantity: qty, unitPrice: num(product.cost), taxRate: num(product.taxRate) });
      results.push({ ...base, document: po.number });
    } else if (r.action === "TRANSFER") {
      if (!r.sourceLocationId || !loc.warehouseId) { results.push({ ...base, skipped: "Sin ubicación de origen" }); continue; }
      const op = await operationType(ctx, loc.warehouseId, "INTERNAL");
      const t = await createTransfer(ctx, {
        operationTypeId: op.id, srcLocationId: r.sourceLocationId, destLocationId: r.locationId,
        lines: [{ productId: product.id, quantity: qty }], origin: "Reabastecimiento", sourceType: "replenishment", sourceId: r.id,
      });
      results.push({ ...base, document: t.number });
    } else if (r.action === "MANUFACTURE") {
      if (!loc.warehouseId) { results.push({ ...base, skipped: "Ubicación sin almacén" }); continue; }
      const { createProduction } = await import("./manufacturing");
      try {
        const mo = await createProduction(ctx, { productId: product.id, quantity: qty, warehouseId: loc.warehouseId, origin: "Reabastecimiento" });
        results.push({ ...base, document: mo.number });
      } catch (e) {
        results.push({ ...base, skipped: e instanceof Error ? e.message : String(e) });
      }
    }
    await ctx.db.reorderRule.update({ where: { id: r.id }, data: { lastRunAt: new Date() } });
  }
  return results;
}
