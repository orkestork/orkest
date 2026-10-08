import type { ExecContext } from "@/lib/core/context";
import { nextNumber } from "@/lib/core/db";
import { emitEvent } from "@/lib/core/events";
import { addActivity } from "@/lib/core/notify";
import { ValidationError } from "./crm";
import { invoiceableLines, recomputeInvoiceStatus } from "./sales-orders";

/**
 * Facturación: facturas de cliente desde pedidos (según política), notas crédito,
 * facturas de proveedor desde órdenes de compra (lo recibido), pagos por diario
 * con abonos parciales y vencimientos calculados por plazo de pago.
 */
const num = (v: unknown) => Number(v ?? 0);
const DAY = 86400000;

export type TermLine = { percent: number; days: number };

export async function dueDateFor(ctx: ExecContext, paymentTermId: string | null | undefined, from = new Date()) {
  if (!paymentTermId) return new Date(from.getTime() + 30 * DAY);
  const t = await ctx.db.paymentTerm.findUnique({ where: { id: paymentTermId } });
  const lines = (t?.lines ?? [{ percent: 100, days: 30 }]) as TermLine[];
  return new Date(from.getTime() + Math.max(0, ...lines.map((l) => l.days)) * DAY);
}

function sumLines(lines: { quantity: number; unitPrice: number; taxRate: number }[]) {
  const rows = lines.map((l) => ({ ...l, subtotal: Math.round(l.quantity * l.unitPrice * 100) / 100 }));
  const subtotal = rows.reduce((s, l) => s + l.subtotal, 0);
  const tax = Math.round(rows.reduce((s, l) => s + (l.subtotal * l.taxRate) / 100, 0) * 100) / 100;
  return { rows, subtotal, tax, total: subtotal + tax };
}

/** Acción CREATE_INVOICE sobre pedido: factura lo facturable según la política de cada producto. */
export async function invoiceFromSalesOrder(ctx: ExecContext, soId: string) {
  const so = await ctx.db.salesOrder.findUniqueOrThrow({ where: { id: soId } });
  const rows = (await invoiceableLines(ctx, soId)).filter((r) => r.qty > 0);
  if (!rows.length) throw new ValidationError({ lines: "No hay nada por facturar (revisa lo entregado si el producto factura por entrega)" });
  const t = sumLines(rows.map((r) => ({ quantity: r.qty, unitPrice: num(r.line.unitPrice) * (1 - num(r.line.discountPct) / 100), taxRate: num(r.line.taxRate) })));
  const inv = await ctx.db.invoice.create({
    data: {
      organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "FV"), customerId: so.customerId, salesOrderId: so.id, quoteId: so.quoteId,
      paymentTermId: so.paymentTermId, subtotal: t.subtotal, tax: t.tax, total: t.total, balance: t.total,
      dueDate: await dueDateFor(ctx, so.paymentTermId),
      lines: { create: rows.map((r, i) => ({ productId: r.line.productId, salesOrderLineId: r.line.id, description: r.line.description, quantity: r.qty, unitPrice: t.rows[i].unitPrice, taxRate: num(r.line.taxRate), subtotal: t.rows[i].subtotal })) },
    },
  });
  for (const r of rows) await ctx.db.salesOrderLine.update({ where: { id: r.line.id }, data: { invoicedQty: { increment: r.qty } } });
  await recomputeInvoiceStatus(ctx, so.id);
  await addActivity(ctx, "sales_order", so.id, `Factura ${inv.number} emitida`);
  await emitEvent(ctx, "InvoiceIssued", "invoice", inv.id, { number: inv.number, total: t.total });
  return inv;
}

