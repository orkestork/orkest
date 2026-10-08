import type { ExecContext } from "@/lib/core/context";
import { nextNumber } from "@/lib/core/db";

/**
 * Historial operativo de demostración (9 meses) para que los tableros muestren tendencias.
 * Inserta documentos cerrados directamente (sin eventos), con fechas pasadas.
 */
const DAY = 86400000;
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));

export async function seedHistory(ctx: ExecContext, opts: {
  customers: { id: string }[]; sellers: string[]; buyerId?: string; suppliers: { id: string }[]; warehouseId: string; plantId: string; plantLocationId: string;
  products: { id: string; name: string; price: number; cost: number; kind: string }[]; manufactured: { id: string; name: string }[];
}) {
  const sellable = opts.products.filter((p) => p.price > 0);
  const buyable = opts.products.filter((p) => p.cost > 0 && p.kind === "GOODS");
  const term = await ctx.db.paymentTerm.findFirst({ where: { name: "30 días" } });
  const bank = await ctx.db.journal.findFirst({ where: { type: "BANK" } });
  const now = Date.now();

  for (let m = 9; m >= 1; m--) {
    const monthStart = new Date(new Date(now - m * 30 * DAY).setDate(1));
    const growth = 1 + (9 - m) * 0.06; // tendencia creciente
    // Ventas: pedidos entregados y facturados
    const orders = between(3, 6);
    for (let i = 0; i < orders; i++) {
      const date = new Date(monthStart.getTime() + between(0, 27) * DAY);
      const lines = Array.from({ length: between(1, 3) }, () => {
        const p = pick(sellable);
        const qty = p.price > 20_000_000 ? 1 : between(2, 12);
        return { p, qty, total: Math.round(qty * p.price * growth * (0.9 + rand() * 0.15)) };
      });
      const subtotal = lines.reduce((s, l) => s + l.total, 0);
      const tax = Math.round(subtotal * 0.19);
      const customerId = pick(opts.customers).id;
      const seller = pick(opts.sellers);
      const quote = await ctx.db.quote.create({ data: {
        organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "COT"), customerId, status: "converted",
        subtotal, tax, total: subtotal + tax, ownerId: seller, createdAt: new Date(date.getTime() - 6 * DAY),
        lines: { create: lines.map((l) => ({ productId: l.p.id, description: l.p.name, quantity: l.qty, unitPrice: Math.round(l.total / l.qty), total: l.total })) },
      } });
      const so = await ctx.db.salesOrder.create({ data: {
        organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "PV"), customerId, quoteId: quote.id, warehouseId: opts.warehouseId,
        status: "done", deliveryStatus: "full", invoiceStatus: "invoiced", subtotal, tax, total: subtotal + tax, ownerId: seller, createdAt: date, paymentTermId: term?.id,
        lines: { create: lines.map((l) => ({ productId: l.p.id, description: l.p.name, quantity: l.qty, unitPrice: Math.round(l.total / l.qty), total: l.total, deliveredQty: l.p.kind === "SERVICE" ? 0 : l.qty, invoicedQty: l.qty })) },
      } });
      const due = new Date(date.getTime() + 30 * DAY);
      const paid = due.getTime() < now - 5 * DAY && rand() > 0.12;
      const inv = await ctx.db.invoice.create({ data: {
        organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "FV"), customerId, salesOrderId: so.id, quoteId: quote.id, paymentTermId: term?.id,
        subtotal, tax, total: subtotal + tax, balance: paid ? 0 : subtotal + tax, issuedAt: date, dueDate: due, status: paid ? "paid" : "issued", paidAt: paid ? new Date(due.getTime() - between(0, 10) * DAY) : null,
        lines: { create: lines.map((l) => ({ productId: l.p.id, description: l.p.name, quantity: l.qty, unitPrice: Math.round(l.total / l.qty), taxRate: 19, subtotal: l.total })) },
      } });
      if (paid && bank) {
        await ctx.db.payment.create({ data: { organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "REC"), direction: "INBOUND", journalId: bank.id, invoiceId: inv.id, partnerName: "", amount: subtotal + tax, date: inv.paidAt! } });
      }
    }
    // Compras recibidas y facturadas
    for (let i = 0; i < between(2, 4); i++) {
      const date = new Date(monthStart.getTime() + between(0, 27) * DAY);
      const lines = Array.from({ length: between(1, 2) }, () => { const p = pick(buyable); const qty = between(5, 30); return { p, qty, total: qty * p.cost }; });
      const subtotal = lines.reduce((s, l) => s + l.total, 0);
      await ctx.db.purchaseOrder.create({ data: {
        organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "OC"), supplierId: pick(opts.suppliers).id, warehouseId: opts.warehouseId,
        status: "received", receiptStatus: "full", billStatus: "billed", ownerId: opts.buyerId, subtotal, tax: Math.round(subtotal * 0.19), total: Math.round(subtotal * 1.19),
        createdAt: date, confirmedAt: new Date(date.getTime() + between(1, 4) * DAY), expectedAt: new Date(date.getTime() + 10 * DAY),
        lines: { create: lines.map((l) => ({ productId: l.p.id, description: l.p.name, quantity: l.qty, unitPrice: l.p.cost, total: l.total, receivedQty: l.qty, billedQty: l.qty })) },
      } });
    }
    // Producción terminada
    for (let i = 0; i < between(1, 3); i++) {
      const date = new Date(monthStart.getTime() + between(0, 25) * DAY);
      const p = pick(opts.manufactured);
      const qty = between(1, 4);
      await ctx.db.productionOrder.create({ data: {
        organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "OP"), productId: p.id, quantity: qty, producedQty: qty, status: "done",
        warehouseId: opts.plantId, srcLocationId: opts.plantLocationId, destLocationId: opts.plantLocationId, origin: "Plan mensual",
        scheduledAt: date, startedAt: date, doneAt: new Date(date.getTime() + between(2, 6) * DAY), createdAt: date,
      } });
    }
  }
}
