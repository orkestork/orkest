import type { ExecContext } from "@/lib/core/context";
import { nextNumber } from "@/lib/core/db";
import { emitEvent } from "@/lib/core/events";
import { applyStatus, getWorkflow, initialState } from "@/lib/core/workflow";
import { addActivity } from "@/lib/core/notify";
import { ValidationError } from "./crm";
import { createTransfer, defaultWarehouse, operationType } from "./stock";
import { findBom } from "./manufacturing";

/**
 * Pedidos de venta: confirmados desde una cotización o directamente.
 * Generan la orden de entrega (los kits se explotan en componentes),
 * siguen lo entregado y lo facturado según la política de cada producto.
 */
const num = (v: unknown) => Number(v ?? 0);

/** Precio según lista de precios: regla de producto > categoría > general, mayor cantidad mínima aplicable. */
export async function priceFor(ctx: ExecContext, pricelistId: string | null | undefined, productId: string, qty: number) {
  const p = await ctx.db.product.findUniqueOrThrow({ where: { id: productId } });
  const base = num(p.price);
  if (!pricelistId) return base;
  const pl = await ctx.db.pricelist.findUnique({ where: { id: pricelistId }, include: { items: true } });
  if (!pl) return base;
  const candidates = pl.items
    .filter((i) => num(i.minQty) <= qty && (i.productId === productId || (!i.productId && i.category && i.category === p.category) || (!i.productId && !i.category)))
    .sort((a, b) => (a.productId ? 0 : a.category ? 1 : 2) - (b.productId ? 0 : b.category ? 1 : 2) || num(b.minQty) - num(a.minQty));
  const rule = candidates[0];
  if (!rule) return base;
  if (rule.fixedPrice !== null) return num(rule.fixedPrice);
  return Math.round(base * (1 - num(rule.discountPct) / 100) * 100) / 100;
}

type LineIn = { productId?: string | null; description: string; quantity: number; unitPrice: number; discountPct?: number; taxRate?: number };

export async function createSalesOrder(ctx: ExecContext, d: {
  customerId: string; lines: LineIn[]; warehouseId?: string; pricelistId?: string | null; paymentTermId?: string | null;
  quoteId?: string | null; commitmentAt?: string | Date | null;
}) {
  const customer = await ctx.db.customer.findUnique({ where: { id: d.customerId } });
  if (!customer) throw new ValidationError({ customerId: "Cliente no encontrado" });
  const lines = d.lines.filter((l) => l.quantity > 0);
  if (!lines.length) throw new ValidationError({ lines: "Agrega al menos una línea" });
  const rows = lines.map((l) => {
    const disc = num(l.discountPct);
    const total = Math.round(l.quantity * l.unitPrice * (1 - disc / 100) * 100) / 100;
    return { ...l, discountPct: disc, taxRate: num(l.taxRate ?? 19), total };
  });
  const subtotal = rows.reduce((s, l) => s + l.total, 0);
  const tax = Math.round(rows.reduce((s, l) => s + (l.total * l.taxRate) / 100, 0) * 100) / 100;
  const wf = await getWorkflow(ctx.db, "sales_order");
  const wh = d.warehouseId ? { id: d.warehouseId } : await defaultWarehouse(ctx).catch(() => null);
  if (!wh) throw new ValidationError({ warehouseId: "Configura un almacén para despachar pedidos" });

  const so = await ctx.db.salesOrder.create({
    data: {
      organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "PV"), customerId: d.customerId, quoteId: d.quoteId ?? null,
      warehouseId: wh.id, pricelistId: d.pricelistId ?? customer.pricelistId, paymentTermId: d.paymentTermId ?? customer.paymentTermId,
      status: initialState(wf, "confirmed"), subtotal, tax, total: subtotal + tax, ownerId: ctx.actorId,
      commitmentAt: d.commitmentAt ? new Date(d.commitmentAt) : null,
      lines: { create: rows.map((l) => ({ productId: l.productId || null, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxRate: l.taxRate, total: l.total })) },
    },
  });
  await emitEvent(ctx, "SalesOrderConfirmed", "sales_order", so.id, { number: so.number, total: subtotal + tax });
  await createDelivery(ctx, so.id);
  await recomputeInvoiceStatus(ctx, so.id);
  return so;
}