/** Nota crédito total o parcial: disminuye el saldo de la factura original. */
export async function creditNote(ctx: ExecContext, invoiceId: string, amount?: number, reason = "Nota crédito") {
  const inv = await ctx.db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.type !== "OUT_INVOICE") throw new ValidationError({ type: "Solo se acreditan facturas" });
  const value = Math.min(amount ?? num(inv.balance), num(inv.balance));
  if (!(value > 0)) throw new ValidationError({ amount: "La factura no tiene saldo para acreditar" });
  const rate = num(inv.subtotal) > 0 ? num(inv.tax) / num(inv.subtotal) : 0;
  const subtotal = Math.round((value / (1 + rate)) * 100) / 100;
  const nc = await ctx.db.invoice.create({
    data: {
      organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "NC"), type: "OUT_REFUND", refundOfId: inv.id, customerId: inv.customerId,
      subtotal, tax: value - subtotal, total: value, balance: 0, dueDate: new Date(), status: "paid", paidAt: new Date(),
      lines: { create: [{ description: `${reason} · ${inv.number}`, quantity: 1, unitPrice: subtotal, taxRate: Math.round(rate * 10000) / 100, subtotal }] },
    },
  });
  const balance = num(inv.balance) - value;
  await ctx.db.invoice.update({ where: { id: inv.id }, data: { balance, ...(balance <= 0 ? { status: "paid", paidAt: new Date() } : {}) } });
  await emitEvent(ctx, "CreditNoteIssued", "invoice", nc.id, { number: nc.number, invoice: inv.number, amount: value });
  return nc;
}

/** Factura de proveedor desde la OC: lo recibido (bienes) o lo pedido (servicios) aún no facturado. */
export async function billFromPurchaseOrder(ctx: ExecContext, poId: string, supplierRef?: string) {
  const po = await ctx.db.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { lines: true, supplier: true } });
  if (!["purchase", "received"].includes(po.status)) throw new ValidationError({ status: "Solo se facturan órdenes de compra confirmadas" });
  const services = new Set((await ctx.db.product.findMany({ where: { id: { in: po.lines.map((l) => l.productId ?? "") }, kind: "SERVICE" }, select: { id: true } })).map((p) => p.id));
  const rows = po.lines.map((l) => {
    const base = !l.productId || services.has(l.productId) ? num(l.quantity) : num(l.receivedQty);
    return { line: l, qty: Math.max(0, base - num(l.billedQty)) };
  }).filter((r) => r.qty > 0);
  if (!rows.length) throw new ValidationError({ lines: "No hay cantidades recibidas pendientes de facturar" });
  const t = sumLines(rows.map((r) => ({ quantity: r.qty, unitPrice: num(r.line.unitPrice), taxRate: num(r.line.taxRate) })));
  const bill = await ctx.db.bill.create({
    data: {
      organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "FP"), supplierRef: supplierRef || null, supplierId: po.supplierId, purchaseOrderId: po.id,
      subtotal: t.subtotal, tax: t.tax, total: t.total, balance: t.total, dueDate: await dueDateFor(ctx, po.supplier.paymentTermId),
      lines: { create: rows.map((r, i) => ({ productId: r.line.productId, purchaseOrderLineId: r.line.id, description: r.line.description, quantity: r.qty, unitPrice: num(r.line.unitPrice), taxRate: num(r.line.taxRate), subtotal: t.rows[i].subtotal })) },
    },
  });
  for (const r of rows) await ctx.db.purchaseOrderLine.update({ where: { id: r.line.id }, data: { billedQty: { increment: r.qty } } });
  const fresh = await ctx.db.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
  const billed = fresh.every((l) => num(l.billedQty) >= num(l.quantity));
  await ctx.db.purchaseOrder.update({ where: { id: po.id }, data: { billStatus: billed ? "billed" : "partial" } });
  await addActivity(ctx, "purchase_order", po.id, `Factura de proveedor ${bill.number} registrada`);
  await emitEvent(ctx, "BillPosted", "bill", bill.id, { number: bill.number, total: t.total });
  return bill;
}

