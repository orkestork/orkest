"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, compliance, weekday, type Cell, type DayStatus } from "@/lib/apps/commercial-calendar";
import type { CalendarData } from "@/lib/apps/commercial-calendar-data";
import { closeDayAction } from "../actions";
import { cls, fmtMoney, PageTitle } from "../ui";
import { ConfigModal } from "./config-modal";

const COLORS: Record<DayStatus, string> = {
  GREEN: "#10b981", YELLOW: "#f59e0b", RED: "#e11d48", GRAY: "#d0c8bc", PENDING: "#bda5ff", FUTURE: "transparent",
};
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DOW_FULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mondayOf = (key: string) => addDays(key, -((weekday(key) + 6) % 7));
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
const longDate = (key: string) => {
  const d = new Date(`${key}T12:00:00Z`);
  return `${DOW_FULL[d.getUTCDay()]}, ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()].toLowerCase()} de ${d.getUTCFullYear()}`;
};

function statusLabel(c: Cell) {
  if (c.status === "GREEN") return c.late ? "Reportado con retraso" : c.noSales ? "Sin ventas confirmado" : "Reportado";
  if (c.status === "YELLOW") return "Parcial";
  if (c.status === "RED") return "Sin reporte";
  if (c.status === "PENDING") return "Pendiente";
  if (c.status === "GRAY") return ({ holiday: "Festivo", nonworking: "No laborable", inactive: "Inactivo", untracked: "Sin seguimiento" })[c.reason ?? "nonworking"];
  return "";
}

function Dot({ status, late, size = 12 }: { status: DayStatus; late?: boolean; size?: number }) {
  return (
    <span className="inline-block shrink-0 rounded-full" style={{
      width: size, height: size, background: COLORS[status],
      border: status === "FUTURE" ? "1.5px solid #d0c8bc" : undefined,
      boxShadow: late ? "0 0 0 2px #fff, 0 0 0 3.5px #f59e0b" : undefined,
    }} />
  );
}

/** Marca de "campaña nueva publicada ese día". */
const NewMark = ({ className = "" }: { className?: string }) => (
  <span title="Campaña nueva" className={`inline-block h-2 w-2 rotate-45 rounded-[2px] bg-[var(--ork-violet)] ${className}`} />
);

/** Estado agregado de un día para la fila General. */
function aggregate(cells: Cell[]): DayStatus {
  const live = cells.filter((c) => c.status !== "GRAY");
  if (live.length === 0) return cells.length ? "GRAY" : "FUTURE";
  if (live.every((c) => c.status === "FUTURE")) return "FUTURE";
  const act = live.filter((c) => c.status !== "FUTURE");
  if (act.every((c) => c.status === "GREEN")) return "GREEN";
  if (act.every((c) => c.status === "RED")) return "RED";
  if (act.some((c) => c.status === "PENDING") && !act.some((c) => c.status === "RED")) return "PENDING";
  return "YELLOW";
}

const pctColor = (p: number | null) => (p === null ? "#d0c8bc" : p >= 80 ? "#10b981" : p >= 50 ? "#f59e0b" : "#e11d48");

function Delta({ cur, prev, unit = "", inverse, label }: { cur: number | null; prev: number | null; unit?: string; inverse?: boolean; label: string }) {
  if (cur === null || prev === null) return <span className="text-[11px] text-slate-400">{label}: sin datos</span>;
  const diff = cur - prev;
  if (diff === 0) return <span className="text-[11px] text-slate-400">= {label}</span>;
  const good = inverse ? diff < 0 : diff > 0;
  return (
    <span className={`text-[11px] font-semibold ${good ? "text-emerald-700" : "text-rose-700"}`}>
      {diff > 0 ? "↑" : "↓"} {Math.abs(diff)}{unit} <span className="font-normal text-slate-400">vs. {label}</span>
    </span>
  );
}

function Kpi({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className={`${cls.card} relative min-w-0 overflow-hidden p-4`}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
      <p className={cls.eyebrow}>{title}</p>
      {children}
    </div>
  );
}

