import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { PayForm } from "@/components/pay-form";
import { Badge, Card, PageHeader, Stat, Table, td } from "@/components/ui";
import { date, money } from "@/lib/ui/format";

export const metadata = { title: "Facturas" };

export default async function Invoicing({ searchParams }: PageProps<"/invoicing">) {
  const ctx = await requireModule("invoicing", "invoicing.read");
  const { filter } = await searchParams;
  const now = new Date();
  const where = filter === "overdue" ? { type: "OUT_INVOICE", status: "issued", dueDate: { lt: now } } : filter === "refunds" ? { type: "OUT_REFUND" } : filter === "open" ? { type: "OUT_INVOICE", status: "issued" } : {};
  const [invoices, journals, open] = await Promise.all([
    ctx.db.invoice.findMany({ where, include: { customer: true }, orderBy: { issuedAt: "desc" }, take: 300 }),
    ctx.db.journal.findMany({ where: { type: { in: ["BANK", "CASH"] }, active: true } }),
    ctx.db.invoice.findMany({ where: { type: "OUT_INVOICE", status: "issued" }, select: { balance: true, dueDate: true } }),
  ]);
  const sum = (xs: { balance: unknown }[]) => xs.reduce((s, i) => s + Number(i.balance), 0);
  const overdue = open.filter((i) => i.dueDate < now);
  const canWrite = ctx.can("invoicing.write");
  return (
    <>
      <PageHeader title="Facturas de cliente" subtitle="Se emiten desde los pedidos de venta según la política de facturación de cada producto (lo pedido o lo entregado)." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Cartera total" value={money(sum(open), ctx.org.currency)} hint={`${open.length} facturas abiertas`} href="/invoicing?filter=open" />
        <Stat label="Cartera vencida" value={money(sum(overdue), ctx.org.currency)} hint={`${overdue.length} facturas`} href="/invoicing?filter=overdue" />
        <Stat label="Al día" value={money(sum(open) - sum(overdue), ctx.org.currency)} />
      </div>
      <div className="mb-4 flex gap-1.5 text-sm">
        {[["", "Todas"], ["open", "Abiertas"], ["overdue", "Vencidas"], ["refunds", "Notas crédito"]].map(([k, l]) => <Link key={k} href={k ? `/invoicing?filter=${k}` : "/invoicing"} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:border-[var(--ork-violet)]">{l}</Link>)}
      </div>
      <Card padded={false}>
        <Table head={["Número", "Cliente", "Total", "Saldo", "Vence", "Estado", ""]} empty={invoices.length === 0}>
          {invoices.map((i) => {
            const days = Math.floor((now.getTime() - i.dueDate.getTime()) / 86400000);
            return (
              <tr key={i.id}>
                <td className={td}><Link href={`/invoicing/${i.id}`} className="font-medium hover:underline">{i.number}</Link>{i.type === "OUT_REFUND" && <p className="text-xs text-slate-400">Nota crédito</p>}</td>
                <td className={td}><Link href={`/crm/customers/${i.customerId}`} className="hover:underline">{i.customer.name}</Link></td>
                <td className={td}>{money(i.total, ctx.org.currency)}</td>
                <td className={td}>{money(i.balance, ctx.org.currency)}</td>
                <td className={td}>{date(i.dueDate)}</td>
                <td className={td}>{i.type === "OUT_REFUND" ? <Badge tone="violet">Aplicada</Badge> : i.status === "paid" ? <Badge tone="emerald">Pagada</Badge> : days > 0 ? <Badge tone="rose">Vencida {days} d</Badge> : <Badge tone="blue">Vigente</Badge>}</td>
                <td className={td}>{i.status === "issued" && i.type === "OUT_INVOICE" && canWrite && <PayForm invoiceId={i.id} balance={Number(i.balance)} journals={journals} />}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
