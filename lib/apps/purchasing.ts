import { z } from "zod";
import type { ExecContext } from "@/lib/core/context";
import { nextNumber } from "@/lib/core/db";
import { emitEvent } from "@/lib/core/events";
import { getFieldDefs, validateCustomFields } from "@/lib/core/custom-fields";
import { applyStatus, getWorkflow, initialState } from "@/lib/core/workflow";
import { addActivity } from "@/lib/core/notify";
import { ValidationError } from "./crm";
import { createTransfer, defaultWarehouse, operationType } from "./stock";

/**
 * Compras: Requisición → (aprobación) → Solicitud de cotización → Orden de compra
 * (aprobación por monto configurable en el workflow) → Recepción → Factura de proveedor.
 */
const num = (v: unknown) => Number(v ?? 0);
const issues = (e: z.ZodError) => Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));

// ───────── Requisiciones ─────────
export const RequisitionInput = z.object({
  area: z.string().trim().optional(),
  neededBy: z.string().optional(),
  suggestedSupplier: z.string().trim().optional(),
  warehouseId: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(z.object({
    productId: z.string().optional().nullable(),
    description: z.string().trim().min(1, "Descripción requerida"),
    quantity: z.coerce.number().positive("Cantidad debe ser > 0"),
  })).min(1, "Agrega al menos un producto"),
  customFields: z.record(z.string(), z.unknown()).default({}),
});

export async function createRequisition(ctx: ExecContext, raw: unknown) {
  const p = RequisitionInput.safeParse(raw);
  if (!p.success) throw new ValidationError(issues(p.error));
  const cf = validateCustomFields(await getFieldDefs(ctx.db, "requisition"), p.data.customFields);
  if (!cf.ok) throw new ValidationError(cf.errors);
  const wf = await getWorkflow(ctx.db, "requisition");
  const r = await ctx.db.requisition.create({
    data: {
      organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "RQ"), requesterId: ctx.actorId!,
      area: p.data.area || null, neededBy: p.data.neededBy ? new Date(p.data.neededBy) : null,
      suggestedSupplier: p.data.suggestedSupplier || null, warehouseId: p.data.warehouseId || null, notes: p.data.notes || null,
      status: initialState(wf, "draft"), customFields: cf.values as object,
      lines: { create: p.data.lines.map((l) => ({ productId: l.productId || null, description: l.description, quantity: l.quantity })) },
    },
  });
  await emitEvent(ctx, "RequisitionCreated", "requisition", r.id, { number: r.number, area: r.area });
  return r;
}

/** Genera una solicitud de cotización a partir de una requisición aprobada. */
export async function rfqFromRequisition(ctx: ExecContext, requisitionId: string, supplierId: string) {
  const r = await ctx.db.requisition.findUniqueOrThrow({ where: { id: requisitionId }, include: { lines: true } });
  if (r.status !== "approved") throw new ValidationError({ status: "La requisición debe estar aprobada" });
  const products = new Map((await ctx.db.product.findMany({ where: { id: { in: r.lines.map((l) => l.productId ?? "") } } })).map((p) => [p.id, p]));
  const po = await createPurchaseOrder(ctx, {
    supplierId, warehouseId: r.warehouseId ?? (await defaultWarehouse(ctx)).id, requisitionId: r.id, origin: r.number,
    expectedAt: r.neededBy?.toISOString(),
    lines: r.lines.map((l) => {
      const p = l.productId ? products.get(l.productId) : undefined;
      return { productId: l.productId, description: l.description, quantity: num(l.quantity), unitPrice: num(p?.cost), taxRate: num(p?.taxRate ?? 19) };
    }),
  });
  await applyStatus(ctx, "requisition", r.id, "ordered", `SdC ${po.number}`);
  return po;
}

// ───────── Órdenes de compra ─────────
export const PurchaseOrderInput = z.object({
  supplierId: z.string().min(1, "Selecciona un proveedor"),
  warehouseId: z.string().min(1, "Selecciona el almacén de destino"),
  requisitionId: z.string().optional().nullable(),
  origin: z.string().optional().nullable(),
  expectedAt: z.string().optional().nullable(),
  notes: z.string().optional(),
  lines: z.array(z.object({
    productId: z.string().optional().nullable(),
    description: z.string().trim().min(1, "Descripción requerida"),
    quantity: z.coerce.number().positive("Cantidad debe ser > 0"),
    unitPrice: z.coerce.number().min(0, "Precio inválido"),
    taxRate: z.coerce.number().min(0).max(100).default(19),
  })).min(1, "Agrega al menos una línea"),
  customFields: z.record(z.string(), z.unknown()).default({}),
});

function totals<T extends { quantity: number; unitPrice: number; taxRate: number }>(lines: T[]) {
  const rows = lines.map((l) => ({ ...l, total: Math.round(l.quantity * l.unitPrice * 100) / 100 }));
  const subtotal = rows.reduce((s, l) => s + l.total, 0);
  const tax = Math.round(rows.reduce((s, l) => s + (l.total * l.taxRate) / 100, 0) * 100) / 100;
  return { rows, subtotal, tax, total: subtotal + tax };
}

