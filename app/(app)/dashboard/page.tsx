import Link from "@/components/plink";
import { requireContext } from "@/lib/core/context";
import { availableBoards, makeRange, PERIODS, type Kpi, type RankTable } from "@/lib/analytics/boards";
import { AreaChart, BarChart, Legend } from "@/components/charts";
import { compactCop, money } from "@/lib/ui/format";
import { Overview } from "./overview";

export const metadata = { title: "Tableros" };

const fmt = (v: number, f: Kpi["format"]) =>
  f === "money" ? money(v) : f === "percent" ? `${v.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %` : v.toLocaleString("es-CO", { maximumFractionDigits: 1 });

const prevLabel = (k: Kpi) => (k.format === "money" ? compactCop(k.prev ?? 0) : fmt(k.prev ?? 0, k.format));

/** Variación: píldora con flecha + valor anterior explícito (el color nunca es la única señal). */
function Delta({ k }: { k: Kpi }) {
  if (k.prev === undefined) return <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-700">Hoy</span>;
  if (!k.prev) return <span className="text-xs text-stone-600">{k.value ? "Nuevo: antes 0" : "Sin movimiento"}</span>;
  const pct = ((k.value - k.prev) / Math.abs(k.prev)) * 100;
  const flat = Math.abs(pct) < 0.5;
  const good = k.invert ? pct <= 0 : pct >= 0;
  const tone = flat ? "bg-stone-100 text-stone-700" : good ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-rose-200";
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
      <span className={`rounded-md px-1.5 py-0.5 font-semibold tabular-nums ring-1 ring-inset ring-transparent ${tone}`}>
        {flat ? "=" : pct > 0 ? "▲" : "▼"} {Math.abs(pct).toLocaleString("es-CO", { maximumFractionDigits: pct > 100 ? 0 : 1 })} %
      </span>
      antes: {prevLabel(k)}
    </span>
  );
}

