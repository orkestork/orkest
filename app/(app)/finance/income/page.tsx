import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { date, money } from "@/lib/ui/format";
import { loadFinance, monthLabel, ymOf } from "@/lib/apps/finance";
import { addIncome, deleteIncome, markIncomeReceived } from "../actions";
import { day, defaultDayFor, MonthNav, monthParam, RowAction } from "../shared";

export const metadata = { title: "Ingresos · Finanzas" };

export default async function Income({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await requireModule("finance", "finance.read");
  const ym = await monthParam(searchParams);
  const [f, customers] = await Promise.all([
    loadFinance(ctx, ym),
    ctx.db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const cur = ctx.org.currency;
  const canWrite = ctx.can("finance.write");
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const other = f.otherIncome.filter((i) => ymOf(i.receivedOn) === ym);
  const defaultDay = defaultDayFor(ym);

  return (
    <>
      <PageHeader title="Ingresos" subtitle="Lo facturado a clientes (sin IVA, menos notas crédito) más los ingresos que no pasan por Facturación." actions={<MonthNav ym={ym} path="/finance/income" />} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Facturado en ${monthLabel(ym, { month: "long" })} · ${money(f.income.invoiced, cur)}`} padded={false}>
            <Table head={["Factura", "Cliente", "Fecha", "Subtotal"]} empty={f.invoices.length === 0}>
              {f.invoices.map((i) => (
                <tr key={i.id}>
                  <td className={td}><Link href={`/invoicing/${i.id}`} className="font-medium hover:underline">{i.number}</Link>{i.type === "OUT_REFUND" && <p className="text-xs text-rose-600">Nota crédito</p>}</td>
                  <td className={td}>{i.customer.name}</td>
                  <td className={`${td} whitespace-nowrap`}>{date(i.issuedAt)}</td>
                  <td className={`${td} text-right font-mono tabular-nums ${i.type === "OUT_REFUND" ? "text-rose-600" : ""}`}>{i.type === "OUT_REFUND" ? "−" : ""}{money(i.subtotal, cur)}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title={`Otros ingresos · ${money(f.income.other, cur)}${f.income.scheduled ? ` · ${money(f.income.scheduled, cur)} proyectados` : ""}`} padded={false}>
            <Table head={["Fecha", "Concepto", "Cliente", "Estado", "Valor", ""]} empty={other.length === 0}>
              {other.map((i) => (
                <tr key={i.id}>
                  <td className={`${td} whitespace-nowrap`}>{day(i.receivedOn)}</td>
                  <td className={td}>{i.description}</td>
                  <td className={td}>{i.customerId ? customerName.get(i.customerId) ?? "—" : "—"}</td>
                  <td className={td}>{i.status === "received" ? <Badge tone="emerald">Recibido</Badge> : <Badge tone="amber">Proyectado</Badge>}</td>
                  <td className={`${td} text-right font-mono tabular-nums`}>{money(i.amount, cur)}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    {canWrite && (
                      <span className="inline-flex gap-1">
                        {i.status === "scheduled" && <RowAction action={markIncomeReceived} fields={{ id: i.id }} label="Recibido" />}
                        <RowAction action={deleteIncome} fields={{ id: i.id }} label="Eliminar" tone="danger" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        {canWrite && (
          <Card title="Registrar otro ingreso">
            <ActionForm action={addIncome} className="space-y-3">
              <Field label="Fecha *"><input type="date" name="receivedOn" required defaultValue={defaultDay} className={input} /></Field>
              <Field label="Concepto *"><input name="description" required className={input} placeholder="Ej. Rendimientos financieros" /></Field>
              <Field label="Valor *"><input type="number" name="amount" min="0" step="any" required className={input} /></Field>
              <Field label="Estado">
                <select name="status" defaultValue="received" className={input}>
                  <option value="received">Recibido</option>
                  <option value="scheduled">Proyectado (aún no llega)</option>
                </select>
              </Field>
              <Field label="Cliente"><select name="customerId" className={input}><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <p className="text-xs text-slate-400">Las ventas a clientes se registran en Facturación y aparecen aquí solas.</p>
              <SubmitButton className={btn.primary}>Registrar ingreso</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
