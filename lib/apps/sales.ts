import { z } from "zod";
import type { ExecContext } from "@/lib/core/context";
import { emitEvent } from "@/lib/core/events";
import { nextNumber } from "@/lib/core/db";
import { getFieldDefs, validateCustomFields } from "@/lib/core/custom-fields";
import { getWorkflow, initialState } from "@/lib/core/workflow";
import { ValidationError } from "./crm";
import { addActivity } from "@/lib/core/notify";

const LineInput = z.object({
  kind: z.enum(["PRODUCT", "SECTION", "NOTE"]).default("PRODUCT"),
  productId: z.string().optional().nullable(),
  description: z.string().trim().min(1, "Descripción requerida"),
  quantity: z.coerce.number().default(0),
  unitPrice: z.coerce.number().min(0, "Precio inválido").default(0),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  taxRate: z.coerce.number().min(0).max(100).optional(),
});

export const QuoteInput = z.object({
  customerId: z.string().min(1, "Selecciona un cliente"),
  notes: z.string().optional(),
  terms: z.string().optional(),
  validUntil: z.string().optional().nullable(),
  paymentTermId: z.string().optional().nullable(),
  pricelistId: z.string().optional().nullable(),
  taxRate: z.coerce.number().min(0).max(100).default(19),
  lines: z.array(LineInput).refine((ls) => ls.some((l) => l.kind === "PRODUCT"), "Agrega al menos un producto"),
  customFields: z.record(z.string(), z.unknown()).default({}),
});

type LineIn = z.infer<typeof LineInput>;

/** Calcula líneas y totales. Secciones y notas no suman. */
export function computeQuoteLines(lines: LineIn[], defaultTax: number) {
  const rows = lines.map((l, position) => {
    if (l.kind !== "PRODUCT") return { ...l, position, productId: null, quantity: 0, unitPrice: 0, discountPct: 0, taxRate: 0, total: 0 };
    if (!(l.quantity > 0)) throw new ValidationError({ [`lines.${position}`]: `Cantidad inválida en "${l.description}"` });
    const taxRate = l.taxRate ?? defaultTax;
    const total = Math.round(l.quantity * l.unitPrice * (1 - l.discountPct / 100) * 100) / 100;
    return { ...l, position, productId: l.productId || null, taxRate, total };
  });
  const subtotal = rows.reduce((s, l) => s + l.total, 0);
  const tax = Math.round(rows.reduce((s, l) => s + (l.total * l.taxRate) / 100, 0) * 100) / 100;
  return { rows, subtotal, tax, total: subtotal + tax };
}

const parseQuote = (raw: unknown) => {
  const p = QuoteInput.safeParse(raw);
  if (!p.success) throw new ValidationError(Object.fromEntries(p.error.issues.map((i) => [i.path.join(".") || "lines", i.message])));
  return p.data;
};

export async function createQuote(ctx: ExecContext, raw: unknown) {
  const d = parseQuote(raw);
  const customer = await ctx.db.customer.findUnique({ where: { id: d.customerId } });
  if (!customer) throw new ValidationError({ customerId: "Cliente no encontrado" });
  const cf = validateCustomFields(await getFieldDefs(ctx.db, "quote"), d.customFields);
  if (!cf.ok) throw new ValidationError(cf.errors);
  const t = computeQuoteLines(d.lines, d.taxRate);
  const wf = await getWorkflow(ctx.db, "quote");

  const quote = await ctx.db.quote.create({
    data: {
      organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "COT"), customerId: d.customerId, notes: d.notes, terms: d.terms,
      validUntil: d.validUntil ? new Date(d.validUntil) : new Date(Date.now() + 30 * 86400000),
      paymentTermId: d.paymentTermId || customer.paymentTermId, pricelistId: d.pricelistId || customer.pricelistId,
      status: initialState(wf, "draft"), subtotal: t.subtotal, tax: t.tax, total: t.total, ownerId: ctx.actorId,
      customFields: cf.values as object,
      lines: { create: t.rows },
    },
  });
  await emitEvent(ctx, "QuoteCreated", "quote", quote.id, { number: quote.number, total: t.total });
  return quote;
}

const EDITABLE = ["draft", "sent"];

/** Edita una cotización abierta y deja trazabilidad de los cambios en el historial. */
export async function updateQuote(ctx: ExecContext, id: string, raw: unknown) {
  const before = await ctx.db.quote.findUniqueOrThrow({ where: { id }, include: { customer: true, lines: true } });
  if (!EDITABLE.includes(before.status)) throw new ValidationError({ status: "Solo se editan cotizaciones en borrador o enviadas" });
  const d = parseQuote(raw);
  const t = computeQuoteLines(d.lines, d.taxRate);
  const cf = validateCustomFields(await getFieldDefs(ctx.db, "quote"), d.customFields);
  if (!cf.ok) throw new ValidationError(cf.errors);
  const customer = await ctx.db.customer.findUniqueOrThrow({ where: { id: d.customerId } });

  await ctx.db.quote.update({
    where: { id },
    data: {
      customerId: d.customerId, notes: d.notes, terms: d.terms, validUntil: d.validUntil ? new Date(d.validUntil) : null,
      paymentTermId: d.paymentTermId || null, pricelistId: d.pricelistId || null, customFields: cf.values as object,
      subtotal: t.subtotal, tax: t.tax, total: t.total,
      lines: { deleteMany: {}, create: t.rows },
    },
  });
  const money = (v: unknown) => Number(v).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  const changes: string[] = [];
  if (before.customerId !== d.customerId) changes.push(`Cliente: ${before.customer.name} → ${customer.name}`);
  if (Number(before.total) !== t.total) changes.push(`Total: ${money(before.total)} → ${money(t.total)}`);
  const beforeCount = before.lines.filter((l) => l.kind === "PRODUCT").length, afterCount = t.rows.filter((l) => l.kind === "PRODUCT").length;
  if (beforeCount !== afterCount) changes.push(`Líneas de producto: ${beforeCount} → ${afterCount}`);
  if ((before.validUntil?.toISOString().slice(0, 10) ?? "") !== (d.validUntil ?? "")) changes.push(`Vigencia: ${before.validUntil?.toLocaleDateString("es-CO") ?? "—"} → ${d.validUntil ? new Date(d.validUntil).toLocaleDateString("es-CO") : "—"}`);
  for (const c of changes) await addActivity(ctx, "quote", id, c, "TRACKING");
  await emitEvent(ctx, "QuoteUpdated", "quote", id, { total: t.total });
}

/** Al convertir una cotización en pedido se descuenta inventario y se emite la factura. */
export async function invoiceFromQuote(ctx: ExecContext, quoteId: string, dueDays = 30) {
  const q = await ctx.db.quote.findUniqueOrThrow({ where: { id: quoteId } });
  const exists = await ctx.db.invoice.findFirst({ where: { quoteId } });
  if (exists) return exists;
  const inv = await ctx.db.invoice.create({
    data: {
      organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "FV"), customerId: q.customerId, quoteId,
      total: q.total, balance: q.total, dueDate: new Date(Date.now() + dueDays * 86400000),
    },
  });
  await emitEvent(ctx, "InvoiceIssued", "invoice", inv.id, { number: inv.number, total: Number(q.total) });
  return inv;
}
