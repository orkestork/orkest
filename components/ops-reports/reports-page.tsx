import { ActionForm, SubmitButton } from "@/components/action-form";
import { RangeFilter } from "@/components/ops";
import { btn, Card, Field, input, PageHeader, Stat } from "@/components/ui";
import { orgPeople } from "@/lib/core/members";
import type { OrgContext } from "@/lib/core/context";
import { buildKpis, KPI_LABELS, REPORT_MODULES, type ReportModule } from "@/lib/apps/ops-reports";
import { rangeFrom } from "@/lib/apps/ops-shared";
import { date, money, num } from "@/lib/ui/format";
import { saveOpsReport } from "@/app/(app)/ops-report-actions";

const fmt = (k: string, v: number, currency: string) => (k === "costoTotal" ? money(v, currency) : num(v));

/** Informes de periodo de un área de operaciones: indicadores en vivo + informes cerrados. */
export async function OpsReportsPage({ ctx, module, sp }: { ctx: OrgContext; module: ReportModule; sp: Record<string, string | string[] | undefined> }) {
  const { from, to } = rangeFrom(sp);
  const [live, reports, people] = await Promise.all([
    buildKpis(ctx, module, from, to),
    ctx.db.operationsReport.findMany({ where: { module }, orderBy: { periodStart: "desc" }, take: 50 }),
    orgPeople(ctx),
  ]);
  const who = new Map(people.map((p) => [p.id, p.name]));
  return (
    <>
      <PageHeader title={`Informes · ${REPORT_MODULES[module].label}`} subtitle="Indicadores del periodo. Al guardar el informe quedan fijos aunque luego se corrijan registros." />
      <RangeFilter from={from} to={to} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Object.entries(live).map(([k, v]) => <Stat key={k} label={KPI_LABELS[k] ?? k} value={fmt(k, v, ctx.org.currency)} />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {reports.length === 0 && <p className="text-sm text-slate-400">Aún no hay informes guardados.</p>}
          {reports.map((r) => (
            <Card key={r.id} title={`${date(r.periodStart)} — ${date(r.periodEnd)}`} actions={<span className="text-xs text-slate-500">{who.get(r.authorId) ?? "—"} · {date(r.createdAt)}</span>}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
                {Object.entries(r.kpis as Record<string, number>).map(([k, v]) => <div key={k} className="flex justify-between gap-2 border-b border-slate-100 py-1"><dt className="text-slate-500">{KPI_LABELS[k] ?? k}</dt><dd className="font-medium tabular-nums">{fmt(k, v, ctx.org.currency)}</dd></div>)}
              </dl>
              {r.notes && <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{r.notes}</p>}
            </Card>
          ))}
        </div>
        {ctx.can(`${module}.write`) && (
          <Card title="Guardar informe del periodo">
            <ActionForm action={saveOpsReport} className="space-y-3">
              <input type="hidden" name="module" value={module} />
              <Field label="Desde"><input type="date" name="from" defaultValue={from} required className={input} /></Field>
              <Field label="Hasta"><input type="date" name="to" defaultValue={to} required className={input} /></Field>
              <Field label="Notas y hallazgos"><textarea name="notes" rows={5} className={input} /></Field>
              <SubmitButton className={btn.primary}>Guardar informe</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
