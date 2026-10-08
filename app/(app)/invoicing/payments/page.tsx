import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { Badge, Card, PageHeader, Table, td } from "@/components/ui";
import { date, money } from "@/lib/ui/format";

export const metadata = { title: "Pagos" };

export default async function Payments() {
  const ctx = await requireModule("invoicing", "invoicing.read");
  const [payments, journals] = await Promise.all([ctx.db.payment.findMany({ orderBy: { date: "desc" }, take: 300 }), ctx.db.journal.findMany()]);
  const jmap = new Map(journals.map((j) => [j.id, j.name]));
  const byJournal = journals.filter((j) => ["BANK", "CASH"].includes(j.type)).map((j) => ({
    j, net: payments.filter((p) => p.journalId === j.id).reduce((s, p) => s + (p.direction === "INBOUND" ? 1 : -1) * Number(p.amount), 0),
  }));
  return (
    <>
      <PageHeader title="Pagos" subtitle="Cobros a clientes y pagos a proveedores por diario." />
      <div className="mb-6 flex flex-wrap gap-3">{byJournal.map(({ j, net }) => <div key={j.id} className="rounded-2xl border border-[var(--ork-rule)] bg-white/90 px-4 py-3"><p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{j.name} · neto</p><p className="text-xl font-semibold tabular-nums text-[var(--ork-ink)]">{money(net, ctx.org.currency)}</p></div>)}</div>
      <Card padded={false}>
        <Table head={["Número", "Tipo", "Tercero", "Diario", "Valor", "Fecha", "Documento"]} empty={payments.length === 0}>
          {payments.map((p) => (
            <tr key={p.id}>
              <td className={`${td} font-mono text-xs`}>{p.number}</td>
              <td className={td}><Badge tone={p.direction === "INBOUND" ? "emerald" : "amber"}>{p.direction === "INBOUND" ? "Cobro" : "Pago"}</Badge></td>
              <td className={td}>{p.partnerName}</td><td className={td}>{jmap.get(p.journalId)}</td>
              <td className={`${td} font-medium`}>{p.direction === "INBOUND" ? "+" : "−"}{money(p.amount)}</td><td className={td}>{date(p.date)}</td>
              <td className={td}>{p.invoiceId ? <Link href={`/invoicing/${p.invoiceId}`} className="underline">Factura</Link> : p.billId ? <Link href="/invoicing/bills" className="underline">Factura proveedor</Link> : "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