/** Acción CREATE_SALES_ORDER: convierte la cotización en pedido. */
export async function salesOrderFromQuote(ctx: ExecContext, quoteId: string) {
  const exists = await ctx.db.salesOrder.findFirst({ where: { quoteId } });
  if (exists) return exists;
  const q = await ctx.db.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lines: { orderBy: { position: "asc" } } } });
  const so = await createSalesOrder(ctx, {
    customerId: q.customerId, quoteId: q.id, pricelistId: q.pricelistId, paymentTermId: q.paymentTermId,
    lines: q.lines.filter((l) => l.kind === "PRODUCT").map((l) => ({ productId: l.productId, description: l.description, quantity: num(l.quantity), unitPrice: num(l.unitPrice), discountPct: num(l.discountPct), taxRate: num(l.taxRate) })),
  });
  await addActivity(ctx, "quote", q.id, `Convertida en pedido ${so.number}`);
  return so;
}

/** Genera la entrega de lo pendiente. Kits: se entregan sus componentes. */
export async function createDelivery(ctx: ExecContext, soId: string) {
  const so = await ctx.db.salesOrder.findUniqueOrThrow({ where: { id: soId }, include: { lines: true, customer: true } });
  const open = await ctx.db.transfer.findFirst({ where: { sourceType: "sales_order", sourceId: so.id, status: { notIn: ["done", "canceled"] } } });
  if (open) return open;
  const products = new Map((await ctx.db.product.findMany({ where: { id: { in: so.lines.map((l) => l.productId ?? "") } } })).map((p) => [p.id, p]));
  const lines: { productId: string; quantity: number; description?: string; sourceLineId: string }[] = [];
  for (const l of so.lines) {
    const p = l.productId ? products.get(l.productId) : undefined;
    const pending = num(l.quantity) - num(l.deliveredQty);
    if (!p || pending <= 0) continue;
    const kit = p.kind !== "SERVICE" ? await findBom(ctx, p.id, "KIT") : null;
    if (kit && kit.type === "KIT") {
      kit.lines.forEach((c, i) => {
        const perUnit = num(c.quantity) / num(kit.quantity);
        // sourceLineId = línea|cantidad por unidad|¿cuenta para lo entregado?
        lines.push({ productId: c.componentId, quantity: pending * perUnit, description: `${p.name} (kit)`, sourceLineId: `${l.id}|${perUnit}|${i === 0 ? 1 : 0}` });
      });
    } else if (p.kind === "GOODS") {
      lines.push({ productId: p.id, quantity: pending, description: l.description, sourceLineId: `${l.id}|1|1` });
    }
  }
  if (!lines.length) return null;
  const op = await operationType(ctx, so.warehouseId, "DELIVERY");
  const t = await createTransfer(ctx, { operationTypeId: op.id, lines, origin: so.number, sourceType: "sales_order", sourceId: so.id, partnerName: so.customer.name, scheduledAt: so.commitmentAt ?? undefined });
  await addActivity(ctx, "sales_order", so.id, `Entrega ${t.number} generada`);
  return t;
}

/**
 * Recalcula lo entregado de cada línea a partir de las entregas validadas (idempotente).
 * Un kit cuenta como entregado solo en la proporción del componente MÁS atrasado.
 */
