import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { money } from "@/lib/ui/format";
import { CATEGORY_LABEL, loadFinance, monthLabel } from "@/lib/apps/finance";
import { addExpense, deleteExpense } from "../actions";
import { CategorySelect, day, defaultDayFor, MonthNav, monthParam, RowAction } from "../shared";

export const metadata = { title: "Gastos · Finanzas" };

export default async function Expenses({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await requireModule("finance", "finance.read");
  const ym = await monthParam(searchParams);
  const [f, customers] = await Promise.all([
    loadFinance(ctx, ym),
    ctx.db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const cur = ctx.org.currency;
  const canWrite = ctx.can("finance.write");
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const manual = f.expenses.reduce((a, e) => a + e.amount, 0);
  const auto = [
    { label: "Compras a proveedores", value: f.cost.by.purchases ?? 0, href: "/invoicing/bills", hint: "Facturas de proveedor, sin IVA" },
    { label: "Nómina", value: f.cost.by.payroll ?? 0, href: "/hr/payroll", hint: f.cost.payrollEstimated ? "Estimada con los salarios (sin desprendibles)" : "Devengado de los desprendibles" },
    { label: "Flota y transporte", value: f.cost.by.fleet ?? 0, href: "/logistics", hint: "Costos de vehículos en Logística" },
  ];
  const defaultDay = defaultDayFor(ym);

  return (
    <>
      <PageHeader title="Gastos" subtitle="Lo que se gastó en el mes. Compras, nómina y flota llegan solos desde sus apps; aquí registras lo demás." actions={<MonthNav ym={ym} path="/finance/expenses" />} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {auto.map((a) => (
          <Link key={a.label} href={a.href} className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[var(--ork-violet)]">
            <p className="text-xs text-slate-500">{a.label} <span className="text-slate-400">· automático</span></p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{money(a.value, cur)}</p>
            <p className="text-xs text-slate-400">{a.hint}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={`Gastos registrados · ${monthLabel(ym, { month: "long" })} · ${money(manual, cur)}`} padded={false} className="lg:col-span-2">
          <Table head={["Fecha", "Concepto", "Categoría", "Cliente", "Valor", ""]} empty={f.expenses.length === 0}>
            {f.expenses.map((e) => (
              <tr key={e.id}>
                <td className={`${td} whitespace-nowrap`}>{day(e.spentOn)}</td>
                <td className={td}>
                  <span className="font-medium">{e.description || e.vendor || "—"}</span>
                  {e.description && e.vendor && <p className="text-xs text-slate-400">{e.vendor}</p>}
                  {e.recurringId && <p className="text-xs text-[var(--ork-violet)]">Gasto fijo</p>}
                </td>
                <td className={td}>{CATEGORY_LABEL[e.category] ?? e.category}</td>
                <td className={td}>{e.customerId ? customerName.get(e.customerId) ?? "—" : "—"}</td>
                <td className={`${td} text-right font-mono tabular-nums`}>{money(e.amount, cur)}</td>
                <td className={`${td} text-right`}>{canWrite && <RowAction action={deleteExpense} fields={{ id: e.id }} label="Eliminar" tone="danger" />}</td>
              </tr>
            ))}
          </Table>
        </Card>

        {canWrite && (
          <Card title="Registrar gasto">
            <ActionForm action={addExpense} className="space-y-3">
              <Field label="Fecha *"><input type="date" name="spentOn" required defaultValue={defaultDay} className={input} /></Field>
              <Field label="Categoría *"><CategorySelect /></Field>
              <Field label="Valor *"><input type="number" name="amount" min="0" step="any" required inputMode="decimal" className={input} /></Field>
              <Field label="Descripción"><input name="description" className={input} placeholder="Ej. Tóner impresora" /></Field>
              <Field label="Proveedor"><input name="vendor" className={input} /></Field>
              <Field label="Cargar a cliente" hint="Para medir la rentabilidad por cliente">
                <select name="customerId" className={input}><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </Field>
              <SubmitButton className={btn.primary}>Registrar gasto</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