export function CalendarView({ data, platform, nowMonth, userId, canManage, canWrite, currency, showCampaignsLink }: {
  data: CalendarData; platform: string; nowMonth: string; userId: string; canManage: boolean; canWrite: boolean; currency: string; showCampaignsLink: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const money = (n: number) => fmtMoney(n, currency);
  const month = data.month;
  const [sellerFilter, setSellerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState<"month" | "week">("month");
  const [weekStart, setWeekStart] = useState(() => mondayOf(data.today.startsWith(month) ? data.today : `${month}-01`));
  const [indSeller, setIndSeller] = useState(data.sellers[0]?.id ?? "");
  const [selDate, setSelDate] = useState(data.today.startsWith(month) ? data.today : `${month}-01`);
  const [tab, setTab] = useState<"sales" | "new" | "history">("sales");
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const go = (m: string, p = platform) => {
    const qs = new URLSearchParams({ month: m });
    if (p) qs.set("platform", p);
    start(() => router.push(`/campaigns/calendar?${qs}`, { scroll: false }));
  };

  // Al cambiar de mes o de datos, mantener selecciones válidas.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- al cambiar de mes se reajusta la selección a un vendedor y día válidos
    setIndSeller((cur) => (data.sellers.some((x) => x.id === cur) ? cur : data.sellers[0]?.id ?? ""));
    setSelDate((cur) => (cur && cur.startsWith(data.month) ? cur : data.today.startsWith(data.month) ? data.today : `${data.month}-01`));
  }, [data]);

  // Refresco cada 5 min: cubre el paso de la hora límite (Pendiente → Sin reporte) sin actividad.
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) router.refresh(); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [router]);

  const days = useMemo(() => {
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const n = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  }, [view, weekStart, month]);

  const visibleSellers = useMemo(() => data.sellers.filter((x) => {
    if (sellerFilter && x.id !== sellerFilter) return false;
    if (statusFilter) return days.some((d) => x.cells[d]?.status === statusFilter);
    return true;
  }), [data, sellerFilter, statusFilter, days]);

  const monthOptions = useMemo(() => [...new Set([...data.months, month, nowMonth])].sort().reverse(), [data.months, month, nowMonth]);

  const shiftWeek = (delta: number) => {
    const ws = addDays(weekStart, delta * 7);
    setWeekStart(ws);
    const m = addDays(ws, 6).slice(0, 7); // el fin de semana fija el mes: el inicio cae en este o el anterior, ambos cargados
    if (m !== month) go(m);
  };
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    go(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7));
  };

  const pick = (sellerId: string, date: string) => {
    setIndSeller(sellerId);
    setSelDate(date);
    setTab("sales");
    if (window.innerWidth < 1024) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const seller = data.sellers.find((x) => x.id === indSeller);
  const cell = seller?.cells[selDate];

  const closeDay = async () => {
    if (!seller || !cell) return;
    setClosing(true);
    setError(null);
    const r = await closeDayAction({ sellerId: seller.id, date: cell.date, noSales: cell.total === 0 });
    setClosing(false);
    if (!r.ok) setError(r.error); else start(() => router.refresh());
  };

  // Calendario individual: grilla lun-dom del mes.
  const grid = useMemo(() => {
    const lead = (weekday(`${month}-01`) + 6) % 7;
    const n = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)] as (string | null)[];
  }, [month]);

  const k = data.kpis;
  const isCurrentMonth = month === nowMonth;
  const trmOf = data.trm[selDate];
  const invUsd = cell?.rows.reduce((t, r) => t + r.presupuestoUsd, 0) ?? 0;
  const roas = cell && trmOf && invUsd > 0 ? cell.total / (invUsd * trmOf) : null;
  const fmtStamp = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: data.timezone, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const canClose = !!cell && !cell.closed && cell.date <= data.today && cell.status !== "GRAY" && canWrite && (canManage || seller?.id === userId);

  return (
    <div className="min-w-0">
      <PageTitle
        eyebrow="Comercial"
        title="Calendario de actividad comercial"
        subtitle={<>Control de reportes diarios de ventas y publicación de campañas{pending && " · actualizando…"}</>}
        actions={<>
          {canManage && <button onClick={() => setShowConfig(true)} className={cls.secondary}>Configurar</button>}
          {showCampaignsLink && canWrite && <Link href="/campaigns" className={cls.primary}>+ Nueva campaña</Link>}
        </>}
      />

      {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {/* KPIs */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi title="Vendedores que reportaron hoy" accent="var(--ork-purple)">
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--ork-ink)]">{k.today.reported} de {k.today.expected}</p>
          <span className="text-[11px] text-slate-400">Ayer: {k.yesterday.reported} de {k.yesterday.expected}</span>
        </Kpi>
        <Kpi title="Vendedores pendientes" accent="#e11d48">
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--ork-ink)]">{k.pending}</p>
          <Delta cur={k.pending} prev={k.yesterdayPending} inverse label="ayer" />
        </Kpi>
        <Kpi title={`Cumplimiento ${isCurrentMonth ? "del mes" : monthLabel(month)}`} accent="#10b981">
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--ork-ink)]">{k.month.pct != null ? `${k.month.pct}%` : "Sin datos"}</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${k.month.pct ?? 0}%`, background: pctColor(k.month.pct) }} /></div>
          <span className="text-[11px] text-slate-400">{k.month.done} de {k.month.expected} reportes</span>
        </Kpi>
        <Kpi title={`Ventas registradas hoy (${currency})`} accent="#10b981">
          <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-[var(--ork-ink)]">{money(k.today.sales)}</p>
          <span className="text-[11px] text-slate-400">Ayer: {money(k.yesterday.sales)}</span>
        </Kpi>
        <Kpi title={`Campañas nuevas ${isCurrentMonth ? "este mes" : "del mes"}`} accent="var(--ork-violet)">
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--ork-ink)]">{k.month.newCampaigns}</p>
          <Delta cur={k.month.newCampaigns} prev={k.prevMonth.newCampaigns} label="mes anterior" />
        </Kpi>
        <Kpi title="Reportes con retraso" accent="#f59e0b">
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--ork-ink)]">{k.month.late}</p>
          <Delta cur={k.month.late} prev={k.prevMonth.late} inverse label="mes anterior" />
        </Kpi>
      </div>

      {/* Filtros */}
      <div className={`${cls.card} mb-5 flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center`}>
        <select aria-label="Mes" value={month} onChange={(e) => { setWeekStart(mondayOf(`${e.target.value}-01`)); go(e.target.value); }} className={`${cls.input} sm:w-[190px]`}>
          {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-500">Vendedor
          <select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} className={`${cls.input} sm:min-w-[150px]`}>
            <option value="">Todos</option>
            {data.sellers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-500">Plataforma
          <select value={platform} onChange={(e) => go(month, e.target.value)} className={`${cls.input} sm:min-w-[140px]`}>
            <option value="">Todas</option>
            {data.platforms.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-500">Estado
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${cls.input} sm:min-w-[140px]`}>
            <option value="">Todos</option><option value="GREEN">Reportado</option><option value="YELLOW">Parcial</option>
            <option value="RED">Sin reporte</option><option value="PENDING">Pendiente</option>
          </select>
        </label>
        <div className="inline-flex rounded-full border border-slate-300 bg-white p-0.5 sm:ml-auto" role="tablist">
          {(["month", "week"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${view === v ? "bg-[var(--ork-purple)] text-white" : "text-slate-600"}`}>
              {v === "month" ? "Vista mensual" : "Vista semanal"}
            </button>
          ))}
        </div>
      </div>

      {/* Calendario general */}
      <section className={`${cls.card} mb-5 min-w-0 p-4 sm:p-5`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">Calendario general de vendedores</h2>
            <p className="mt-1 text-sm text-slate-500">Estado del reporte diario de ventas y campañas</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            {([["GREEN", "Reportado"], ["YELLOW", "Parcial"], ["RED", "Sin reporte"], ["GRAY", "No laborable"], ["PENDING", "Pendiente"]] as [DayStatus, string][]).map(([st, l]) => (
              <span key={st} className="inline-flex items-center gap-1.5"><Dot status={st} size={9} />{l}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><Dot status="GREEN" late size={9} />Con retraso</span>
            <span className="inline-flex items-center gap-1.5"><NewMark />Campaña nueva</span>
          </div>
        </div>

        {view === "week" && (
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
            <button aria-label="Semana anterior" onClick={() => shiftWeek(-1)} className={cls.small}>‹</button>
            <span>{weekStart.slice(8)}/{weekStart.slice(5, 7)} – {addDays(weekStart, 6).slice(8)}/{addDays(weekStart, 6).slice(5, 7)}</span>
            <button aria-label="Semana siguiente" onClick={() => shiftWeek(1)} className={cls.small}>›</button>
          </div>
        )}

        {visibleSellers.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Sin vendedores para mostrar.{canManage && " El calendario incluye a quien tenga campañas o un rol con alcance «solo sus campañas»."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[140px] bg-slate-50 px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Vendedor</th>
                  {days.map((d) => (
                    <th key={d} className={`bg-slate-50 px-1 py-2 text-center text-[10px] font-medium ${d === data.today ? "text-[var(--ork-violet)]" : "text-slate-400"}`}>
                      <div>{DOW[weekday(d)]}</div><div className="text-[11px] font-semibold">{Number(d.slice(8))}</div>
                    </th>
                  ))}
                  <th className="min-w-[120px] bg-slate-50 px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {visibleSellers.map((x) => {
                  const comp = compliance(days.map((d) => x.cells[d]).filter(Boolean), (d) => x.workDays.includes(weekday(d)));
                  return (
                    <tr key={x.id}>
                      <td className="sticky left-0 z-10 border-t border-slate-100 bg-white px-3 py-2">
                        <button onClick={() => pick(x.id, selDate || days[0])} className="flex items-center gap-2 text-left font-medium text-[var(--ork-ink)] hover:text-[var(--ork-violet)]">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--ork-lavender)]/35 text-[10px] font-bold text-[var(--ork-purple)]">{initials(x.name)}</span>
                          <span className="truncate">{x.name}</span>
                        </button>
                      </td>
                      {days.map((d) => {
                        const c = x.cells[d];
                        return (
                          <td key={d} className={`border-t border-slate-100 px-1 py-2 text-center ${d === selDate && x.id === indSeller ? "bg-[var(--ork-lavender)]/20" : ""}`}>
                            {c ? (
                              <button onClick={() => pick(x.id, d)} aria-label={`${x.name} ${d}: ${statusLabel(c)}`} title={statusLabel(c)} className="relative inline-flex items-center justify-center p-1">
                                <Dot status={c.status} late={c.late} />
                                {c.newCampaigns.length > 0 && <NewMark className="absolute -right-0.5 -top-0.5" />}
                              </button>
                            ) : <span className="text-slate-200">·</span>}
                          </td>
                        );
                      })}
                      <td className="border-t border-slate-100 px-3 py-2">
                        {comp.pct === null ? <span className="text-slate-400">Sin datos</span> : (
                          <div className="flex items-center gap-2">
                            <span className="w-9 font-semibold tabular-nums text-slate-700">{comp.pct}%</span>
                            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full" style={{ width: `${comp.pct}%`, background: pctColor(comp.pct) }} /></span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="sticky left-0 z-10 border-t-2 border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-[var(--ork-ink)]">General</td>
                  {days.map((d) => (
                    <td key={d} className="border-t-2 border-slate-200 bg-slate-50 px-1 py-2 text-center"><Dot status={aggregate(visibleSellers.map((x) => x.cells[d]).filter(Boolean))} /></td>
                  ))}
                  <td className="border-t-2 border-slate-200 bg-slate-50 px-3 py-2 font-semibold tabular-nums text-slate-700">
                    {(() => {
                      const all = visibleSellers.flatMap((x) => days.map((d) => x.cells[d]).filter(Boolean).filter((c) => x.workDays.includes(weekday(c.date))));
                      const p = compliance(all, () => true).pct;
                      return p === null ? "Sin datos" : `${p}%`;
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Revisión */}
      <section className={`${cls.card} mb-5 p-4 sm:p-5`}>
        {(() => {
          const flagged = data.alerts.filter((a) => a.items.length > 0);
          const ok = data.alerts.filter((a) => a.items.length === 0);
          return (
            <>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">Vendedores que requieren revisión</h2>
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${flagged.length ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}>
                  {flagged.length ? `${flagged.length} de ${data.alerts.length} con pendientes` : "Todos al día"}
                </span>
              </div>
              <p className="mb-4 max-w-3xl text-sm text-slate-500">
                Quién no ha cargado sus ventas en los últimos 14 días. No cuentan días no laborables, festivos ni días anteriores al inicio del seguimiento. Haz clic en un vendedor para ver su calendario.
              </p>
              {flagged.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {flagged.map((a) => (
                    <button key={a.sellerId} onClick={() => pick(a.sellerId, data.today)} className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-left transition hover:border-[var(--ork-violet)]">
                      <p className="flex items-center gap-2 text-sm font-medium text-[var(--ork-ink)]">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-[10px] font-bold text-amber-800">{initials(a.name)}</span>{a.name}
                      </p>
                      <ul className="mt-2 space-y-1">
                        {a.items.map((t) => <li key={t} className="text-xs text-amber-900">• {t}</li>)}
                      </ul>
                    </button>
                  ))}
                </div>
              )}
              {ok.length > 0 && (
                <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 ${flagged.length ? "mt-3" : ""}`}>
                  <span className="text-sm font-medium text-emerald-800">Al día</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ok.map((a) => <button key={a.sellerId} onClick={() => pick(a.sellerId, data.today)} className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 hover:border-[var(--ork-violet)]">{a.name}</button>)}
                  </div>
                  <span className="text-xs text-slate-500">Sin reportes atrasados ni fuera de plazo.</span>
                </div>
              )}
              {data.alerts.length === 0 && <p className="text-sm text-slate-400">Sin vendedores en seguimiento.</p>}
            </>
          );
        })()}
        {data.spendingNoSales.length > 0 && (() => {
          const list = [...data.spendingNoSales].sort((x, y) => y.usd - x.usd);
          const total = list.reduce((t, c) => t + c.usd, 0);
          const max = list[0]?.usd || 1;
          return (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--ork-ink)]">Campañas activas con inversión y sin ventas</h3>
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-800 ring-1 ring-inset ring-amber-200">
                  {list.length} {list.length === 1 ? "campaña" : "campañas"} · US${total.toFixed(2)} · últimos 3 días
                </span>
              </div>
              <p className="mb-3 text-xs text-slate-500">Si el vendedor aún no cargó las ventas de hoy, puede ser una falsa alarma.</p>
              <div className="overflow-x-auto">
                <div className="min-w-[520px]">
                  <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(90px,1fr)_64px] gap-3 pb-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    <span>Campaña</span><span>Vendedor</span><span>Peso en la inversión</span><span className="text-right">USD</span>
                  </div>
                  {list.map((c) => (
                    <div key={c.campaignId} className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(90px,1fr)_64px] items-center gap-3 border-t border-slate-100 py-2.5 text-sm">
                      <span className="truncate font-medium text-[var(--ork-ink)]">{c.name.trim()}</span>
                      <span className="truncate text-slate-500">{c.seller}</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[var(--ork-pink)]" style={{ width: `${Math.max(4, (c.usd / max) * 100)}%` }} /></span>
                      <span className="text-right font-semibold tabular-nums text-[var(--ork-pink)]">{c.usd.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </section>

      {/* Individual + detalle */}
      <div ref={detailRef} className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className={`${cls.card} min-w-0 p-4 sm:p-5`}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">Calendario individual</h2>
              <p className="mt-1 text-sm text-slate-500">Detalle de actividad de un vendedor</p>
            </div>
            <div className="flex items-center gap-2">
              <select aria-label="Vendedor" value={indSeller} onChange={(e) => setIndSeller(e.target.value)} className={`${cls.input} w-[170px]`}>
                {data.sellers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <button aria-label="Mes anterior" onClick={() => shiftMonth(-1)} className={cls.small}>‹</button>
              <span className="min-w-[110px] text-center text-sm font-medium text-slate-700">{monthLabel(month)}</span>
              <button aria-label="Mes siguiente" onClick={() => shiftMonth(1)} className={cls.small}>›</button>
            </div>
          </div>
          {!seller ? <p className="py-10 text-center text-sm text-slate-400">Sin datos.</p> : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[560px] grid-cols-7 gap-1.5">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <div key={d} className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-slate-400">{d}</div>)}
                {grid.map((d, i) => {
                  if (!d) return <div key={`b${i}`} />;
                  const c = seller.cells[d];
                  const active = d === selDate;
                  return (
                    <button key={d} onClick={() => { setSelDate(d); setTab("sales"); }}
                      className={`min-h-[84px] rounded-xl border p-2 text-left transition ${active ? "border-[var(--ork-violet)] bg-[var(--ork-lavender)]/20 ring-2 ring-[var(--ork-violet)]/20" : "border-slate-200 hover:border-[var(--ork-violet)]"} ${c?.status === "GRAY" ? "bg-slate-50" : "bg-white"}`}>
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                        <span>{Number(d.slice(8))}</span>
                        {c && c.newCampaigns.length > 0 && <NewMark />}
                      </div>
                      {c && c.status !== "FUTURE" && (
                        <div className="mt-1 space-y-0.5">
                          <div className="flex items-center gap-1 text-[10px] font-medium" style={{ color: c.status === "RED" ? "#be123c" : c.status === "GRAY" ? "#a39a8e" : "#5c544b" }}>
                            <Dot status={c.status} late={c.late} size={9} />
                            <span className="truncate">{c.status === "GREEN" ? "" : statusLabel(c)}</span>
                          </div>
                          {(c.status === "GREEN" || c.total > 0) && <p className="truncate text-[11px] font-semibold tabular-nums text-emerald-700">{money(c.total)}</p>}
                          {c.campaignsWithSales > 0 && <p className="text-[10px] text-slate-400">{c.campaignsWithSales} {c.campaignsWithSales === 1 ? "campaña" : "campañas"}</p>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <aside className={`${cls.card} min-w-0 p-4 sm:p-5`}>
          {!cell || !seller ? <p className="py-10 text-center text-sm text-slate-400">Selecciona un día.</p> : (
            <>
              <p className={cls.eyebrow}>{seller.name}</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--ork-ink)]">{longDate(cell.date)}</h2>

              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Dot status={cell.status} late={cell.late} size={16} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--ork-ink)]">{statusLabel(cell.status === "FUTURE" ? { ...cell, status: "PENDING" } : cell)}</p>
                    <p className="truncate text-[11px] text-slate-400">{cell.lastUpdate ? `Última actualización: ${fmtStamp(cell.lastUpdate)}` : "Sin actualizaciones"}</p>
                  </div>
                </div>
                {showCampaignsLink && <Link href="/campaigns" className={cls.small}>Editar</Link>}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { l: `Ventas del día (${currency})`, v: money(cell.total) },
                  { l: "Campañas con ventas", v: String(cell.campaignsWithSales) },
                  { l: "Campañas nuevas", v: String(cell.newCampaigns.length) },
                ].map((x) => (
                  <div key={x.l} className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5">
                    <p className="text-[10px] font-medium leading-tight text-slate-500">{x.l}</p>
                    <p className="mt-1 truncate text-base font-semibold tabular-nums text-[var(--ork-ink)]">{x.v}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex gap-4 border-b border-slate-200 text-sm font-medium" role="tablist">
                {([["sales", "Ventas por campaña"], ["new", `Campaña nueva (${cell.newCampaigns.length})`], ["history", "Historial"]] as const).map(([id, l]) => (
                  <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`-mb-px border-b-2 pb-2 ${tab === id ? "border-[var(--ork-purple)] text-[var(--ork-purple)]" : "border-transparent text-slate-400"}`}>{l}</button>
                ))}
              </div>

              {tab === "sales" && (
                <div className="mt-3">
                  {cell.rows.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">Sin registros en la matriz para este día.</p> : (
                    <>
                      <table className="w-full text-xs">
                        <thead><tr className="text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          <th className="py-1.5">Campaña</th><th className="py-1.5">Plataforma</th><th className="py-1.5 text-right">Venta</th>
                        </tr></thead>
                        <tbody>
                          {cell.rows.map((r) => (
                            <tr key={r.campaignId} className="border-t border-slate-100">
                              <td className="py-2 pr-2 font-medium text-slate-700">{r.name}</td>
                              <td className="py-2 pr-2 text-slate-500">{r.platform}</td>
                              <td className="py-2 text-right font-medium tabular-nums">{money(r.venta)}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-slate-200 bg-[var(--ork-lavender)]/20">
                            <td className="px-1 py-2 font-semibold text-[var(--ork-purple)]" colSpan={2}>Total del día</td>
                            <td className="py-2 text-right font-semibold tabular-nums text-[var(--ork-purple)]">{money(cell.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Mensajes {cell.rows.reduce((t, r) => t + r.mensajes, 0)} · Transacciones {cell.rows.reduce((t, r) => t + r.transacciones, 0)}
                        {roas !== null && <> · ROAS {roas.toFixed(2)}x</>}
                      </p>
                    </>
                  )}
                </div>
              )}

              {tab === "new" && (
                <div className="mt-3 space-y-2">
                  {cell.newCampaigns.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No se publicaron campañas nuevas este día.</p>}
                  {cell.newCampaigns.map((c) => (
                    <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                      <p className="text-sm font-medium text-[var(--ork-ink)]">{c.name}</p>
                      <p className="mt-1 text-slate-500">Vendedor: {seller.name} · {c.platform} · {c.status === "ACTIVE" ? "Activa" : "Pausada"}</p>
                      <p className="text-slate-500">Publicada: {fmtStamp(c.createdAt)}{c.initialUsd ? ` · Inversión inicial US$${c.initialUsd.toFixed(2)}` : ""}</p>
                    </div>
                  ))}
                </div>
              )}

              {tab === "history" && (
                <ul className="mt-3 space-y-2">
                  {cell.events.length === 0 && <li className="py-4 text-center text-sm text-slate-400">Sin historial para este día.</li>}
                  {cell.events.map((e, i) => (
                    <li key={i} className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600">
                      <b>{e.kind === "CLOSE" ? "Cierre del día" : "Venta registrada"}</b> · {money(e.value)}
                      <div className="text-slate-400">{fmtStamp(e.at)} · {e.actor}</div>
                    </li>
                  ))}
                </ul>
              )}

              {canClose && (
                <button onClick={closeDay} disabled={closing} className={`${cls.secondary} mt-4 w-full`}>
                  {closing ? "Guardando…" : cell.total === 0 ? "Confirmar día sin ventas" : "Finalizar reporte del día"}
                </button>
              )}
            </>
          )}
        </aside>
      </div>

      {showConfig && <ConfigModal onClose={() => setShowConfig(false)} onSaved={() => start(() => router.refresh())} />}
    </div>
  );
}