export async function registerPayment(ctx: ExecContext, d: { invoiceId?: string; billId?: string; amount: number; journalId?: string; date?: string; reference?: string }) {
  if (!(d.amount > 0)) throw new ValidationError({ amount: "Valor inválido" });
  const journal = d.journalId
    ? await ctx.db.journal.findUniqueOrThrow({ where: { id: d.journalId } })
    : await ctx.db.journal.findFirst({ where: { type: "BANK", active: true } });
  if (!journal) throw new ValidationError({ journalId: "Configura un diario de banco o caja" });
  const date = d.date ? new Date(d.date) : new Date();

  if (d.invoiceId) {
    const inv = await ctx.db.invoice.findUniqueOrThrow({ where: { id: d.invoiceId }, include: { customer: true } });
    if (inv.status !== "issued") throw new ValidationError({ status: "La factura no está pendiente de pago" });
    const amount = Math.min(d.amount, num(inv.balance));
    const balance = Math.round((num(inv.balance) - amount) * 100) / 100;
    await ctx.db.payment.create({ data: { organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "REC"), direction: "INBOUND", journalId: journal.id, invoiceId: inv.id, partnerName: inv.customer.name, amount, date, reference: d.reference, createdById: ctx.actorId } });
    await ctx.db.invoice.update({ where: { id: inv.id }, data: { balance, status: balance <= 0 ? "paid" : "issued", paidAt: balance <= 0 ? date : null } });
    await emitEvent(ctx, "PaymentReceived", "invoice", inv.id, { amount, balance, journal: journal.name });
    return { amount, balance };
  }
  if (d.billId) {
    const bill = await ctx.db.bill.findUniqueOrThrow({ where: { id: d.billId }, include: { supplier: true } });
    if (bill.status !== "posted") throw new ValidationError({ status: "La factura de proveedor no está pendiente" });
    const amount = Math.min(d.amount, num(bill.balance));
    const balance = Math.round((num(bill.balance) - amount) * 100) / 100;
    await ctx.db.payment.create({ data: { organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "PAG"), direction: "OUTBOUND", journalId: journal.id, billId: bill.id, partnerName: bill.supplier.name, amount, date, reference: d.reference, createdById: ctx.actorId } });
    await ctx.db.bill.update({ where: { id: bill.id }, data: { balance, status: balance <= 0 ? "paid" : "posted", paidAt: balance <= 0 ? date : null } });
    await emitEvent(ctx, "PaymentSent", "bill", bill.id, { amount, balance, journal: journal.name });
    return { amount, balance };
  }
  throw new ValidationError({ document: "Indica la factura a pagar" });
}

/** Configuración contable inicial (idempotente). */
export async function ensureAccountingDefaults(ctx: ExecContext) {
  if ((await ctx.db.journal.count()) === 0) {
    await ctx.db.journal.createMany({ data: [
      { organizationId: ctx.orgId, code: "VEN", name: "Facturas de cliente", type: "SALE" },
      { organizationId: ctx.orgId, code: "COM", name: "Facturas de proveedor", type: "PURCHASE" },
      { organizationId: ctx.orgId, code: "BNK", name: "Banco", type: "BANK" },
      { organizationId: ctx.orgId, code: "CAJ", name: "Efectivo", type: "CASH" },
    ] });
  }
  if ((await ctx.db.tax.count()) === 0) {
    await ctx.db.tax.createMany({ data: [
      { organizationId: ctx.orgId, name: "IVA 19%", rate: 19, scope: "SALE" }, { organizationId: ctx.orgId, name: "IVA 5%", rate: 5, scope: "SALE" },
      { organizationId: ctx.orgId, name: "Excluido 0%", rate: 0, scope: "SALE" }, { organizationId: ctx.orgId, name: "IVA 19% compras", rate: 19, scope: "PURCHASE" },
      { organizationId: ctx.orgId, name: "IVA 5% compras", rate: 5, scope: "PURCHASE" },
    ] });
  }
  if ((await ctx.db.paymentTerm.count()) === 0) {
    await ctx.db.paymentTerm.createMany({ data: [
      { organizationId: ctx.orgId, name: "Contado", lines: [{ percent: 100, days: 0 }] },
      { organizationId: ctx.orgId, name: "15 días", lines: [{ percent: 100, days: 15 }] },
      { organizationId: ctx.orgId, name: "30 días", lines: [{ percent: 100, days: 30 }], isDefault: true },
      { organizationId: ctx.orgId, name: "60 días", lines: [{ percent: 100, days: 60 }] },
      { organizationId: ctx.orgId, name: "30% anticipo, saldo a 60 días", lines: [{ percent: 30, days: 0 }, { percent: 70, days: 60 }] },
    ] });
  }
  if ((await ctx.db.pricelist.count()) === 0) {
    await ctx.db.pricelist.create({ data: { organizationId: ctx.orgId, name: "Lista pública", isDefault: true } });
  }
}
