"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildCampaignDailyRows, calcCampaignDailyTotals, kpiConversionTone, kpiMensajesTone, TONE_COLOR, type CampaignDailyInput,
} from "@/lib/apps/campaign-calc";
import { addCampaignDayAction, campaignDaysAction, discardCampaignDaysAction, saveCampaignDaysAction } from "./actions";
import { cls, fmtMoney, Modal, Skeleton, useConfirm } from "./ui";

const fmtUSD2 = (n: number) => `US$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${((n || 0) * 100).toFixed(2)}%`;
const fmtX = (n: number) => `${(n || 0).toFixed(2)}x`;
const MAX_NUM = 999_999_999;

function sanitize(value: string): number {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_NUM);
}

// Input numérico no controlado: cada tecla va al borrador local, sin tocar el servidor.
function NumCell({ value, integer, onChange, className = "", disabled, label }: {
  value: number; integer?: boolean; onChange: (v: number) => void; className?: string; disabled?: boolean; label: string;
}) {
  return (
    <input
      type="number" min={0} max={MAX_NUM} aria-label={label} disabled={disabled}
      defaultValue={String(Number.isFinite(value) ? value : 0)}
      onChange={(e) => { const n = sanitize(e.target.value); onChange(integer ? Math.round(n) : n); }}
      className={`rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right text-sm font-medium tabular-nums text-[var(--ork-ink)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20 disabled:bg-slate-50 ${className}`}
    />
  );
}

