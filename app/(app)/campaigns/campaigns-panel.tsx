"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RecordPicker } from "@/components/record-picker";
import type { LookupItem } from "@/app/(app)/lookup-actions";
import type { CampaignListItem } from "@/lib/apps/campaigns";
import { addDays } from "@/lib/apps/commercial-calendar";
import {
  calcKpiMensajes, calcROAS, DISPLAY_STATUS, displayStatus, kpiMensajesTone, PLATFORMS, TONE_COLOR, type DisplayStatus,
} from "@/lib/apps/campaign-calc";
import { deleteCampaignAction, lookupCampaignProducts, rateAction, saveCampaignAction } from "./actions";
import { DailyMatrix } from "./daily-matrix";
import { cls, fmtMoney, fmtUSD, Modal, MultiSelect, PageTitle, Popover, Sparkline, useConfirm } from "./ui";

type Campaign = CampaignListItem;
type Range = [string | null, string | null];

const DATE_FILTERS = [
  { value: "all", label: "Todo" },
  { value: "today", label: "Hoy" },
  { value: "week", label: "Últimos 7 días" },
  { value: "days15", label: "Últimos 15 días" },
  { value: "month", label: "Últimos 30 días" },
  { value: "quarter", label: "Últimos 90 días" },
  { value: "thisMonth", label: "Este mes" },
  { value: "lastMonth", label: "Mes pasado" },
  { value: "thisYear", label: "Este año" },
  { value: "custom", label: "Rango personalizado" },
];

/** [desde, hasta] en días "YYYY-MM-DD" (calendario de la organización); null = sin límite. */
function dateFilterRange(filter: string, from: string, to: string, today: string): Range {
  const month = today.slice(0, 7);
  switch (filter) {
    case "today": return [today, today];
    case "week": return [addDays(today, -7), null];
    case "days15": return [addDays(today, -15), null];
    case "month": return [addDays(today, -30), null];
    case "quarter": return [addDays(today, -90), null];
    case "thisMonth": return [`${month}-01`, null];
    case "lastMonth": {
      const lastDay = addDays(`${month}-01`, -1);
      return [`${lastDay.slice(0, 7)}-01`, lastDay];
    }
    case "thisYear": return [`${today.slice(0, 4)}-01-01`, null];
    case "custom": return [from || null, to || null];
    default: return [null, null];
  }
}

const dayDiff = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000);

/** Periodo inmediatamente anterior de igual duración, para comparar KPIs. */
function previousRange(range: Range, today: string): Range {
  const [from, to] = range;
  if (!from) return [null, null];
  const span = Math.max(1, dayDiff(from, to ?? today) + 1);
  return [addDays(from, -span), addDays(from, -1)];
}

const inRange = (key: string, [from, to]: Range) => (!from || key >= from) && (!to || key <= to);

// Una campaña queda en el periodo si inició en él o si su matriz diaria se solapa con el rango.
const campaignInPeriod = (c: Campaign, r: Range) => {
  if (inRange(c.startDate, r)) return true;
  if (c.daily.days > 0 && c.daily.firstDate && c.daily.lastDate) {
    if (r[0] && c.daily.lastDate < r[0]) return false;
    if (r[1] && c.daily.firstDate > r[1]) return false;
    return true;
  }
  return false;
};

// Totales de la matriz solo con los días dentro del rango filtrado.
const rangedDaily = (c: Campaign, r: Range): Campaign["daily"] => {
  if (c.daily.days === 0) return c.daily;
  return c.dailyRows.filter((x) => inRange(x.fecha, r)).reduce(
    (acc, x) => ({
      sales: acc.sales + x.ventaDelDia, investmentUsd: acc.investmentUsd + x.presupuestoPublicidad,
      mensajes: acc.mensajes + x.mensajes, transacciones: acc.transacciones + x.transacciones, days: acc.days + 1,
      firstDate: acc.firstDate && acc.firstDate < x.fecha ? acc.firstDate : x.fecha,
      lastDate: acc.lastDate && acc.lastDate > x.fecha ? acc.lastDate : x.fecha,
    }),
    { sales: 0, investmentUsd: 0, mensajes: 0, transacciones: 0, days: 0, firstDate: null as string | null, lastDate: null as string | null },
  );
};

const fmtDelta = (cur: number, prev: number) => (!prev || prev <= 0 ? null : ((cur - prev) / prev) * 100);