export async function createPurchaseOrder(ctx: ExecContext, raw: unknown) {
  const p = PurchaseOrderInput.safeParse(raw);
  if (!p.success) throw new ValidationError(issues(p.error));
  const d = p.data;
  if (!(await ctx.db.supplier.findUnique({ where: { id: d.supplierId } }))) throw new ValidationError({ supplierId: "Proveedor no encontrado" });
  const cf = validateCustomFields(await getFieldDefs(ctx.db, "purchase_order"), d.customFields);
  if (!cf.ok) throw new ValidationError(cf.errors);
  const t = totals(d.lines);
  const wf = await getWorkflow(ctx.db, "purchase_order");
  const po = await ctx.db.purchaseOrder.create({
    data: {
      organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "OC"), supplierId: d.supplierId, warehouseId: d.warehouseId,
      requisitionId: d.requisitionId || null, origin: d.origin || null, expectedAt: d.expectedAt ? new Date(d.expectedAt) : null, notes: d.notes,
      status: initialState(wf, "draft"), subtotal: t.subtotal, tax: t.tax, total: t.total, ownerId: ctx.actorId, customFields: cf.values as object,
      lines: { create: t.rows.map((l) => ({ productId: l.productId || null, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, total: l.total })) },
    },
  });
  await emitEvent(ctx, "PurchaseOrderCreated", "purchase_order", po.id, { number: po.number, total: t.total });
  return po;
}

async function refreshTotals(ctx: ExecContext, poId: string) {
  const po = await ctx.db.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { lines: true } });
  const t = totals(po.lines.map((l) => ({ quantity: num(l.quantity), unitPrice: num(l.unitPrice), taxRate: num(l.taxRate) })));
  for (const [i, l] of po.lines.entries()) await ctx.db.purchaseOrderLine.update({ where: { id: l.id }, data: { total: t.rows[i].total } });
  await ctx.db.purchaseOrder.update({ where: { id: poId }, data: { subtotal: t.subtotal, tax: t.tax, total: t.total } });
}

/** El reabastecimiento agrupa necesidades en una SdC borrador por proveedor y almacén. */
export async function addToReplenishmentRfq(ctx: ExecContext, d: { supplierId: string; warehouseId: string; productId: string; description: string; quantity: number; unitPrice: number; taxRate: number }) {
  let po = await ctx.db.purchaseOrder.findFirst({ where: { supplierId: d.supplierId, warehouseId: d.warehouseId, status: "draft", origin: "Reabastecimiento" } });
  if (!po) {
    po = await createPurchaseOrder(ctx, {
      supplierId: d.supplierId, warehouseId: d.warehouseId, origin: "Reabastecimiento",
      lines: [{ productId: d.productId, description: d.description, quantity: d.quantity, unitPrice: d.unitPrice, taxRate: d.taxRate }],
    });
    await addActivity(ctx, "purchase_order", po.id, "Creada automáticamente por una regla de reabastecimiento");
    return po;
  }
  const line = await ctx.db.purchaseOrderLine.findFirst({ where: { purchaseOrderId: po.id, productId: d.productId } });
  if (line) await ctx.db.purchaseOrderLine.update({ where: { id: line.id }, data: { quantity: num(line.quantity) + d.quantity } });
  else await ctx.db.purchaseOrderLine.create({ data: { purchaseOrderId: po.id, productId: d.productId, description: d.description, quantity: d.quantity, unitPrice: d.unitPrice, taxRate: d.taxRate, total: 0 } });
  await refreshTotals(ctx, po.id);
  return po;
}

/** Acción de workflow CREATE_RECEIPT: genera la recepción de lo pendiente por recibir. */
export async function createReceipt(ctx: ExecContext, poId: string) {
  const po = await ctx.db.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { lines: true, supplier: true } });
  const open = await ctx.db.transfer.findFirst({ where: { sourceType: "purchase_order", sourceId: po.id, status: { notIn: ["done", "canceled"] } } });
  if (open) return open;
  const goods = await ctx.db.product.findMany({ where: { id: { in: po.lines.map((l) => l.productId ?? "") }, kind: "GOODS" }, select: { id: true } });
  const goodIds = new Set(goods.map((g) => g.id));
  const lines = po.lines.filter((l) => l.productId && goodIds.has(l.productId) && num(l.quantity) > num(l.receivedQty))
    .map((l) => ({ productId: l.productId!, quantity: num(l.quantity) - num(l.receivedQty), description: l.description, sourceLineId: l.id }));
  if (lines.length === 0) return null;
  const op = await operationType(ctx, po.warehouseId, "RECEIPT");
  const t = await createTransfer(ctx, { operationTypeId: op.id, lines, origin: po.number, sourceType: "purchase_order", sourceId: po.id, partnerName: po.supplier.name, scheduledAt: po.expectedAt ?? undefined });
  await addActivity(ctx, "purchase_order", po.id, `Recepción ${t.number} generada`);
  return t;
}

/** Gancho: recepción validada → cantidades recibidas, estado de la OC y de la requisición. */
export async function onReceiptDone(ctx: ExecContext, poId: string, moved: { sourceLineId: string | null; qty: number }[]) {
  for (const m of moved) {
    if (!m.sourceLineId) continue;
    await ctx.db.purchaseOrderLine.update({ where: { id: m.sourceLineId }, data: { receivedQty: { increment: m.qty } } });
  }
  const po = await ctx.db.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { lines: true } });
  const goods = new Set((await ctx.db.product.findMany({ where: { id: { in: po.lines.map((l) => l.productId ?? "") }, kind: "GOODS" }, select: { id: true } })).map((p) => p.id));
  const tracked = po.lines.filter((l) => l.productId && goods.has(l.productId));
  const full = tracked.every((l) => num(l.receivedQty) >= num(l.quantity));
  const any = tracked.some((l) => num(l.receivedQty) > 0);
  await ctx.db.purchaseOrder.update({ where: { id: po.id }, data: { receiptStatus: full ? "full" : any ? "partial" : "none" } });
  if (full && po.status === "purchase") {
    await applyStatus(ctx, "purchase_order", po.id, "received", "Recepción completa");
    if (po.requisitionId) {
      const r = await ctx.db.requisition.findUnique({ where: { id: po.requisitionId } });
      if (r && r.status === "ordered") await applyStatus(ctx, "requisition", r.id, "received", `Entregada (OC ${po.number})`);
    }
  }
}
