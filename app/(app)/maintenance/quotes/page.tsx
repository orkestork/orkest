import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { OpsBadge, opsOptions } from "@/components/ops";
import { btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { date, money } from "@/lib/ui/format";
import { quoteStatus, saveQuote } from "../actions";

export const metadata = { title: "Cotizaciones de mantenimiento" };

export default async function Quotes() {
  const ctx = await requireModule("maintenance", "maintenance.read");
  const [quotes, suppliers, orders] = await Promise.all([
    ctx.db.maintenanceQuote.findMany({ include: { maintenanceOrder: { include: { equipment: true } } }, orderBy: { createdAt: "desc" } }),
    ctx.db.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.db.maintenanceOrder.findMany({ where: { status: { in: ["PENDING", "IN_PROGRESS"] } }, include: { equipment: true }, orderBy: { reportedAt: "desc" } }),
  ]);
  const rank: Record<string, number> = { REQUESTED: 0, APPROVED: 1, PURCHASED: 2, REJECTED: 3 };
  quotes.sort((a, b) => rank[a.status] - rank[b.status]);
  const canWrite = ctx.can("maintenance.write");
  return (
    <>
      <PageHeader title="Cotizaciones" subtitle="Cotizaciones de proveedores para repuestos y servicios de mantenimiento." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Fecha", "Proveedor", "Descripción", "Orden", "Monto", "Estado"]} empty={quotes.length === 0}>
            {quotes.map((q) => (
              <tr key={q.id}>
                <td className={td}>{date(q.createdAt)}</td>
                <td className={td}>{q.supplier}</td>
                <td className={td}>{q.description}</td>
                <td className={td}>{q.maintenanceOrder ? <Link href={`/maintenance/orders/${q.maintenanceOrder.id}`} className="font-mono text-xs text-[var(--ork-violet)] underline">{q.maintenanceOrder.number}</Link> : "—"}</td>
                <td className={`${td} tabular-nums`}>{money(q.amount, ctx.org.currency)}</td>
                <td className={td}>
                  {canWrite ? (
                    <form action={quoteStatus} className="flex gap-1">
                      <input type="hidden" name="id" value={q.id} />
                      <select name="status" defaultValue={q.status} className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs">{opsOptions("quoteStatus")}</select>
                      <button className={btn.small}>OK</button>
                    </form>
                  ) : <OpsBadge kind="quoteStatus" value={q.status} />}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Nueva cotización">
            <ActionForm action={saveQuote} className="space-y-3">
              <Field label="Proveedor registrado"><select name="supplierId" className={input}><option value="">— Otro (escribir abajo) —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <Field label="Otro proveedor"><input name="supplier" className={input} /></Field>
              <Field label="Descripción *"><textarea name="description" rows={2} required className={input} /></Field>
              <Field label="Monto *"><input name="amount" type="number" min="0" required className={input} /></Field>
              <Field label="Orden de mantenimiento"><select name="maintenanceOrderId" className={input}><option value="">—</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.equipment.name}</option>)}</select></Field>
              <SubmitButton className={btn.primary}>Registrar</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
