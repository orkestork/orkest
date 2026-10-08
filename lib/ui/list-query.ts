/**
 * Búsqueda de listas estilo Odoo, del lado del servidor. Todo vive en la URL:
 *   f=k1,k2           filtros predefinidos (los del mismo grupo se combinan con O)
 *   s=campo:valor     búsqueda por campo (repetible; mismo campo → O, campos distintos → Y)
 *   d=campo:periodo   filtro de fecha: 2026-10 (mes) · 2026-Q4 (trimestre) · 2026 (año)
 *   cx=campo~op~valor filtro personalizado (repetible, se combinan con Y)
 *   group=a,b         agrupación en varios niveles
 *   q=texto           búsqueda simple (compatibilidad) → primer campo de búsqueda
 */

export type SP = Record<string, string | string[] | undefined>;
export type FieldKind = "text" | "number" | "date" | "select" | "boolean";
/** Campo para filtros personalizados y agrupaciones personalizadas (se envía al cliente). */
export type ListField = { key: string; label: string; kind: FieldKind; options?: { value: string; label: string }[]; groupable?: boolean };

export const OPS: Record<FieldKind, { op: string; label: string }[]> = {
  text: [{ op: "contains", label: "contiene" }, { op: "ncontains", label: "no contiene" }, { op: "eq", label: "es igual a" }, { op: "set", label: "está establecido" }, { op: "unset", label: "no está establecido" }],
  number: [{ op: "eq", label: "=" }, { op: "ne", label: "≠" }, { op: "gt", label: ">" }, { op: "gte", label: "≥" }, { op: "lt", label: "<" }, { op: "lte", label: "≤" }],
  date: [{ op: "gte", label: "desde" }, { op: "lte", label: "hasta" }, { op: "eq", label: "el día" }, { op: "set", label: "está establecido" }, { op: "unset", label: "no está establecido" }],
  select: [{ op: "eq", label: "es" }, { op: "ne", label: "no es" }, { op: "set", label: "está establecido" }, { op: "unset", label: "no está establecido" }],
  boolean: [{ op: "true", label: "es verdadero" }, { op: "false", label: "es falso" }],
};

const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

export function parseList(sp: SP, defaultSearchField?: string) {
  const search = new Map<string, string[]>();
  for (const raw of all(sp.s)) {
    const i = raw.indexOf(":");
    if (i <= 0) continue;
    const k = raw.slice(0, i), v = raw.slice(i + 1).trim();
    if (v) search.set(k, [...(search.get(k) ?? []), v]);
  }
  const q = one(sp.q).trim();
  if (q && defaultSearchField) search.set(defaultSearchField, [...(search.get(defaultSearchField) ?? []), q]);
  const dates = new Map<string, string[]>();
  for (const raw of all(sp.d)) {
    const [k, p] = raw.split(":");
    if (k && p) dates.set(k, [...(dates.get(k) ?? []), p]);
  }
  const custom = all(sp.cx).map((raw) => { const [field, op, ...rest] = raw.split("~"); return { field, op, value: rest.join("~") }; }).filter((c) => c.field && c.op);
  return {
    filters: one(sp.f).split(",").filter(Boolean),
    search, dates, custom,
    groups: one(sp.group).split(",").filter(Boolean),
    page: Math.max(1, Number(one(sp.page)) || 1),
    sort: one(sp.sort), dir: one(sp.dir) === "asc" ? ("asc" as const) : ("desc" as const),
    view: one(sp.view) || "list",
    isEmpty: Object.keys(sp).length === 0,
  };
}

/** Rango [desde, hasta) de un periodo: 2026-10 · 2026-Q4 · 2026 */
export function periodRange(p: string): [Date, Date] | null {
  let m = /^(\d{4})-(\d{2})$/.exec(p);
  if (m) { const y = +m[1], mo = +m[2] - 1; return [new Date(y, mo, 1), new Date(y, mo + 1, 1)]; }
  m = /^(\d{4})-Q([1-4])$/.exec(p);
  if (m) { const y = +m[1], q = +m[2] - 1; return [new Date(y, q * 3, 1), new Date(y, q * 3 + 3, 1)]; }
  m = /^(\d{4})$/.exec(p);
  if (m) { const y = +m[1]; return [new Date(y, 0, 1), new Date(y + 1, 0, 1)]; }
  return null;
}

/** Filtro de fecha: periodos del mismo campo se combinan con O. Devuelve condiciones para AND. */
export function dateWhere(dates: Map<string, string[]>, column: (field: string) => string | null) {
  const and: Record<string, unknown>[] = [];
  for (const [field, periods] of dates) {
    const col = column(field);
    if (!col) continue;
    const ors = periods.map(periodRange).filter((r): r is [Date, Date] => !!r).map(([a, b]) => ({ [col]: { gte: a, lt: b } }));
    if (ors.length) and.push({ OR: ors });
  }
  return and;
}

/** Condición Prisma para un filtro personalizado sobre una columna simple. */
export function customCondition(kind: FieldKind, op: string, raw: string): unknown {
  const v = kind === "number" ? Number(raw) : kind === "date" ? new Date(raw) : raw;
  if (kind === "number" && !Number.isFinite(v as number)) return undefined;
  if (kind === "date" && Number.isNaN((v as Date).getTime?.())) { if (!["set", "unset"].includes(op)) return undefined; }
  switch (op) {
    case "contains": return { contains: raw, mode: "insensitive" };
    case "ncontains": return { not: { contains: raw, mode: "insensitive" } };
    case "eq":
      if (kind === "date") { const d = v as Date; const e = new Date(d); e.setDate(e.getDate() + 1); return { gte: d, lt: e }; }
      return kind === "text" ? { equals: raw, mode: "insensitive" } : { equals: v };
    case "ne": return { not: v };
    case "gt": return { gt: v };
    case "gte": return { gte: v };
    case "lt": return { lt: v };
    case "lte": if (kind === "date") { const e = new Date(v as Date); e.setDate(e.getDate() + 1); return { lt: e }; } return { lte: v };
    case "set": return { not: null };
    case "unset": return null;
    case "true": return true;
    case "false": return false;
  }
  return undefined;
}

/** Periodos que ofrece el menú de fechas: últimos 3 meses, trimestres del año y últimos 3 años. */
export function datePeriods(now = new Date()) {
  const months = [0, 1, 2].map((i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("es-CO", { month: "long" }) }; });
  const y = now.getFullYear();
  const quarters = [1, 2, 3, 4].map((q) => ({ key: `${y}-Q${q}`, label: `T${q}` }));
  const years = [0, 1, 2].map((i) => ({ key: String(y - i), label: String(y - i) }));
  return { months, quarters, years };
}

/** Etiqueta legible de un periodo: "octubre 2026", "T4 2026", "2026" */
export function periodLabel(p: string) {
  let m = /^(\d{4})-(\d{2})$/.exec(p);
  if (m) return new Date(+m[1], +m[2] - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  m = /^(\d{4})-Q([1-4])$/.exec(p);
  if (m) return `T${m[2]} ${m[1]}`;
  return p;
}
