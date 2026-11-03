import NextLink from "next/link";
import type { ReactNode } from "react";
import { ActionForm, type ActionResult } from "@/components/action-form";
import { Badge, btn, input } from "@/components/ui";

/** Fecha de calendario (guardada como medianoche UTC) sin corrimiento de zona horaria. */
export const dday = (d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) =>
  d ? new Date(d).toLocaleDateString("es-CO", { ...opts, timeZone: "UTC" }) : "—";
export const isoDay = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/** Pestañas secundarias dentro de una sección. */
export function Tabs({ items, active }: { items: { label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="mb-5 flex flex-wrap gap-1 border-b border-[var(--ork-rule)]">
      {items.map((t) => (
        <NextLink key={t.href} href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${t.href === active ? "border-[var(--brand)] font-medium text-[var(--ork-ink)]" : "border-transparent text-slate-500 hover:text-slate-900"}`}>
          {t.label}{t.count ? <span className="ml-1.5 rounded-full bg-[var(--ork-pink)]/10 px-1.5 text-xs text-[var(--ork-pink)]">{t.count}</span> : null}
        </NextLink>
      ))}
    </nav>
  );
}

export function Pill({ map, value }: { map: Record<string, { label: string; tone: string }>; value: string }) {
  const v = map[value];
  return <Badge tone={v?.tone ?? "slate"}>{v?.label ?? value}</Badge>;
}

/** Aprobar / rechazar con motivo (obligatorio al rechazar). */
export function DecisionForm({ action, id, extra, compact = false }: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>; id: string; extra?: ReactNode; compact?: boolean;
}) {
  return (
    <ActionForm action={action} className={compact ? "flex flex-wrap items-center gap-2" : "space-y-2"}>
      <input type="hidden" name="id" value={id} />
      {extra}
      <input name="reviewNote" placeholder="Comentario (obligatorio si rechazas)" className={`${input} ${compact ? "max-w-56 py-1 text-xs" : ""}`} />
      <div className="flex gap-2">
        <button type="submit" name="status" value="APPROVED" className={btn.small}>Aprobar</button>
        <button type="submit" name="status" value="REJECTED" className="inline-flex items-center rounded-full border border-[var(--ork-pink)]/30 px-3 py-1 text-xs font-medium text-[var(--ork-pink)] hover:bg-[var(--ork-pink)]/10">Rechazar</button>
      </div>
    </ActionForm>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warn" | "ok" }) {
  return (
    <div className="rounded-2xl border border-[var(--ork-rule)] bg-white/90 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold leading-none tabular-nums ${tone === "warn" ? "text-[var(--ork-pink)]" : tone === "ok" ? "text-emerald-700" : "text-[var(--ork-ink)]"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Select({ name, options, defaultValue, empty, required, className = "" }: {
  name: string; options: { value: string; label: string }[]; defaultValue?: string | null; empty?: string; required?: boolean; className?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} required={required} className={`${input} ${className}`}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Barra horizontal simple para reportes (porcentaje sobre el máximo). */
export function Bars({ rows, format = (v) => v.toLocaleString("es-CO") }: { rows: { label: string; total: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-slate-400">Sin datos en este rango.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between gap-2"><span className="truncate text-slate-700">{r.label}</span><span className="tabular-nums text-slate-500">{format(r.total)}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[var(--brand)]" style={{ width: `${(r.total / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
