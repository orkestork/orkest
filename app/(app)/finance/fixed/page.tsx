import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { money } from "@/lib/ui/format";
import { addMonths, CATEGORY_LABEL, dueInMonth, localDay, monthStart, ymOf, FREQ_LABEL, FREQ_MONTHS, monthLabel, monthlyEquivalent, type Frequency } from "@/lib/apps/finance";
import { addRecurring, deleteRecurring, toggleRecurring } from "../actions";
import { CategorySelect, RowAction } from "../shared";

export const metadata = { title: "Gastos fijos · Finanzas" };

export default async function FixedCosts() {
  const ctx = await requireModule("finance", "finance.read");
  const recurring = (await ctx.db.finRecurringCost.findMany({ orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }] })).map((r) => ({ ...r, amount: Number(r.amount) }));
  const cur = ctx.org.currency;
  const canWrite = ctx.can("finance.write");
  const today = localDay();
  const thisYm = today.slice(0, 7);
  // Cuotas ya pagadas de este mes y el siguiente (gasto enlazado al gasto fijo)
  const paid = new Set(
    (await ctx.db.finExpense.findMany({ where: { recurringId: { not: null }, spentOn: { gte: monthStart(thisYm), lt: monthStart(addMonths(thisYm, 2)) } }, select: { recurringId: true, spentOn: true } }))
      .map((e) => `${e.recurringId}:${ymOf(e.spentOn)}`),
  );
  /** Próxima cuota sin pagar desde hoy (busca hasta 13 meses). */
  const nextDue = (r: (typeof recurring)[number]) => {
    for (let i = 0; i < 14; i++) {
      const m = addMonths(thisYm, i);
      const d = dueInMonth(r, m);
      if (d && d >= today && !paid.has(`${r.id}:${m}`)) return d;
    }
    return null;
  };
  const active = recurring.filter((r) => r.active);
  const monthly = active.reduce((a, r) => a + monthlyEquivalent(r), 0);

  return (
    <>
      <PageHeader title="Gastos fijos" subtitle={`Arriendo, servicios, software y demás costos que se repiten. Pesan ${money(monthly, cur)} al mes (${money(monthly * 12, cur)} al año).`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Gasto", "Frecuencia", "Valor", "Al mes", "Próximo pago", ""]} empty={recurring.length === 0}>
            {recurring.map((r) => {
              const next = r.active ? nextDue(r) : null;
              return (
                <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                  <td className={td}>
                    <span className="font-medium whitespace-nowrap">{r.name}</span>
                    <p className="text-xs text-slate-400">{CATEGORY_LABEL[r.category] ?? r.category}{r.vendor && ` · ${r.vendor}`}</p>
                  </td>
                  <td className={td}>{FREQ_LABEL[r.frequency as Frequency] ?? r.frequency}<p className="text-xs text-slate-400">Día {r.dueDay}</p></td>
                  <td className={`${td} text-right font-mono tabular-nums`}>{money(r.amount, cur)}</td>
                  <td className={`${td} text-right font-mono tabular-nums text-slate-500`}>{money(Math.round(monthlyEquivalent(r)), cur)}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {!r.active ? <Badge>Pausado</Badge> : next ? new Date(`${next}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : <Badge>Terminado</Badge>}
                  </td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    {canWrite && (
                      <span className="inline-flex gap-1">
                        <RowAction action={toggleRecurring} fields={{ id: r.id }} label={r.active ? "Pausar" : "Reactivar"} />
                        <RowAction action={deleteRecurring} fields={{ id: r.id }} label="Eliminar" tone="danger" />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>

        {canWrite && (
          <Card title="Nuevo gasto fijo">
            <ActionForm action={addRecurring} className="space-y-3">
              <Field label="Nombre *"><input name="name" required className={input} placeholder="Ej. Arriendo bodega" /></Field>
              <Field label="Categoría *"><CategorySelect /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valor *"><input type="number" name="amount" min="0" step="any" required className={input} /></Field>
                <Field label="Frecuencia">
                  <select name="frequency" defaultValue="monthly" className={input}>
                    {(Object.keys(FREQ_MONTHS) as Frequency[]).map((k) => <option key={k} value={k}>{FREQ_LABEL[k]}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Día de pago"><input type="number" name="dueDay" min="1" max="31" defaultValue="5" className={input} /></Field>
                <Field label="Desde *" hint="Ancla los cobros trimestrales o anuales"><input type="month" name="startOn" required defaultValue={thisYm} className={input} /></Field>
              </div>
              <Field label="Hasta" hint={`Vacío = sin fecha final. Ej. ${monthLabel(addMonths(thisYm, 12))}`}><input type="month" name="endOn" className={input} /></Field>
              <Field label="Proveedor"><input name="vendor" className={input} /></Field>
              <Field label="Notas"><textarea name="notes" rows={2} className={input} /></Field>
              <SubmitButton className={btn.primary}>Guardar</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
