"use client";

import { useEffect, useState } from "react";
import { hhmm } from "@/lib/apps/commercial-calendar";
import { calendarSettingsAction, saveCalendarSettingsAction } from "../actions";
import { cls, Modal } from "../ui";

type SellerCfg = { id: string; name: string; workDays: number[]; active: boolean };
type Holiday = { date: string; label: string };

const DAYS = [{ n: 1, l: "L" }, { n: 2, l: "M" }, { n: 3, l: "X" }, { n: 4, l: "J" }, { n: 5, l: "V" }, { n: 6, l: "S" }, { n: 0, l: "D" }];
const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const fromTime = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

/** Configuración del calendario comercial: hora límite, inicio del seguimiento, festivos y días laborables por vendedor. */
export function ConfigModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deadline, setDeadline] = useState("20:00");
  const [start, setStart] = useState("");
  const [sellers, setSellers] = useState<SellerCfg[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [hDate, setHDate] = useState("");
  const [hLabel, setHLabel] = useState("");

  useEffect(() => {
    calendarSettingsAction().then((r) => {
      if (!r.ok) setError(r.error);
      else {
        setDeadline(hhmm(r.data.deadlineMinutes));
        setStart(r.data.trackingStartDate);
        setSellers(r.data.sellers);
        setHolidays(r.data.holidays);
      }
      setLoading(false);
    });
  }, []);

  const patchSeller = (id: string, p: Partial<SellerCfg>) => setSellers((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const toggleDay = (s: SellerCfg, n: number) => patchSeller(s.id, { workDays: s.workDays.includes(n) ? s.workDays.filter((d) => d !== n) : [...s.workDays, n] });

  const addHoliday = () => {
    if (!hDate || holidays.some((h) => h.date === hDate)) return;
    setHolidays((prev) => [...prev, { date: hDate, label: hLabel.trim() || "Festivo" }].sort((a, b) => a.date.localeCompare(b.date)));
    setHDate(""); setHLabel("");
  };

  const save = async () => {
    setSaving(true); setError(null);
    const r = await saveCalendarSettingsAction({
      deadlineMinutes: fromTime(deadline), trackingStartDate: start, holidays,
      sellers: sellers.map((s) => ({ userId: s.id, workDays: s.workDays, active: s.active })),
    });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="flex items-start justify-between px-6 pb-4 pt-6">
        <div>
          <h2 className="font-display text-2xl uppercase leading-none tracking-tight text-[var(--ork-ink)]">Configurar calendario</h2>
          <p className="mt-2 text-sm text-slate-500">Días laborables, hora límite, festivos y vendedores activos.</p>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-slate-100">✕</button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-4">
        {loading ? <p className="py-10 text-center text-sm text-slate-400">Cargando…</p> : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className={cls.label}>Hora límite de reporte (hora local)</span>
                <input type="time" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={cls.input} />
              </label>
              <label><span className={cls.label}>Seguimiento desde</span>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={cls.input} />
              </label>
            </div>
            <p className="-mt-3 text-xs text-slate-500">Los días anteriores al inicio del seguimiento no exigen reporte: sin ventas se ven en gris y con ventas en verde.</p>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">Vendedores</h3>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {sellers.length === 0 && <p className="p-4 text-sm text-slate-400">Sin vendedores. Aparecen quienes tengan campañas o un rol con alcance «solo sus campañas».</p>}
                {sellers.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <span className={`min-w-0 flex-1 truncate text-sm font-medium ${s.active ? "text-[var(--ork-ink)]" : "text-slate-400"}`}>{s.name}</span>
                    <div className="flex gap-1">
                      {DAYS.map((d) => (
                        <button key={d.n} type="button" onClick={() => toggleDay(s, d.n)} aria-pressed={s.workDays.includes(d.n)} aria-label={`${DAY_NAMES[d.n]} laborable para ${s.name}`}
                          className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${s.workDays.includes(d.n) ? "bg-[var(--ork-purple)] text-white" : "bg-slate-100 text-slate-400"}`}>{d.l}</button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      <input type="checkbox" checked={s.active} onChange={(e) => patchSeller(s.id, { active: e.target.checked })} className="accent-[var(--ork-violet)]" />Activo
                    </label>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">Festivos y excepciones</h3>
              <div className="flex flex-wrap gap-2">
                <input type="date" aria-label="Fecha del festivo" value={hDate} onChange={(e) => setHDate(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-[var(--brand)]" />
                <input value={hLabel} onChange={(e) => setHLabel(e.target.value)} placeholder="Nombre (opcional)" maxLength={80} className={`${cls.input} min-w-0 flex-1`} />
                <button type="button" onClick={addHoliday} disabled={!hDate} className={cls.primary}>Agregar</button>
              </div>
              <ul className="mt-3 space-y-1">
                {holidays.length === 0 && <li className="text-sm text-slate-400">Sin festivos cargados.</li>}
                {holidays.map((h) => (
                  <li key={h.date} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200">
                    <span><b className="font-medium text-slate-700">{h.date}</b> <span className="text-slate-500">· {h.label}</span></span>
                    <button aria-label={`Quitar festivo ${h.date}`} onClick={() => setHolidays((p) => p.filter((x) => x.date !== h.date))} className="text-slate-400 hover:text-[var(--ork-pink)]">✕</button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--ork-rule)] px-6 py-4">
        <p className="min-w-0 text-sm text-rose-700">{error}</p>
        <div className="flex gap-2">
          <button onClick={onClose} className={cls.secondary}>Cancelar</button>
          <button onClick={save} disabled={saving || loading} className={cls.primary}>{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </Modal>
  );
}
