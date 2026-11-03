import { Badge, btn } from "@/components/ui";
import { LABELS } from "@/lib/apps/ops-shared";

/** Insignia con etiqueta y tono de los catálogos de Operaciones. */
export function OpsBadge({ kind, value }: { kind: keyof typeof LABELS; value: string | null | undefined }) {
  const map = LABELS[kind] as Record<string, [string, string]>;
  const l = value ? map[value] : undefined;
  return l ? <Badge tone={l[1]}>{l[0]}</Badge> : <span className="text-slate-400">—</span>;
}

export function opsOptions(kind: keyof typeof LABELS) {
  return Object.entries(LABELS[kind] as Record<string, [string, string]>).map(([value, [label]]) => <option key={value} value={value}>{label}</option>);
}

/** Filtro de periodo (GET): conserva los demás parámetros como campos ocultos. */
export function RangeFilter({ from, to, keep = {} }: { from: string; to: string; keep?: Record<string, string> }) {
  return (
    <form className="mb-4 flex flex-wrap items-end gap-2 text-sm">
      {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="text-xs text-slate-500">Desde<input type="date" name="from" defaultValue={from} className="ml-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm" /></label>
      <label className="text-xs text-slate-500">Hasta<input type="date" name="to" defaultValue={to} className="ml-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm" /></label>
      <button className={btn.small}>Aplicar</button>
    </form>
  );
}
