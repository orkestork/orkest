import Link from "@/components/plink";
import { btn, input } from "@/components/ui";
import { addMonths, isYm, localDay, MANUAL_CATEGORIES, monthLabel } from "@/lib/apps/finance";

/** Mes de la URL (?month=YYYY-MM) o el actual. */
export async function monthParam(searchParams: Promise<{ month?: string | string[] }>) {
  const { month } = await searchParams;
  return isYm(month) ? month : localDay().slice(0, 7);
}

/** Selector de mes: ‹ noviembre de 2026 › · Hoy */
export function MonthNav({ ym, path }: { ym: string; path: string }) {
  const thisYm = localDay().slice(0, 7);
  const link = (m: string) => `${path}?month=${m}`;
  const arrow = "grid h-8 w-8 place-items-center rounded-full border border-slate-300 bg-white text-slate-600 hover:border-[var(--ork-violet)] hover:text-[var(--ork-violet)]";
  return (
    <div className="flex items-center gap-2">
      <Link href={link(addMonths(ym, -1))} className={arrow} aria-label="Mes anterior">‹</Link>
      <span className="min-w-[150px] text-center text-sm font-semibold text-[var(--ork-ink)]">{monthLabel(ym).replace(/^./, (c) => c.toUpperCase())}</span>
      <Link href={link(addMonths(ym, 1))} className={arrow} aria-label="Mes siguiente">›</Link>
      {ym !== thisYm && <Link href={path} className={btn.small}>Hoy</Link>}
    </div>
  );
}

/** Categorías que se registran a mano, agrupadas. */
export function CategorySelect({ name = "category", defaultValue }: { name?: string; defaultValue?: string }) {
  const groups = [...new Set(MANUAL_CATEGORIES.map((c) => c.group))];
  return (
    <select name={name} required defaultValue={defaultValue ?? ""} className={input}>
      <option value="" disabled>Elige una categoría</option>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {MANUAL_CATEGORIES.filter((c) => c.group === g).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export { RowAction } from "./row-action";

/** Barra horizontal de avance (gastado vs. presupuesto). */
export function Bar({ value, max, over }: { value: number; max: number; over?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${over ? "bg-rose-500" : "bg-[var(--ork-violet)]"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export const tone = (v: number) => (v < 0 ? "text-rose-600" : "text-emerald-700");

/** Fecha de una columna @db.Date (día sin hora, guardado a medianoche UTC). */
export const day = (d: Date) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/** Día por defecto de un formulario: hoy si se está viendo el mes actual; si no, el 1 del mes. */
export const defaultDayFor = (ym: string) => (localDay().startsWith(ym) ? localDay() : `${ym}-01`);
