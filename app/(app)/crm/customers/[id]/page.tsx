import Link from "@/components/plink";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { orgUsers } from "@/lib/core/members";
import { CustomFieldValues } from "@/components/custom-fields";
import { ActivityTimeline } from "@/components/activity";
import { stateLabel } from "@/components/workflow-bar";
import { Badge, btn, Card, PageHeader, Table, td } from "@/components/ui";
import { date, money } from "@/lib/ui/format";

export default async function CustomerDetail({ params }: PageProps<"/crm/customers/[id]">) {
  const ctx = await requireModule("crm", "crm.customers.read");
  const { id } = await params;
  const c = await ctx.db.customer.findUnique({
    where: { id },
    include: { contacts: true, opportunities: { orderBy: { createdAt: "desc" } }, quotes: { orderBy: { createdAt: "desc" } }, invoices: { orderBy: { issuedAt: "desc" } } },
  });
  if (!c) notFound();
  const [defs, users] = await Promise.all([getFieldDefs(ctx.db, "customer"), orgUsers(ctx)]);
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const quoteState = await stateLabel(ctx, "quote");
  const oppState = await stateLabel(ctx, "opportunity");
  const showQuotes = ctx.hasModule("sales") && ctx.can("sales.quotes.read");
  const showInvoices = ctx.hasModule("invoicing") && ctx.can("invoicing.read");

  return (
    <>
      <PageHeader title={c.name} subtitle={[c.taxId, c.city, c.ownerId && `Responsable: ${userMap.get(c.ownerId)}`].filter(Boolean).join(" · ")}
        crumbs={[{ label: "Clientes", href: "/crm/customers" }, { label: c.name }]}
        actions={<>
          {showQuotes && ctx.can("sales.quotes.write") && <Link href={`/sales/quotes/new?customerId=${c.id}`} className={btn.secondary}>Nueva cotización</Link>}
          {ctx.can("crm.customers.write") && <Link href={`/crm/customers/${c.id}/edit`} className={btn.primary}>Editar</Link>}
        </>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Información">
            <dl className="mb-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {[["Email", c.email], ["Teléfono", c.phone], ["Ciudad", c.city], ["Creado", date(c.createdAt)]].map(([k, v]) => (
                <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-sm text-slate-800">{v || "—"}</dd></div>
              ))}
            </dl>
            <CustomFieldValues defs={defs} values={c.customFields as Record<string, unknown>} users={userMap} />
          </Card>
          <Card title="Oportunidades" padded={false}>
            <Table head={["Oportunidad", "Etapa", "Valor"]} empty={c.opportunities.length === 0}>
              {c.opportunities.map((o) => { const s = oppState(o.status); return (
                <tr key={o.id}><td className={td}>{o.title}</td><td className={td}><Badge tone={s.color}>{s.label}</Badge></td><td className={td}>{money(o.amount, ctx.org.currency)}</td></tr>
              ); })}
            </Table>
          </Card>
          {showQuotes && (
            <Card title="Cotizaciones" padded={false}>
              <Table head={["Número", "Estado", "Total", "Fecha"]} empty={c.quotes.length === 0}>
                {c.quotes.map((q) => { const s = quoteState(q.status); return (
                  <tr key={q.id}><td className={td}><Link className="font-medium hover:underline" href={`/sales/quotes/${q.id}`}>{q.number}</Link></td><td className={td}><Badge tone={s.color}>{s.label}</Badge></td><td className={td}>{money(q.total, ctx.org.currency)}</td><td className={td}>{date(q.createdAt)}</td></tr>
                ); })}
              </Table>
            </Card>
          )}
          {showInvoices && (
            <Card title="Facturas" padded={false}>
              <Table head={["Número", "Total", "Saldo", "Vence"]} empty={c.invoices.length === 0}>
                {c.invoices.map((i) => (
                  <tr key={i.id}><td className={td}>{i.number}</td><td className={td}>{money(i.total, ctx.org.currency)}</td><td className={td}>{money(i.balance, ctx.org.currency)}</td><td className={td}>{date(i.dueDate)}</td></tr>
                ))}
              </Table>
            </Card>
          )}
        </div>
        <ActivityTimeline ctx={ctx} entityType="customer" entityId={c.id} canWrite={ctx.can("crm.customers.write")} />
      </div>
    </>
  );
}
