import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { Card, PageHeader, Stat } from "@/components/ui";
import { compactCop, money } from "@/lib/ui/format";
import { CATEGORY_LABEL, FIN_CATEGORIES, loadFinance, monthLabel } from "@/lib/apps/finance";
import { markRecurringPaid } from "./actions";
import { Bar, MonthNav, monthParam, RowAction, tone } from "./shared";

export const metadata = { title: "Finanzas" };

const KIND_LABEL = { fixed: "Gasto fijo", bill: "Proveedor", payroll: "Nómina" } as const;

export default async function FinanceSummary({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await requireModule("finance", "finance.read");
  const ym = await monthParam(searchParams);
  const f = await loadFinance(ctx, ym);
  const cur = ctx.org.currency;
  const canWrite = ctx.can("finance.write");
  const result = f.income.total - f.cost.total;
  const budgetTotal = Object.values(f.budget).reduce((a, b) => a + b, 0);

  // Categorías con gasto o presupuesto, de mayor a menor
  const cats = FIN_CATEGORIES.map((c) => ({ ...c, spent: f.cost.by[c.id] ?? 0, budget: f.budget[c.id] ?? 0 }))
    .filter((c) => c.spent || c.budget)
    .sort((a, b) => b.spent - a.spent);
  const trendMax = Math.max(1, ...f.trend.flatMap((t) => [t.income, t.cost]));

  return (
    <>
      <PageHeader
        title="Finanzas"
        subtitle="Cómo va el mes: lo que entra, lo que sale y lo que viene. Toma facturas, compras, nómina y flota de las demás apps."
        actions={<MonthNav ym={ym} path="/finance" />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ingresos del mes" value={money(f.income.total, cur)} hint={f.income.scheduled ? `+ ${compactCop(f.income.scheduled)} proyectados` : "Facturado sin IVA + otros ingresos"} href={`/finance/income?month=${ym}`} />
        <Stat label="Costos del mes" value={money(f.cost.total, cur)} hint={budgetTotal ? `Presupuesto ${compactCop(budgetTotal)}` : "Sin presupuesto cargado"} href={`/finance/expenses?month=${ym}`} />
        <Stat label="Resultado" value={<span className={tone(result)}>{money(result, cur)}</span>} hint={f.income.total ? `Margen ${Math.round((result / f.income.total) * 100)} %` : "Ingresos − costos"} />
        <Stat label="Gastos fijos al mes" value={money(f.fixedMonthly, cur)} hint="Equivalente mensual" href="/finance/fixed" />
        <Stat label="Cobrado en el mes" value={money(f.collected, cur)} hint="Pagos de clientes recibidos" href="/invoicing/payments" />
        <Stat label="Cartera por cobrar" value={money(f.receivable, cur)} hint="Facturas de cliente abiertas" href="/invoicing?filter=open" />
        <Stat label="Cuentas por pagar" value={money(f.payable, cur)} hint="Facturas de proveedor abiertas" href="/invoicing/bills" />
        <Stat label="Próximos 30 días" value={money(f.upcoming.reduce((a, u) => a + u.amount, 0), cur)} hint={`${f.upcoming.length} pagos programados`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title={`Costos por categoría · ${monthLabel(ym, { month: "long" })}`} className="lg:col-span-3"
          actions={<Link href={`/finance/budget?month=${ym}`} className="text-xs text-[var(--ork-violet)] hover:underline">Editar presupuesto</Link>}>
          {cats.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay costos ni presupuesto para este mes.</p>
          ) : (
            <ul className="space-y-3">
              {cats.map((c) => {
                const over = c.budget > 0 && c.spent > c.budget;
                return (
                  <li key={c.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-slate-700">
                        {c.label}
                        {"auto" in c && c.auto && <span className="ml-1.5 text-[11px] text-slate-400">auto</span>}
                        {c.id === "payroll" && f.cost.payrollEstimated && <span className="ml-1.5 text-[11px] text-amber-600">estimada</span>}
                      </span>
                      <span className="font-mono text-xs tabular-nums">
                        <span className={over ? "text-rose-600" : "text-slate-900"}>{money(c.spent, cur)}</span>
                        {c.budget > 0 && <span className="text-slate-400"> / {money(c.budget, cur)}</span>}
                      </span>
                    </div>
                    <Bar value={c.spent} max={c.budget || c.spent} over={over} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Próximos pagos (30 días)" className="lg:col-span-2" padded={false}>
          {f.upcoming.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">Nada programado en los próximos 30 días.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {f.upcoming.slice(0, 12).map((u, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="w-14 shrink-0 text-xs text-slate-500">{new Date(`${u.date}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
                  <span className="min-w-0 flex-1">
                    {u.href ? <Link href={u.href} className="block truncate font-medium hover:underline">{u.label}</Link> : <span className="block truncate font-medium">{u.label}</span>}
                    <span className="block truncate text-xs text-slate-400">{KIND_LABEL[u.kind]} · {u.detail}</span>
                  </span>
                  <span className="font-mono text-xs tabular-nums">{money(u.amount, cur)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {f.cost.pending.length > 0 && (
        <Card title={`Gastos fijos pendientes de ${monthLabel(ym, { month: "long" })}`} className="mt-6" padded={false}>
          <ul className="divide-y divide-slate-100">
            {f.cost.pending.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-xs text-slate-400">{CATEGORY_LABEL[r.category]}{r.vendor && ` · ${r.vendor}`}</span>
                </span>
                <span className="font-mono text-xs tabular-nums">{money(r.amount, cur)}</span>
                {canWrite && <RowAction action={markRecurringPaid} fields={{ id: r.id, month: ym }} label="Marcar pagado" />}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Últimos 12 meses" className="mt-6">
        <div className="mb-3 flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Ingresos</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--ork-violet)]" />Costos</span>
        </div>
        <div className="flex h-44 items-end gap-1.5 sm:gap-3">
          {f.trend.map((t) => (
            <Link key={t.m} href={`/finance?month=${t.m}`} className={`group flex h-full flex-1 flex-col justify-end gap-1 rounded-md ${t.m === ym ? "bg-slate-100" : ""}`}
              title={`${monthLabel(t.m)} · Ingresos ${money(t.income, cur)} · Costos ${money(t.cost, cur)}`}>
              <div className="flex flex-1 items-end justify-center gap-0.5 px-0.5">
                <div className="w-1/2 max-w-4 rounded-t bg-emerald-500 group-hover:opacity-80" style={{ height: `${(t.income / trendMax) * 100}%` }} />
                <div className="w-1/2 max-w-4 rounded-t bg-[var(--ork-violet)] group-hover:opacity-80" style={{ height: `${(t.cost / trendMax) * 100}%` }} />
              </div>
              <span className="pb-1 text-center text-[10px] capitalize text-slate-500">{monthLabel(t.m, { month: "short" }).replace(".", "")}</span>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