export function DailyMatrix({ campaignId, campaignName, currency, today, readOnly, onClose, dateFrom, dateTo }: {
  campaignId: string; campaignName: string; currency: string; today: string; readOnly: boolean;
  onClose: (changed: boolean) => void; dateFrom?: string; dateTo?: string;
}) {
  const money = (n: number) => fmtMoney(n, currency);
  const { confirm, dialog } = useConfirm();
  const [entries, setEntries] = useState<CampaignDailyInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newDate, setNewDate] = useState(today);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Borrador local: se envía al servidor solo al pulsar "Guardar cambios".
  const [draft, setDraft] = useState<Record<string, Partial<CampaignDailyInput>>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    campaignDaysAction(campaignId).then((r) => {
      if (!live) return;
      if (r.ok) setEntries(r.data); else setError(r.error);
      setLoading(false);
    });
    return () => { live = false; };
  }, [campaignId]);

  const viewEntries = useMemo(
    () => entries.filter((e) => !deletedIds.has(e.id)).map((e) => ({ ...e, ...draft[e.id] })),
    [entries, draft, deletedIds],
  );
  const filteredEntries = useMemo(
    () => viewEntries.filter((e) => (!dateFrom || e.fecha >= dateFrom) && (!dateTo || e.fecha <= dateTo)),
    [viewEntries, dateFrom, dateTo],
  );
  const rows = useMemo(() => buildCampaignDailyRows(filteredEntries), [filteredEntries]);
  const totals = useMemo(() => calcCampaignDailyTotals(filteredEntries), [filteredEntries]);
  const hiddenByFilter = viewEntries.length - filteredEntries.length;
  const hasPendingEdits = Object.keys(draft).length > 0 || deletedIds.size > 0 || addedIds.size > 0;

  const patch = (id: string, field: keyof CampaignDailyInput, value: number | string) =>
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const removeRow = async (id: string) => {
    const ok = await confirm({ title: "Eliminar día", message: "¿Seguro que quieres eliminar este día de la matriz? Se quitará cuando guardes los cambios.", confirmLabel: "Eliminar día", danger: true });
    if (!ok) return;
    if (addedIds.has(id)) {
      setAddedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setDraft((prev) => { const next = { ...prev }; delete next[id]; return next; });
      discardCampaignDaysAction([id]);
      return;
    }
    setDeletedIds((prev) => new Set(prev).add(id));
  };

  const addRow = async () => {
    setAdding(true);
    setError(null);
    const r = await addCampaignDayAction(campaignId, { fecha: newDate, mensajes: 0, transacciones: 0, presupuestoPublicidad: 0, ventaDelDia: 0 });
    setAdding(false);
    if (!r.ok) { setError(r.error); return; }
    setAddedIds((prev) => new Set(prev).add(r.data.id));
    setEntries((prev) => [...prev, r.data]);
  };

  const saveAll = async () => {
    setSaving(true);
    setError(null);
    const updated: Record<string, Record<string, unknown>> = {};
    for (const [id, f] of Object.entries(draft)) {
      const { trm: _t, id: _i, ...fields } = f;
      updated[id] = fields;
    }
    const r = await saveCampaignDaysAction(campaignId, { deleted: [...deletedIds], updated });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    onClose(true);
  };

  // Cancelar deshace también los días creados en esta sesión.
  const cancel = () => {
    if (addedIds.size) discardCampaignDaysAction([...addedIds]);
    onClose(false);
  };

  const HEADERS: { label: string; hint: string; right?: boolean }[] = [
    { label: "Fecha", hint: "Día del seguimiento" },
    { label: "Mensajes", hint: "Mensajes recibidos ese día" },
    { label: "KPI Mensajes", hint: "Transacciones / mensajes" },
    { label: "Transacciones", hint: "Ventas cerradas ese día" },
    { label: "Presupuesto (USD)", hint: "Inversión publicitaria del día en USD" },
    { label: `Presupuesto (${currency})`, hint: "Inversión convertida con la TRM del día" },
    { label: "KPI Conversión", hint: "Venta del día / presupuesto del día" },
    { label: `Venta del día (${currency})`, hint: "Venta registrada ese día" },
    { label: `Meta diaria (${currency})`, hint: "Presupuesto × 10" },
    { label: `Venta acumulada (${currency})`, hint: "Venta registrada ese día; el total va en el pie" },
    ...(readOnly ? [] : [{ label: "Acciones", hint: "Eliminar el día", right: true }]),
  ];
  const tdMid = "border-y border-slate-200 px-2 py-2 align-middle";

  return (
    <Modal onClose={() => onClose(addedIds.size > 0)} className="max-w-[1400px]">
      <div className="flex items-start justify-between px-6 pb-4 pt-6 sm:px-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Matriz diaria</p>
          <h2 className="mt-1 font-display text-2xl uppercase leading-none tracking-tight text-[var(--ork-ink)]">{campaignName}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Seguimiento diario de la campaña{hiddenByFilter > 0 && ` · ${hiddenByFilter} día${hiddenByFilter === 1 ? "" : "s"} fuera del periodo filtrado`}
          </p>
        </div>
        <button onClick={() => onClose(addedIds.size > 0)} className="grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-[var(--ork-ink)]" aria-label="Cerrar">✕</button>
      </div>

      {error && <div className="mx-6 mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:mx-8">{error}</div>}

      {loading ? (
        <div className="space-y-2 px-8 pb-8">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-8">
            <div className="overflow-x-auto pb-1">
              <table className="w-full border-separate border-spacing-y-2 text-sm" style={{ minWidth: 1000 }}>
                <thead>
                  <tr>
                    {HEADERS.map((h) => (
                      <th key={h.label} title={h.hint} className={`whitespace-nowrap px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500 ${h.right ? "text-right" : "text-left"}`}>
                        {h.label} <span className="cursor-help text-slate-300">ⓘ</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const msg = TONE_COLOR[kpiMensajesTone(row.kpiMensajes)];
                    const conv = TONE_COLOR[kpiConversionTone(row.kpiConversion)];
                    const convPct = Math.min(100, ((row.kpiConversion || 0) / 10) * 100);
                    return (
                      <tr key={row.id} className="bg-white">
                        <td className="rounded-l-xl border border-r-0 border-slate-200 py-2 pl-3 pr-2 align-middle">
                          <input type="date" aria-label="Fecha" disabled={readOnly} value={row.fecha} onChange={(e) => e.target.value && patch(row.id, "fecha", e.target.value)}
                            className="w-[140px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand)] disabled:bg-slate-50" />
                        </td>
                        <td className={tdMid}><NumCell label="Mensajes" disabled={readOnly} value={row.mensajes} integer onChange={(v) => patch(row.id, "mensajes", v)} className="w-[92px]" /></td>
                        <td className={tdMid}>
                          <span className="inline-flex w-[100px] justify-center rounded-lg px-2 py-1.5 text-sm font-semibold tabular-nums" style={{ background: msg.bg, color: msg.fg }}>{fmtPct(row.kpiMensajes)}</span>
                        </td>
                        <td className={tdMid}><NumCell label="Transacciones" disabled={readOnly} value={row.transacciones} integer onChange={(v) => patch(row.id, "transacciones", v)} className="w-[110px]" /></td>
                        <td className={tdMid}><NumCell label="Presupuesto USD" disabled={readOnly} value={row.presupuestoPublicidad} onChange={(v) => patch(row.id, "presupuestoPublicidad", v)} className="w-[110px]" /></td>
                        <td className={`${tdMid} whitespace-nowrap text-right font-medium tabular-nums`} title={`TRM ${Math.round(row.trm).toLocaleString("es-CO")}`}>{money(row.presupuestoCOP)}</td>
                        <td className={tdMid}>
                          <span className="block font-semibold tabular-nums text-[var(--ork-ink)]">{fmtX(row.kpiConversion)}</span>
                          <span className="mt-1 block h-1.5 w-[100px] overflow-hidden rounded-full bg-slate-100">
                            <span className="block h-full rounded-full" style={{ width: `${convPct}%`, background: conv.bar }} />
                          </span>
                        </td>
                        <td className={tdMid}><NumCell label="Venta del día" disabled={readOnly} value={row.ventaDelDia} onChange={(v) => patch(row.id, "ventaDelDia", v)} className="w-[130px]" /></td>
                        <td className={`${tdMid} whitespace-nowrap text-right font-medium tabular-nums`}>{money(row.metaDiaria)}</td>
                        <td className={`${tdMid} whitespace-nowrap text-right font-medium tabular-nums ${readOnly ? "rounded-r-xl border-r" : ""}`}>{money(row.ventaAcumulada)}</td>
                        {!readOnly && (
                          <td className="rounded-r-xl border border-l-0 border-slate-200 px-3 py-2 text-right align-middle">
                            <button onClick={() => removeRow(row.id)} className="grid h-8 w-8 place-items-center rounded-full text-[var(--ork-pink)] hover:bg-rose-50" aria-label="Eliminar día">✕</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={HEADERS.length} className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-400">Sin días registrados todavía</td></tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="font-semibold tabular-nums text-[var(--ork-purple)]">
                      <td className="rounded-l-xl bg-[var(--ork-lavender)]/25 px-4 py-3">Totales</td>
                      <td className="bg-[var(--ork-lavender)]/25 px-2 py-3 text-right">{totals.totalMensajes}</td>
                      <td className="bg-[var(--ork-lavender)]/25 px-2 py-3 text-right">{fmtPct(totals.conversionGeneral)}</td>
                      <td className="bg-[var(--ork-lavender)]/25 px-2 py-3 text-right">{totals.totalTransacciones}</td>
                      <td className="bg-[var(--ork-lavender)]/25 px-2 py-3 text-right">{fmtUSD2(totals.totalInversionUSD)}</td>
                      <td className="bg-[var(--ork-lavender)]/25 px-2 py-3 text-right">{money(totals.totalInversion)}</td>
                      <td className="bg-[var(--ork-lavender)]/25 px-2 py-3 text-right">{fmtX(totals.kpiGeneral)}</td>
                      <td className="bg-[var(--ork-lavender)]/25 px-2 py-3 text-right">{money(totals.totalVentas)}</td>
                      <td className="bg-[var(--ork-lavender)]/25 px-2 py-3 text-right">{money(rows.reduce((s, r) => s + r.metaDiaria, 0))}</td>
                      <td className={`bg-[var(--ork-lavender)]/25 px-2 py-3 text-right ${readOnly ? "rounded-r-xl" : ""}`}>{money(totals.totalVentas)}</td>
                      {!readOnly && <td className="rounded-r-xl bg-[var(--ork-lavender)]/25 px-4 py-3 text-right">—</td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ork-rule)] px-6 py-4 sm:px-8">
            {readOnly ? <p className="text-xs text-slate-500">Solo lectura: no puedes editar esta campaña.</p> : (
              <div className="flex items-center gap-2">
                <input type="date" aria-label="Fecha del nuevo día" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={`${cls.input} w-[170px]`} />
                <button onClick={addRow} disabled={adding || !newDate} className={cls.primary}>{adding ? "Agregando…" : "+ Agregar día"}</button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={cancel} className={cls.secondary}>{readOnly ? "Cerrar" : "Cancelar"}</button>
              {!readOnly && <button onClick={saveAll} disabled={saving || !hasPendingEdits} className={cls.primary}>{saving ? "Guardando…" : "Guardar cambios"}</button>}
            </div>
          </div>
        </>
      )}
      {dialog}
    </Modal>
  );
}