function Ranking({ t }: { t: RankTable }) {
  const max = Math.max(1, ...t.rows.map((r) => r.value));
  const val = (v: number) => (t.format === "money" ? money(v) : v.toLocaleString("es-CO", { maximumFractionDigits: 1 }));
  return (
    <section>
      <h3 className="mb-2 border-b border-[var(--ork-rule)] pb-2 font-display text-xl uppercase tracking-tight text-[var(--ork-purple)]">{t.title}</h3>
      {t.rows.length === 0 ? <p className="py-6 text-sm text-stone-400">Sin datos en el periodo.</p> : (
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className={t.columns[1] ? "w-[46%]" : "w-[70%]"} />
            {t.columns[1] && <col className="hidden w-[30%] sm:table-column" />}
            <col />
          </colgroup>
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-stone-500">
            <th className="py-1.5 font-medium">{t.columns[0]}</th>{t.columns[1] && <th className="hidden py-1.5 font-medium sm:table-cell">{t.columns[1]}</th>}<th className="py-1.5 text-right font-medium">{t.columns[2]}</th>
          </tr></thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i} className="group">
                <td className="relative py-1.5 pr-2">
                  <span className="absolute inset-y-1 left-0 rounded-md bg-[var(--ork-lavender)]/25 transition group-hover:bg-[var(--ork-lavender)]/45" style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} />
                  <span className="relative block truncate px-2">{r.href ? <Link href={r.href} className="text-[var(--ork-purple)] hover:underline">{r.cells[0]}</Link> : r.cells[0]}</span>
                </td>
                {t.columns[1] && <td className="hidden truncate py-1.5 pr-2 text-stone-600 sm:table-cell">{r.cells[1]}</td>}
                <td className="truncate whitespace-nowrap py-1.5 pl-2 text-right tabular-nums" title={val(r.value)}>{val(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function Dashboards({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const boards = availableBoards(ctx);
  const key = typeof sp.board === "string" ? sp.board : "overview";
  const board = boards.find((b) => b.key === key);
  const period = typeof sp.period === "string" && sp.period in PERIODS ? sp.period : "90";
  const offset = Math.max(0, Number(sp.offset ?? 0) || 0);
  const range = makeRange(period, offset);
  const data = board ? await board.compute(ctx, range) : null;
  const groups = [...new Set(boards.map((b) => b.group))];
  const href = (p: Record<string, string | number>) => `/dashboard?${new URLSearchParams({ board: key, period, offset: String(offset), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) })}`;

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100vh-57px)] sm:-mx-6">
      <aside className="hidden w-60 shrink-0 border-r border-[var(--ork-rule)] bg-white/50 px-4 py-6 lg:block">
        <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">General</p>
        <Link href="/dashboard" className={`block rounded-lg px-2 py-1.5 text-sm ${key === "overview" ? "bg-[var(--ork-purple)] font-medium text-white" : "text-stone-700 hover:bg-black/5"}`}>Mi día</Link>
        {groups.map((g) => (
          <div key={g} className="mt-5">
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{g}</p>
            {boards.filter((b) => b.group === g).map((b) => (
              <Link key={b.key} href={`/dashboard?board=${b.key}&period=${period}`} className={`block rounded-lg px-2 py-1.5 text-sm ${key === b.key ? "bg-[var(--ork-purple)] font-medium text-white" : "text-stone-700 hover:bg-black/5"}`}>{b.label}</Link>
            ))}
          </div>
        ))}
        {ctx.can("studio.manage") && <Link href="/studio/dashboards" className="mt-8 block px-2 text-xs text-stone-500 hover:text-stone-900">Personalizar “Mi día” →</Link>}
      </aside>

      <div className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        {/* Selector móvil */}
        <div className="mb-4 flex gap-1.5 overflow-x-auto lg:hidden">
          <Link href="/dashboard" className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${key === "overview" ? "border-[var(--ork-purple)] bg-[var(--ork-purple)] text-white" : "border-stone-300 bg-white"}`}>Mi día</Link>
          {boards.map((b) => <Link key={b.key} href={`/dashboard?board=${b.key}&period=${period}`} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${key === b.key ? "border-[var(--ork-purple)] bg-[var(--ork-purple)] text-white" : "border-stone-300 bg-white"}`}>{b.label}</Link>)}
        </div>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-stone-500">{board ? board.group : "General"}</p>
            <h1 className="font-display text-4xl uppercase leading-none tracking-tight">{board ? board.label : "Mi día"}</h1>
          </div>
          {board?.snapshot && <span className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-700">Corte al día de hoy</span>}
          {board && !board.snapshot && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-stone-300 bg-white p-0.5 text-xs">
                {Object.entries(PERIODS).map(([k, p]) => (
                  <Link key={k} href={href({ period: k, offset: 0 })} className={`rounded-full px-3 py-1.5 ${period === k ? "bg-[var(--ork-purple)] font-medium text-white" : "text-stone-600 hover:text-stone-900"}`}>{p.label.replace("Últimos ", "")}</Link>
                ))}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Link href={href({ offset: offset + 1 })} aria-label="Periodo anterior" className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 bg-white hover:border-[var(--ork-violet)]">‹</Link>
                <span className="min-w-40 text-center text-stone-600">{range.label}</span>
                {offset > 0 ? <Link href={href({ offset: offset - 1 })} aria-label="Periodo siguiente" className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 bg-white hover:border-[var(--ork-violet)]">›</Link>
                  : <span className="grid h-8 w-8 place-items-center rounded-full border border-stone-200 text-stone-300">›</span>}
              </div>
            </div>
          )}
        </div>

        {!board || !data ? <Overview ctx={ctx} /> : (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {data.kpis.map((k) => (
                <div key={k.label} className="flex flex-col rounded-2xl border border-[var(--ork-rule)] bg-white p-4 shadow-[0_1px_2px_rgba(17,16,15,.04)]">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-stone-800">{k.label}</p>
                    {k.prev === undefined && <Delta k={k} />}
                  </div>
                  <p className="mt-2 text-[1.9rem] font-semibold leading-none tracking-tight tabular-nums text-[var(--ork-ink)]" title={fmt(k.value, k.format)}>
                    {k.format === "money" && Math.abs(k.value) >= 1e7 ? compactCop(k.value) : fmt(k.value, k.format)}
                  </p>
                  <div className="mt-auto space-y-1 pt-3">
                    {k.prev !== undefined && <Delta k={k} />}
                    {k.hint && <p className="text-xs text-stone-600">{k.hint}</p>}
                  </div>
                </div>
              ))}
            </div>

            {data.chart && (
              <section className="rounded-2xl border border-[var(--ork-rule)] bg-white/90 p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-2xl uppercase tracking-tight text-[var(--ork-purple)]">{data.chart.title}</h2>
                  <Legend series={data.chart.series} />
                </div>
                {data.chart.kind === "area"
                  ? <AreaChart labels={data.chart.labels} series={data.chart.series} format={data.chart.format} />
                  : <BarChart labels={data.chart.labels} series={data.chart.series} format={data.chart.format} />}
                <details className="mt-2 text-xs text-stone-500">
                  <summary className="cursor-pointer select-none hover:text-stone-800">Ver datos en tabla</summary>
                  <table className="mt-2 w-full max-w-xl">
                    <thead><tr className="text-left"><th className="py-1 font-medium">Periodo</th>{data.chart.series.map((s) => <th key={s.name} className="py-1 text-right font-medium">{s.name}</th>)}</tr></thead>
                    <tbody>{data.chart.labels.map((l, i) => <tr key={l} className="border-t border-stone-100"><td className="py-1">{l}</td>{data.chart!.series.map((s) => <td key={s.name} className="py-1 text-right tabular-nums">{data.chart!.format === "money" ? money(s.values[i]) : s.values[i].toLocaleString("es-CO")}</td>)}</tr>)}</tbody>
                  </table>
                </details>
              </section>
            )}

            <div className="grid gap-8 xl:grid-cols-2">
              {data.tables.map((t) => <Ranking key={t.title} t={t} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