export async function onDeliveryDone(ctx: ExecContext, soId: string, _moved?: { sourceLineId: string | null; qty: number }[]) {
  const so = await ctx.db.salesOrder.findUniqueOrThrow({ where: { id: soId }, include: { lines: true } });
  const deliveries = await ctx.db.transfer.findMany({ where: { sourceType: "sales_order", sourceId: so.id, status: "done" }, include: { lines: true } });
  // por línea del pedido → por componente: unidades de kit equivalentes entregadas
  const perLine = new Map<string, Map<string, number>>();
  for (const l of deliveries.flatMap((t) => t.lines)) {
    if (!l.sourceLineId) continue;
    const [lineId, perUnit] = l.sourceLineId.split("|");
    const byComp = perLine.get(lineId) ?? new Map<string, number>();
    byComp.set(l.productId, (byComp.get(l.productId) ?? 0) + num(l.doneQty) / Number(perUnit || 1));
    perLine.set(lineId, byComp);
  }
  for (const line of so.lines) {
    const byComp = perLine.get(line.id);
    if (!byComp) continue;
    const kit = line.productId ? await findBom(ctx, line.productId, "KIT") : null;
    const expected = kit && kit.type === "KIT" ? kit.lines.map((c) => c.componentId) : [line.productId!];
    const delivered = Math.min(...expected.map((pid) => byComp.get(pid) ?? 0));
    await ctx.db.salesOrderLine.update({ where: { id: line.id }, data: { deliveredQty: Math.round(delivered * 1000) / 1000 } });
  }
  const fresh = await ctx.db.salesOrder.findUniqueOrThrow({ where: { id: soId }, include: { lines: true } });
  const goods = new Set((await ctx.db.product.findMany({ where: { id: { in: fresh.lines.map((l) => l.productId ?? "") }, kind: { not: "SERVICE" } }, select: { id: true } })).map((p) => p.id));
  const tracked = fresh.lines.filter((l) => l.productId && goods.has(l.productId));
  const full = tracked.every((l) => num(l.deliveredQty) >= num(l.quantity) - 1e-6);
  const any = tracked.some((l) => num(l.deliveredQty) > 0) || deliveries.length > 0;
  await ctx.db.salesOrder.update({ where: { id: so.id }, data: { deliveryStatus: full ? "full" : any ? "partial" : "none" } });
  await emitEvent(ctx, "DeliveryDone", "sales_order", so.id, { number: so.number, full });
  await recomputeInvoiceStatus(ctx, so.id);
}

/** Cantidad facturable por línea según política: lo pedido o lo entregado. */
export async function invoiceableLines(ctx: ExecContext, soId: string) {
  const so = await ctx.db.salesOrder.findUniqueOrThrow({ where: { id: soId }, include: { lines: true } });
  const products = new Map((await ctx.db.product.findMany({ where: { id: { in: so.lines.map((l) => l.productId ?? "") } } })).map((p) => [p.id, p]));
  return so.lines.map((l) => {
    const p = l.productId ? products.get(l.productId) : undefined;
    const base = p?.invoicePolicy === "DELIVERY" && p.kind !== "SERVICE" ? num(l.deliveredQty) : num(l.quantity);
    return { line: l, qty: Math.max(0, Math.round((base - num(l.invoicedQty)) * 1000) / 1000) };
  });
}

export async function recomputeInvoiceStatus(ctx: ExecContext, soId: string) {
  const rows = await invoiceableLines(ctx, soId);
  const allInvoiced = rows.every((r) => num(r.line.invoicedQty) >= num(r.line.quantity) - 1e-6);
  const toInvoice = rows.some((r) => r.qty > 0);
  const some = rows.some((r) => num(r.line.invoicedQty) > 0);
  const invoiceStatus = allInvoiced ? "invoiced" : toInvoice ? "to_invoice" : some ? "partial" : "none";
  const so = await ctx.db.salesOrder.update({ where: { id: soId }, data: { invoiceStatus } });
  if (invoiceStatus === "invoiced" && (so.deliveryStatus === "full" || !(await ctx.db.transfer.count({ where: { sourceType: "sales_order", sourceId: soId } }))) && so.status === "confirmed") {
    await applyStatus(ctx, "sales_order", so.id, "done", "Entregado y facturado");
  }
}