const salesOf = (c: Campaign) => (c.daily.days > 0 ? c.daily.sales : c.sales);
// Con matriz diaria la inversión real sale de ahí (USD); si no, la manual del formulario.
const investmentUsdOf = (c: Campaign) => (c.daily.days > 0 ? c.daily.investmentUsd : c.investment);
const investmentLocalOf = (c: Campaign) => investmentUsdOf(c) * (c.trm || 0);
const roasOf = (c: Campaign) => calcROAS(salesOf(c), investmentLocalOf(c));
const statusOf = (c: Campaign) => displayStatus(c.status, roasOf(c), c.targetMultiple);
const kpiMensajesOf = (c: Campaign) => calcKpiMensajes(c.daily.transacciones, c.daily.mensajes);

type ColKey = "investment" | "sales" | "roas" | "leads" | "cpl" | "kpiMensajes" | "status";
const PAGE_SIZE = 8;

const EMPTY_FORM = {
  name: "", sellerId: "", product: null as LookupItem | null, investment: "", sales: "", leads: "",
  targetMultiple: "10", platform: "Meta Ads", notes: "", status: "ACTIVE", startDate: "", endDate: "",
};

export function CampaignsPanel({ campaigns, sellers, sellerFilterOptions, currency, orgName, trm, today, currentUserId, canWrite, canAssign, canExport }: {
  campaigns: Campaign[]; sellers: { id: string; name: string }[]; sellerFilterOptions: { id: string; name: string }[];
  currency: string; orgName: string; trm: number; today: string; currentUserId: string;
  canWrite: boolean; canAssign: boolean; canExport: boolean;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const { confirm, dialog } = useConfirm();
  const money = useCallback((n: number) => fmtMoney(n, currency), [currency]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [formTrm, setFormTrm] = useState<number | null>(null);
  const [dailyCampaign, setDailyCampaign] = useState<Campaign | null>(null);
  const [showRule, setShowRule] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- marca la hora en que llegaron los datos; debe correr en el navegador
  useEffect(() => { setLoadedAt(new Date()); }, [campaigns]);

  // Filtros
  const [dateFilter, setDateFilter] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [search, setSearch] = useState("");

  // La página vuelve a 1 cuando cambia cualquier filtro.
  const filterKey = `${dateFilter}|${customFrom}|${customTo}|${sellerFilter}|${statusFilter}|${platformFilter}|${search}`;
  const [pageState, setPageState] = useState({ key: filterKey, value: 1 });
  const page = pageState.key === filterKey ? pageState.value : 1;
  const setPage = (n: number) => setPageState({ key: filterKey, value: n });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>({ investment: true, sales: true, roas: true, leads: true, cpl: true, kpiMensajes: true, status: true });

  const COLUMNS: { key: ColKey; label: string }[] = [
    { key: "investment", label: "Inversión (USD)" },
    { key: "sales", label: `Vendido (${currency})` },
    { key: "roas", label: "ROAS" },
    { key: "leads", label: "Leads" },
    { key: "cpl", label: "CPL" },
    { key: "kpiMensajes", label: "KPI Mensajes" },
    { key: "status", label: "Estado" },
  ];

  // TRM de la fecha de inicio de la campaña (o la de hoy si aún no hay fecha).
  useEffect(() => {
    if (!showForm) return;
    let live = true;
    rateAction(form.startDate || undefined).then((r) => { if (live && r.ok) setFormTrm(r.data); });
    return () => { live = false; };
  }, [showForm, form.startDate]);
  const previewTrm = formTrm ?? trm;

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, sellerId: sellers.find((x) => x.id === currentUserId)?.id ?? sellers[0]?.id ?? "" });
    setAlert(null);
    setShowForm(true);
  };
  const openEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      name: c.name, sellerId: c.seller.id, product: c.product ? { id: c.product.id, name: c.product.name, hint: c.product.sku } : null,
      investment: String(c.investment), sales: String(c.sales), leads: String(c.leads ?? 0), targetMultiple: String(c.targetMultiple),
      platform: c.platform, notes: c.notes ?? "", status: c.status || "ACTIVE", startDate: c.startDate, endDate: c.endDate ?? "",
    });
    setAlert(null);
    setShowForm(true);
  };

  const platforms = useMemo(() => Array.from(new Set(campaigns.map((c) => c.platform).filter(Boolean))).sort(), [campaigns]);
  const activeRange = useMemo(() => dateFilterRange(dateFilter, customFrom, customTo, today), [dateFilter, customFrom, customTo, today]);

  const dateCampaigns = useMemo(
    () => campaigns.filter((c) => campaignInPeriod(c, activeRange)).map((c) => ({ ...c, daily: rangedDaily(c, activeRange) })),
    [campaigns, activeRange],
  );

  const matchesFilters = useCallback((c: Campaign) => {
    if (sellerFilter !== "all" && c.seller.id !== sellerFilter) return false;
    if (statusFilter !== "all") {
      const sel = statusFilter.split(",");
      const isActive = (c.status || "ACTIVE") === "ACTIVE";
      if (!sel.includes(statusOf(c)) && !(sel.includes("activas") && isActive)) return false;
    }
    if (platformFilter !== "all" && c.platform !== platformFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${c.name} ${c.seller.name} ${c.platform} ${c.product?.name ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  }, [sellerFilter, statusFilter, platformFilter, search]);

  const filtered = useMemo(() => dateCampaigns.filter(matchesFilters), [dateCampaigns, matchesFilters]);

  const sumUp = (list: Campaign[]) => {
    let inversionUsd = 0, inversionLocal = 0, ventas = 0, leads = 0, dias = 0;
    for (const c of list) {
      inversionUsd += investmentUsdOf(c); inversionLocal += investmentLocalOf(c); ventas += salesOf(c); leads += c.leads ?? 0; dias += c.daily.days;
    }
    return { inversionUsd, inversionLocal, ventas, leads, dias, roas: calcROAS(ventas, inversionLocal) };
  };
  const totals = useMemo(() => {
    const t = sumUp(filtered);
    return {
      ...t, count: filtered.length,
      cpl: t.leads > 0 ? t.inversionUsd / t.leads : null,
      avgTarget: filtered.length ? filtered.reduce((s, c) => s + (c.targetMultiple || 10), 0) / filtered.length : 10,
    };
  }, [filtered]);
  // Mismos filtros sobre la ventana de fechas anterior.
  const prevTotals = useMemo(() => {
    const r = previousRange(activeRange, today);
    if (!r[0]) return null;
    return sumUp(campaigns.filter((c) => campaignInPeriod(c, r) && matchesFilters(c)).map((c) => ({ ...c, daily: rangedDaily(c, r) })));
  }, [campaigns, activeRange, today, matchesFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  const refresh = () => startRefresh(() => router.refresh());

  const save = async () => {
    if (form.startDate && form.endDate && form.endDate < form.startDate) { setAlert({ type: "err", msg: "La fecha final no puede ser anterior a la inicial" }); return; }
    setSaving(true);
    const r = await saveCampaignAction({
      name: form.name, sellerId: form.sellerId || undefined, productId: form.product?.id ?? null,
      investment: parseFloat(form.investment) || 0, sales: parseFloat(form.sales) || 0, leads: parseInt(form.leads) || 0,
      targetMultiple: parseFloat(form.targetMultiple) || 10, platform: form.platform, notes: form.notes, status: form.status,
      startDate: form.startDate || undefined, endDate: form.endDate || null,
    }, editing?.id);
    setSaving(false);
    if (r.ok) {
      setAlert({ type: "ok", msg: editing ? "Campaña actualizada" : "Campaña creada" });
      refresh();
      setTimeout(() => setShowForm(false), 800);
    } else setAlert({ type: "err", msg: r.error });
  };

  const removeCampaign = async (c: Campaign) => {
    const ok = await confirm({
      title: "Eliminar campaña",
      message: `¿Eliminar la campaña "${c.name}"? Se borrará también su matriz diaria. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar", danger: true,
    });
    if (!ok) return;
    const r = await deleteCampaignAction(c.id);
    if (r.ok) refresh(); else setAlert({ type: "err", msg: r.error });
  };

  const exportCSV = () => {
    const head = ["Campaña", "Vendedor", "Plataforma", "Producto", "Inversión (USD)", `Inversión (${currency})`, `Vendido (${currency})`, "ROAS", "Leads", "CPL (USD)", "Estado"];
    const lines = filtered.map((c) => {
      const roas = roasOf(c);
      const cpl = c.leads > 0 ? investmentUsdOf(c) / c.leads : "";
      return [
        c.name, c.seller.name, c.platform, c.product?.name ?? "",
        Math.round(investmentUsdOf(c)), Math.round(investmentLocalOf(c)), Math.round(salesOf(c)),
        roas.toFixed(2), c.leads ?? 0, cpl === "" ? "" : Math.round(Number(cpl)), DISPLAY_STATUS[statusOf(c)].label,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob([`﻿${[head.join(","), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campanas-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelectAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (pageRows.every((c) => next.has(c.id))) pageRows.forEach((c) => next.delete(c.id)); else pageRows.forEach((c) => next.add(c.id));
    return next;
  });
  const toggleSelect = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const clearFilters = () => { setDateFilter("all"); setCustomFrom(""); setCustomTo(""); setSellerFilter("all"); setStatusFilter("all"); setPlatformFilter("all"); setSearch(""); };
  const hasFilters = dateFilter !== "all" || sellerFilter !== "all" || statusFilter !== "all" || platformFilter !== "all" || !!search;

  const kpis = [
    {
      label: `Vendido total (${currency})`, value: money(totals.ventas), sub: `${totals.dias} día${totals.dias === 1 ? "" : "s"} en matrices`,
      delta: prevTotals ? fmtDelta(totals.ventas, prevTotals.ventas) : null, color: "#10b981", spark: filtered.map(salesOf),
    },
    {
      label: "Invertido total", value: `${fmtUSD(totals.inversionUsd)}`, sub: `≈ ${money(totals.inversionLocal)}`,
      delta: prevTotals ? fmtDelta(totals.inversionUsd, prevTotals.inversionUsd) : null, color: "#6f35b5", spark: filtered.map(investmentUsdOf),
    },
    {
      label: "ROAS global", value: `${totals.roas.toFixed(2)}x`, sub: `${totals.leads} leads`, badge: `Meta: ${Math.round(totals.avgTarget)}x`,
      delta: prevTotals ? fmtDelta(totals.roas, prevTotals.roas) : null, color: "#e31572", spark: filtered.map(roasOf),
    },
    {
      label: "Leads totales", value: String(totals.leads), sub: totals.cpl !== null ? `CPL ${fmtUSD(totals.cpl)}` : "Sin leads",
      delta: prevTotals ? fmtDelta(totals.leads, prevTotals.leads) : null, color: "#1fc7b6", spark: filtered.map((c) => c.leads ?? 0),
    },
  ];

  const statusOptions = [
    { value: "activas", label: "Activas", dot: "#6f35b5" },
    ...(Object.keys(DISPLAY_STATUS) as DisplayStatus[]).map((k) => ({ value: k, label: DISPLAY_STATUS[k].label, dot: TONE_COLOR[DISPLAY_STATUS[k].tone].bar })),
  ];
  const updatedLabel = loadedAt ? `hoy, ${loadedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}` : "—";

  return (
    <div>
      <PageTitle
        eyebrow="Comercial"
        title="Campañas"
        subtitle={<><span className="font-medium text-slate-700">{filtered.length} campañas</span> · Última actualización: {updatedLabel}{refreshing && " · actualizando…"}</>}
        actions={canWrite && <button onClick={openNew} className={cls.primary}>+ Nueva campaña</button>}
      />

      {showRule && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[var(--ork-violet)]/25 bg-[var(--ork-lavender)]/15 p-4">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--ork-purple)] text-xs font-bold text-white">i</span>
          <p className="flex-1 text-sm font-semibold text-[var(--ork-purple)]">Meta mínima: inversión × {Math.round(totals.avgTarget)} = ventas esperadas</p>
          <p className="hidden flex-1 text-right text-xs text-slate-500 sm:block">Esta regla aplica para todas las campañas de {orgName}.</p>
          <button onClick={() => setShowRule(false)} className="text-slate-400 hover:text-[var(--ork-ink)]" aria-label="Cerrar">✕</button>
        </div>
      )}

      {/* Filtros */}
      <div className={`${cls.card} mb-5 p-3`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="px-1 text-xs font-medium text-slate-500">Periodo</span>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={`${cls.input} sm:w-44`}>
              {DATE_FILTERS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          {dateFilter === "custom" && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input type="date" aria-label="Desde" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className={`${cls.input} sm:w-auto`} />
              <input type="date" aria-label="Hasta" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className={`${cls.input} sm:w-auto`} />
            </div>
          )}
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="px-1 text-xs font-medium text-slate-500">Vendedor</span>
            <select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} className={`${cls.input} sm:w-40`}>
              <option value="all">Todos</option>
              {sellerFilterOptions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="px-1 text-xs font-medium text-slate-500">Estado</span>
            <div className="sm:w-40"><MultiSelect value={statusFilter} options={statusOptions} onChange={setStatusFilter} /></div>
          </div>
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="px-1 text-xs font-medium text-slate-500">Plataforma</span>
            <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className={`${cls.input} sm:w-40`}>
              <option value="all">Todas</option>
              {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar campañas…" aria-label="Buscar campañas" className={`${cls.input} sm:min-w-[200px] sm:flex-1`} />
          <span className="self-start rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 sm:self-auto">
            {filtered.length} campaña{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
        {hasFilters && <button type="button" onClick={clearFilters} className="mt-2 text-xs font-medium text-[var(--ork-violet)] hover:underline">↻ Limpiar filtros</button>}
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={`${cls.card} flex items-start justify-between gap-3 p-4`}>
            <div className="min-w-0">
              <p className={cls.eyebrow}>{k.label}</p>
              <p className="mt-2 truncate text-2xl font-semibold leading-none tracking-tight tabular-nums text-[var(--ork-ink)]">{k.value}</p>
              <p className="mt-1 truncate text-xs text-slate-400">{k.sub}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {k.delta !== null && (
                  <span className={`text-xs font-semibold ${k.delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {k.delta >= 0 ? "↑" : "↓"} {Math.abs(k.delta).toFixed(0)}% <span className="font-normal text-slate-400">vs. periodo anterior</span>
                  </span>
                )}
                {k.badge && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">{k.badge}</span>}
              </div>
            </div>
            <Sparkline values={k.spark} color={k.color} />
          </div>
        ))}
      </div>

      {/* Tabla */}
      <section className={cls.card}>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">Campañas ({filtered.length})</h2>
          <div className="flex items-center gap-2">
            {canExport && <button onClick={exportCSV} className={cls.small}>Exportar</button>}
            <Popover button="Columnas" buttonClassName={cls.small}>
              {() => (
                <div className="py-1">
                  {COLUMNS.map((col) => (
                    <label key={col.key} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={visibleCols[col.key]} onChange={(e) => setVisibleCols((v) => ({ ...v, [col.key]: e.target.checked }))} className="accent-[var(--ork-violet)]" />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </Popover>
          </div>
        </header>

        {filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            {campaigns.length > 0 ? (
              <>
                <p className="text-sm font-medium text-slate-500">Ninguna campaña cumple los filtros</p>
                <button onClick={clearFilters} className={cls.small}>Limpiar filtros</button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-500">No hay campañas todavía</p>
                {canWrite && <button onClick={openNew} className={cls.primary}>Crear primera campaña</button>}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className={`${cls.th} w-10`}>
                      <input type="checkbox" checked={pageRows.length > 0 && pageRows.every((c) => selected.has(c.id))} onChange={toggleSelectAll} className="accent-[var(--ork-violet)]" aria-label="Seleccionar todos" />
                    </th>
                    <th className={cls.th}>Campaña</th>
                    {COLUMNS.filter((c) => visibleCols[c.key]).map((c) => <th key={c.key} className={cls.th}>{c.label}</th>)}
                    <th className={`${cls.th} text-right`}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((c) => {
                    const roas = roasOf(c);
                    const meta = DISPLAY_STATUS[statusOf(c)];
                    const tone = TONE_COLOR[meta.tone];
                    const barPct = Math.min(100, (roas / (c.targetMultiple || 10)) * 100);
                    const cpl = c.leads > 0 ? investmentUsdOf(c) / c.leads : null;
                    const kpiM = kpiMensajesOf(c);
                    const kpiTone = TONE_COLOR[kpiMensajesTone(kpiM)];
                    const initials = c.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                    return (
                      <tr key={c.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="accent-[var(--ork-violet)]" aria-label={`Seleccionar ${c.name}`} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--ork-lavender)]/30 text-xs font-bold text-[var(--ork-purple)]">{initials}</span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[var(--ork-ink)]">{c.name}</p>
                              <p className="truncate text-xs text-slate-500">Vendedor {c.seller.name} · {c.platform}{c.product ? ` · ${c.product.name}` : ""}</p>
                            </div>
                          </div>
                        </td>
                        {visibleCols.investment && (
                          <td className="px-4 py-3">
                            <p className="font-semibold tabular-nums text-[var(--ork-violet)]">{fmtUSD(investmentUsdOf(c))}</p>
                            <p className="text-xs text-slate-400">≈ {money(investmentLocalOf(c))}</p>
                          </td>
                        )}
                        {visibleCols.sales && (
                          <td className="px-4 py-3">
                            <p className="font-semibold tabular-nums text-emerald-700">{money(salesOf(c))}</p>
                            <p className="text-xs text-slate-400">{c.daily.days > 0 ? `Matriz · ${c.daily.days} día${c.daily.days === 1 ? "" : "s"}` : "Manual"}</p>
                          </td>
                        )}
                        {visibleCols.roas && (
                          <td className="px-4 py-3">
                            <p className="font-semibold tabular-nums" style={{ color: tone.fg }}>{roas.toFixed(1)}x</p>
                            <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: tone.bar }} />
                            </div>
                          </td>
                        )}
                        {visibleCols.leads && <td className="px-4 py-3 tabular-nums">{c.leads ?? 0}</td>}
                        {visibleCols.cpl && <td className="px-4 py-3 tabular-nums">{cpl !== null ? fmtUSD(cpl) : "—"}</td>}
                        {visibleCols.kpiMensajes && (
                          <td className="px-4 py-3">
                            {c.daily.mensajes > 0
                              ? <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: kpiTone.bg, color: kpiTone.fg }}>{(kpiM * 100).toFixed(1)}%</span>
                              : <span className="text-slate-400">—</span>}
                          </td>
                        )}
                        {visibleCols.status && (
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: tone.bg, color: tone.fg }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.bar }} />{meta.label}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setDailyCampaign(c)} className={cls.small}>Ver matriz</button>
                            <Popover label={`Acciones de ${c.name}`} button="⋯" buttonClassName="grid h-7 w-7 place-items-center rounded-full border border-slate-300 bg-white text-slate-600 hover:border-[var(--ork-violet)] hover:text-[var(--ork-violet)]">
                              {(close) => (
                                <div className="py-1">
                                  {canWrite && c.canEdit && <button onClick={() => { close(); openEdit(c); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">Editar campaña</button>}
                                  <button onClick={() => { close(); setDailyCampaign(c); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">Matriz diaria</button>
                                  {canWrite && c.canEdit && <button onClick={() => { close(); removeCampaign(c); }} className="block w-full px-3 py-2 text-left text-sm text-[var(--ork-pink)] hover:bg-rose-50">Eliminar campaña</button>}
                                </div>
                              )}
                            </Popover>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
              <p className="text-xs text-slate-500">
                Mostrando <b className="text-slate-700">{(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filtered.length)}</b> de <b className="text-slate-700">{filtered.length}</b> campañas
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} className={cls.small} aria-label="Anterior">‹</button>
                {pageNumbers.map((n) => (
                  <button key={n} onClick={() => setPage(n)} aria-current={n === currentPage ? "page" : undefined}
                    className={n === currentPage ? "inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--ork-purple)] px-2 text-xs font-semibold text-white" : cls.small}>{n}</button>
                ))}
                <button onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} className={cls.small} aria-label="Siguiente">›</button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Formulario */}
      {showForm && (
        <Modal onClose={() => setShowForm(false)}>
          <div className="flex items-center justify-between border-b border-[var(--ork-rule)] px-6 py-4">
            <h3 className="font-display text-xl uppercase tracking-tight text-[var(--ork-ink)]">{editing ? "Editar campaña" : "Nueva campaña"}</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-[var(--ork-ink)]" aria-label="Cerrar">✕</button>
          </div>
          <div className="overflow-y-auto px-6 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className={cls.label}>Nombre</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={cls.input} placeholder="Campaña Q2 jabón líquido" />
              </label>
              <label><span className={cls.label}>Vendedor</span>
                <select value={form.sellerId} disabled={!canAssign} onChange={(e) => setForm({ ...form, sellerId: e.target.value })} className={`${cls.input} disabled:bg-slate-100`}>
                  {sellers.length === 0 && <option value="">Sin asignar</option>}
                  {editing && !sellers.some((x) => x.id === editing.seller.id) && <option value={editing.seller.id}>{editing.seller.name}</option>}
                  {sellers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              <div><span className={cls.label}>Producto (opcional)</span>
                <RecordPicker initial={form.product} search={lookupCampaignProducts} onChange={(it) => setForm((f) => ({ ...f, product: it }))} placeholder="Buscar producto…" label="Producto" />
              </div>
              <label><span className={cls.label}>Inversión (USD)</span>
                <input type="number" min={0} value={form.investment} onChange={(e) => setForm({ ...form, investment: e.target.value })} className={cls.input} placeholder="0" />
                {form.investment && <span className="mt-1 block text-xs text-slate-400">≈ {money(parseFloat(form.investment) * previewTrm)} (TRM {Math.round(previewTrm).toLocaleString("es-CO")})</span>}
              </label>
              <label><span className={cls.label}>Ventas generadas ({currency})</span>
                <input type="number" min={0} value={form.sales} onChange={(e) => setForm({ ...form, sales: e.target.value })} className={cls.input} placeholder="0" />
              </label>
              <label><span className={cls.label}>Leads</span>
                <input type="number" min={0} value={form.leads} onChange={(e) => setForm({ ...form, leads: e.target.value })} className={cls.input} placeholder="0" />
              </label>
              <label><span className={cls.label}>Meta (×)</span>
                <input type="number" min={0} value={form.targetMultiple} onChange={(e) => setForm({ ...form, targetMultiple: e.target.value })} className={cls.input} />
              </label>
              <label><span className={cls.label}>Plataforma</span>
                <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className={cls.input}>
                  {[...new Set([...PLATFORMS, form.platform])].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label><span className={cls.label}>Estado</span>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={cls.input}>
                  <option value="ACTIVE">Activa</option><option value="PAUSED">Pausada</option>
                </select>
              </label>
              <label><span className={cls.label}>Fecha inicio</span>
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={cls.input} />
              </label>
              <label><span className={cls.label}>Fecha fin (opcional)</span>
                <input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={cls.input} />
              </label>

              {form.investment && form.sales && (() => {
                const r = calcROAS(parseFloat(form.sales), parseFloat(form.investment) * previewTrm);
                const leadsN = parseInt(form.leads) || 0;
                const cplN = leadsN > 0 ? parseFloat(form.investment) / leadsN : null;
                const m = DISPLAY_STATUS[displayStatus(form.status, r, parseFloat(form.targetMultiple) || 10)];
                const t = TONE_COLOR[m.tone];
                return (
                  <div className="flex items-center justify-between rounded-xl bg-[var(--ork-lavender)]/15 p-3 sm:col-span-2">
                    <div>
                      <p className="text-xs font-semibold text-[var(--ork-purple)]">ROAS calculado</p>
                      {cplN !== null && <p className="text-xs text-slate-500">CPL: {fmtUSD(cplN)}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-semibold tabular-nums" style={{ color: t.fg }}>×{r.toFixed(1)}</span>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: t.bg, color: t.fg }}>{m.label}</span>
                    </div>
                  </div>
                );
              })()}

              <label className="sm:col-span-2"><span className={cls.label}>Notas</span>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={`${cls.input} resize-none`} />
              </label>
            </div>
            {alert && (
              <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${alert.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{alert.msg}</div>
            )}
          </div>
          <div className="flex gap-2 border-t border-[var(--ork-rule)] px-6 py-4">
            <button onClick={() => setShowForm(false)} className={`${cls.secondary} flex-1`}>Cancelar</button>
            <button onClick={save} disabled={saving} className={`${cls.primary} flex-1`}>{saving ? "Guardando…" : editing ? "Actualizar" : "Crear campaña"}</button>
          </div>
        </Modal>
      )}

      {dailyCampaign && (
        <DailyMatrix
          campaignId={dailyCampaign.id}
          campaignName={dailyCampaign.name}
          currency={currency}
          today={today}
          readOnly={!canWrite || !dailyCampaign.canEdit}
          onClose={(changed) => { setDailyCampaign(null); if (changed) refresh(); }}
          dateFrom={activeRange[0] ?? undefined}
          dateTo={activeRange[1] ?? undefined}
        />
      )}
      {!showForm && alert?.type === "err" && (
        <div role="alert" className="fixed bottom-4 right-4 z-40 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 shadow-lg">
          {alert.msg} <button className="ml-2 text-rose-400" onClick={() => setAlert(null)} aria-label="Cerrar">✕</button>
        </div>
      )}
      {dialog}
    </div>
  );
}
