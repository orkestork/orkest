import Link from "@/components/plink";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PayForm } from "@/components/pay-form";
import { Badge, btn, Card, input, PageHeader, Table, td } from "@/components/ui";
import { date, money, num } from "@/lib/ui/format";
import { creditNoteAction } from "../actions";

export default async function InvoiceDetail({ params }: PageProps<"/invoicing/[id]">) {
  const ctx = await requireModule("invoicing", "invoicing.read");
  const { id } = await params;
  const inv = await ctx.db.invoice.findUnique({ where: { id }, include: { customer: true, lines: true } });
  if (!inv) notFound();
  const [payments, refunds, journals, term, so, origin] = await Promise.all([
    ctx.db.payment.findMany({ where: { invoiceId: inv.id }, orderBy: { date: "asc" } }),
    ctx.db.invoice.findMany({ where: { refundOfId: inv.id } }),
    ctx.db.journal.findMany({ where: { active: true } }),
    inv.paymentTermId ? ctx.db.paymentTerm.findUnique({ where: { id: inv.paymentTermId } }) : null,
    inv.salesOrderId ? ctx.db.salesOrder.findUnique({ where: { id: inv.salesOrderId } }) : null,
    inv.refundOfId ? ctx.db.invoice.findUnique({ where: { id: inv.refundOfId } }) : null,
  ]);
  const jmap = new Map(journals.map((j) => [j.id, j.name]));
  const open = inv.status === "issued" && inv.type === "OUT_INVOICE" && ctx.can("invoicing.write");
  return (
    <>
      <PageHeader title={`${inv.type === "OUT_REFUND" ? "Nota crédito" : "Factura"} ${inv.number}`} crumbs={[{ label: "Facturas", href: "/invoicing" }, { label: inv.number }]}
        subtitle={<span className="flex flex-wrap items-center gap-2">{inv.customer.name} · emitida {date(inv.issuedAt)} · vence {date(inv.dueDate)}{term ? ` · ${term.name}` : ""}
          <Badge tone={inv.status === "paid" ? "emerald" : "blue"}>{inv.status === "paid" ? "Pagada" : "Abierta"}</Badge></span>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <Table head={["Descripción", "Cantidad", "Precio", "IVA", "Subtotal"]} empty={inv.lines.length === 0}>
              {inv.lines.map((l) => <tr key={l.id}><td className={td}>{l.description}</td><td className={td}>{num(l.quantity)}</td><td className={td}>{money(l.unitPrice)}</td><td className={td}>{num(l.taxRate)}%</td><td className={td}>{money(l.subtotal)}</td></tr>)}
            </Table>
            <div className="ml-auto max-w-xs space-y-1 p-5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span>{money(inv.subtotal)}</div>
              <div className="flex justify-between"><span className="text-slate-500">Impuestos</span>{money(inv.tax)}</div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Total</span>{money(inv.total)}</div>
              <div className="flex justify-between font-semibold text-[var(--ork-purple)]"><span>Saldo</span>{money(inv.balance)}</div>
            </div>
          </Card>
          {so && <p className="text-sm text-slate-500">Origen: <Link href={`/sales/orders/${so.id}`} className="text-[var(--ork-violet)] underline">Pedido {so.number}</Link></p>}
          {origin && <p className="text-sm text-slate-500">Acredita: <Link href={`/invoicing/${origin.id}`} className="text-[var(--ork-violet)] underline">Factura {origin.number}</Link></p>}
        </div>
        <div className="space-y-6">
          <Card title="Pagos">
            {payments.length === 0 ? <p className="text-sm text-slate-400">Sin pagos.</p> : payments.map((p) => <p key={p.id} className="text-sm">{p.number} · {money(p.amount)} · {jmap.get(p.journalId)} · {date(p.date)}</p>)}
            {refunds.map((r) => <p key={r.id} className="text-sm"><Link href={`/invoicing/${r.id}`} className="underline">{r.number}</Link> · nota crédito {money(r.total)}</p>)}
            {open && <div className="mt-3 border-t border-slate-100 pt-3"><PayForm invoiceId={inv.id} balance={Number(inv.balance)} journals={journals.filter((j) => ["BANK", "CASH"].includes(j.type))} /></div>}
          </Card>
          {open && (
            <Card title="Nota crédito">
              <ActionForm action={creditNoteAction} className="space-y-2">
                <input type="hidden" name="invoiceId" value={inv.id} />
                <input name="amount" type="number" min="1" step="any" placeholder={`Total: ${Number(inv.balance)}`} className={input} aria-label="Valor" />
                <input name="reason" placeholder="Motivo (devolución, descuento…)" className={input} aria-label="Motivo" />
                <SubmitButton className={btn.danger}>Emitir nota crédito</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
