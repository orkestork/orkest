"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { OPS, datePeriods, periodLabel, type ListField } from "@/lib/ui/list-query";
import type { Favorite } from "@/lib/ui/favorites";
import { deleteFavorite, saveFavorite } from "@/app/(app)/favorites-actions";

/**
 * Panel de control de listas (réplica del buscador de Odoo): Nuevo · título · caja de búsqueda con facetas,
 * sugerencias "Buscar <campo> por…", menú Filtros / Agrupar por / Favoritos, paginador y selector de vista.
 * Todo vive en la URL (ver lib/ui/list-query.ts), así que se puede compartir y guardar como favorito.
 */
export type FilterOption = { key: string; label: string };
export type ViewOption = { key: string; label: string; icon: "list" | "kanban" | "graph" };
type Props = {
  title: string; newHref?: string; newLabel?: string;
  filters: { group: string; options: FilterOption[] }[];
  groupBys: FilterOption[];
  views: ViewOption[];
  pager?: { from: number; to: number; total: number };
  /** Campos para "Buscar <campo> por…" (el primero es el de Enter) */
  searchFields?: FilterOption[];
  /** Campos de fecha con menú de periodos (meses, trimestres, años) */
  dateFields?: FilterOption[];
  /** Campos para filtro y agrupación personalizados */
  fields?: ListField[];
  /** Favoritos guardados (SavedView) y la entidad a la que pertenecen */
  favorites?: Favorite[]; entityType?: string;
};

type Facet = { id: string; kind: "fav" | "filter" | "search" | "date" | "custom" | "group"; icon: string; label: string; remove: () => void };

const ICON = {
  list: <path d="M3 5h14M3 10h14M3 15h14" />,
  kanban: <><rect x="3" y="3" width="4" height="14" rx="1" /><rect x="8" y="3" width="4" height="9" rx="1" /><rect x="13" y="3" width="4" height="11" rx="1" /></>,
  graph: <path d="M3 17h14M5 14V9M9 14V5M13 14v-3M17 14V7" />,
};
const FACET_TONE: Record<Facet["kind"], string> = {
  fav: "bg-amber-100 text-amber-900", filter: "bg-[var(--ork-lavender)]/35 text-[var(--ork-purple)]", search: "bg-stone-100 text-stone-800",
  date: "bg-[var(--ork-lavender)]/35 text-[var(--ork-purple)]", custom: "bg-[var(--ork-lavender)]/35 text-[var(--ork-purple)]", group: "bg-teal-100 text-teal-900",
};
const sel = "rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm";
const canonical = (qs: string) => { const p = new URLSearchParams(qs); for (const k of ["page", "all", "sort", "dir", "view"]) p.delete(k); p.sort(); return p.toString(); };

export function ControlPanel({ title, newHref, newLabel = "Nuevo", filters, groupBys, views, pager, searchFields = [], dateFields = [], fields = [], favorites = [], entityType }: Props) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [hi, setHi] = useState(0);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [custom, setCustom] = useState<{ field: string; op: string; value: string } | null>(null);
  const [saving, setSaving] = useState<{ name: string; isDefault: boolean; shared: boolean } | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = (sp.get("f") ?? "").split(",").filter(Boolean);
  const groups = (sp.get("group") ?? "").split(",").filter(Boolean);
  const view = sp.get("view") ?? views[0]?.key;
  const periods = useMemo(() => datePeriods(), []);
  const fieldOf = (k: string) => fields.find((f) => f.key === k);
  const groupLabel = (k: string) => groupBys.find((g) => g.key === k)?.label ?? fieldOf(k)?.label ?? k;

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setText((t) => t); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  /** Navega con los parámetros modificados. Una búsqueda vacía se marca con all=1 para no reaplicar el favorito predeterminado. */
  const nav = (mutate: (p: URLSearchParams) => void, keepPage = false) => {
    const next = new URLSearchParams(sp.toString());
    mutate(next);
    if (!keepPage) next.delete("page");
    next.delete("all");
    if ([...next.keys()].length === 0) next.set("all", "1");
    router.push(`${path}?${next.toString()}`);
  };
  const setParam = (k: string, v: string | null, keepPage = false) => nav((p) => (v ? p.set(k, v) : p.delete(k)), keepPage);
  const toggleFilter = (k: string) => setParam("f", (active.includes(k) ? active.filter((x) => x !== k) : [...active, k]).join(",") || null);
  const removeMulti = (k: string, v: string) => nav((p) => { const rest = p.getAll(k).filter((x) => x !== v); p.delete(k); rest.forEach((x) => p.append(k, x)); });
  const toggleMulti = (k: string, v: string) => (sp.getAll(k).includes(v) ? removeMulti(k, v) : nav((p) => p.append(k, v)));
  const toggleGroup = (k: string) => setParam("group", (groups.includes(k) ? groups.filter((g) => g !== k) : [...groups, k]).join(",") || null);

  // ── Facetas (en el orden de Odoo: favorito, filtros, fechas, personalizados, búsquedas, agrupación) ──
  const current = canonical(sp.toString());
  const favActive = favorites.find((f) => f.qs && canonical(f.qs) === current);
  const facets: Facet[] = [];
  if (favActive) facets.push({ id: "fav", kind: "fav", icon: "★", label: favActive.name, remove: () => nav((p) => { for (const k of [...new Set(p.keys())]) if (!["view", "sort", "dir"].includes(k)) p.delete(k); }) });
  else {
    for (const g of filters) {
      const on = g.options.filter((o) => active.includes(o.key));
      if (on.length) facets.push({ id: `f:${g.group}`, kind: "filter", icon: "⏷", label: on.map((o) => o.label).join(" o "), remove: () => setParam("f", active.filter((k) => !on.some((o) => o.key === k)).join(",") || null) });
    }
    const orphan = active.filter((k) => !filters.some((g) => g.options.some((o) => o.key === k)));
    for (const k of orphan) facets.push({ id: `f:${k}`, kind: "filter", icon: "⏷", label: k, remove: () => toggleFilter(k) });
    const byDate = new Map<string, string[]>();
    for (const raw of sp.getAll("d")) { const [k, p] = raw.split(":"); byDate.set(k, [...(byDate.get(k) ?? []), p]); }
    for (const [k, ps] of byDate) facets.push({ id: `d:${k}`, kind: "date", icon: "⏷", label: `${dateFields.find((f) => f.key === k)?.label ?? k}: ${ps.map(periodLabel).join(" o ")}`, remove: () => nav((p) => { const rest = p.getAll("d").filter((x) => !x.startsWith(`${k}:`)); p.delete("d"); rest.forEach((x) => p.append("d", x)); }) });
    for (const raw of sp.getAll("cx")) {
      const [k, op, ...rest] = raw.split("~"); const f = fieldOf(k); const val = rest.join("~");
      const opLabel = OPS[f?.kind ?? "text"].find((o) => o.op === op)?.label ?? op;
      const shown = f?.options?.find((o) => o.value === val)?.label ?? val;
      facets.push({ id: `cx:${raw}`, kind: "custom", icon: "⏷", label: `${f?.label ?? k} ${opLabel}${["set", "unset", "true", "false"].includes(op) ? "" : ` ${shown}`}`, remove: () => removeMulti("cx", raw) });
    }
    const bySearch = new Map<string, string[]>();
    for (const raw of sp.getAll("s")) { const i = raw.indexOf(":"); bySearch.set(raw.slice(0, i), [...(bySearch.get(raw.slice(0, i)) ?? []), raw.slice(i + 1)]); }
    if (sp.get("q")) bySearch.set(searchFields[0]?.key ?? "q", [...(bySearch.get(searchFields[0]?.key ?? "q") ?? []), sp.get("q")!]);
    for (const [k, vs] of bySearch) facets.push({ id: `s:${k}`, kind: "search", icon: "🔍", label: `${searchFields.find((f) => f.key === k)?.label ?? "Buscar"}: ${vs.join(" o ")}`, remove: () => nav((p) => { const rest = p.getAll("s").filter((x) => !x.startsWith(`${k}:`)); p.delete("s"); rest.forEach((x) => p.append("s", x)); if (k === (searchFields[0]?.key ?? "q")) p.delete("q"); }) });
  }
  if (groups.length && !favActive) facets.push({ id: "group", kind: "group", icon: "≡", label: groups.map(groupLabel).join(" › "), remove: () => setParam("group", null) });
  else if (groups.length && favActive) { /* la agrupación forma parte del favorito */ }

  const addSearch = (fieldKey: string) => {
    const v = text.trim();
    if (!v) return;
    setText(""); setHi(0);
    nav((p) => { if (searchFields.length) p.append("s", `${fieldKey}:${v}`); else p.set("q", v); });
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !text && facets.length) { e.preventDefault(); facets[facets.length - 1].remove(); }
    else if (e.key === "ArrowDown" && text) { e.preventDefault(); setHi((h) => Math.min(h + 1, Math.max(searchFields.length - 1, 0))); }
    else if (e.key === "ArrowUp" && text) { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); addSearch(searchFields[hi]?.key ?? "q"); }
    else if (e.key === "Escape") { setText(""); setOpen(false); }
  };

  const applyCustom = () => {
    if (!custom) return;
    const f = fieldOf(custom.field);
    const needsValue = !["set", "unset", "true", "false"].includes(custom.op);
    if (!f || (needsValue && !custom.value.trim())) return;
    nav((p) => p.append("cx", `${custom.field}~${custom.op}~${needsValue ? custom.value.trim() : ""}`));
    setCustom(null);
  };
  const doSave = () => {
    if (!saving || !entityType) return;
    start(async () => {
      const r = await saveFavorite({ entityType, path, name: saving.name, qs: sp.toString(), isDefault: saving.isDefault, shared: saving.shared });
      if (r.ok) { setSaving(null); router.refresh(); }
    });
  };

  const check = (on: boolean, round = false) => (
    <span className={`grid h-4 w-4 shrink-0 place-items-center border text-[10px] ${round ? "rounded-full" : "rounded"} ${on ? "border-[var(--ork-violet)] bg-[var(--ork-violet)] text-white" : "border-stone-300"}`}>{on && "✓"}</span>
  );
  const item = "flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-stone-50";
  const customField = custom ? fieldOf(custom.field) : undefined;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-3">
        {newHref && <Link href={newHref} className="rounded-lg bg-[var(--ork-purple)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--ork-violet)]">{newLabel}</Link>}
        <h1 className="font-display text-2xl uppercase leading-none tracking-tight">{title}</h1>
      </div>

      <div ref={box} className="relative order-3 w-full lg:order-none lg:mx-auto lg:w-[38rem]">
        <div onClick={() => inputRef.current?.focus()} className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-stone-300 bg-white py-1 pl-3 pr-1 focus-within:border-[var(--ork-violet)]">
          <svg viewBox="0 0 20 20" width="15" height="15" className="shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="9" cy="9" r="6" /><path d="M14 14l4 4" /></svg>
          {facets.map((f) => (
            <span key={f.id} className={`flex max-w-full items-center gap-1 rounded-md py-0.5 pl-1 pr-1 text-xs font-medium ${FACET_TONE[f.kind]}`}>
              <span className={`grid h-5 min-w-5 place-items-center rounded px-1 text-[11px] ${f.kind === "fav" ? "bg-amber-400 text-white" : f.kind === "group" ? "bg-teal-700 text-white" : f.kind === "search" ? "bg-stone-500 text-white" : "bg-[var(--ork-violet)] text-white"}`} aria-hidden>{f.icon}</span>
              <span className="truncate">{f.label}</span>
              <button type="button" aria-label={`Quitar ${f.label}`} onClick={(e) => { e.stopPropagation(); f.remove(); }} className="rounded px-1 hover:bg-black/10">×</button>
            </span>
          ))}
          <input ref={inputRef} value={text} onChange={(e) => { setText(e.target.value); setHi(0); }} onKeyDown={onKey} placeholder="Buscar…"
            className="min-w-24 flex-1 bg-transparent py-1 text-sm outline-none" role="combobox" aria-label="Buscar" aria-autocomplete="list" aria-expanded={!!text} aria-controls="search-suggestions" />
          <button type="button" aria-label="Filtros, agrupación y favoritos" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="grid h-8 w-8 place-items-center rounded-md text-stone-600 hover:bg-stone-100">▾</button>
        </div>

        {text && (
          <ul id="search-suggestions" role="listbox" className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 text-sm shadow-xl">
            {(searchFields.length ? searchFields : [{ key: "q", label: "" }]).map((f, i) => (
              <li key={f.key} role="option" aria-selected={i === hi}>
                <button type="button" onMouseEnter={() => setHi(i)} onClick={() => addSearch(f.key)} className={`block w-full px-4 py-1.5 text-left ${i === hi ? "bg-[var(--ork-lavender)]/25" : ""}`}>
                  Buscar {f.label && <b>{f.label}</b>} por: <i className="text-[var(--ork-violet)]">{text}</i>
                </button>
              </li>
            ))}
          </ul>
        )}

        {open && !text && (
          <div className="absolute left-1/2 z-30 mt-1 grid max-h-[72vh] w-[min(52rem,calc(100vw-2rem))] -translate-x-1/2 gap-4 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4 text-sm shadow-xl md:grid-cols-[1.2fr_1fr_1fr]">
            {/* ── Filtros ── */}
            <div className="min-w-0">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ork-pink)]">⏷ Filtros</p>
              {filters.map((g, gi) => (
                <div key={g.group} className={gi ? "mt-2 border-t border-stone-100 pt-2" : ""}>
                  {g.options.map((o) => <button key={o.key} type="button" onClick={() => toggleFilter(o.key)} className={item}>{check(active.includes(o.key))}{o.label}</button>)}
                </div>
              ))}
              {dateFields.map((df) => {
                const on = sp.getAll("d").filter((x) => x.startsWith(`${df.key}:`)).map((x) => x.split(":")[1]);
                const opt = (p: { key: string; label: string }) => (
                  <button key={p.key} type="button" onClick={() => toggleMulti("d", `${df.key}:${p.key}`)} className={`${item} pl-7 text-[13px]`}>{check(on.includes(p.key))}{p.label}</button>
                );
                return (
                  <div key={df.key} className="mt-2 border-t border-stone-100 pt-2">
                    <button type="button" onClick={() => setOpenDate(openDate === df.key ? null : df.key)} aria-expanded={openDate === df.key} className={`${item} justify-between`}>
                      <span className="flex items-center gap-2">{check(on.length > 0)}{df.label}</span><span className="text-stone-400">{openDate === df.key ? "▾" : "▸"}</span>
                    </button>
                    {openDate === df.key && <div>{periods.months.map(opt)}<div className="my-1 border-t border-stone-100" />{periods.quarters.map(opt)}<div className="my-1 border-t border-stone-100" />{periods.years.map(opt)}</div>}
                  </div>
                );
              })}
              {fields.length > 0 && (
                <div className="mt-2 border-t border-stone-100 pt-2">
                  {!custom ? (
                    <button type="button" onClick={() => setCustom({ field: fields[0].key, op: OPS[fields[0].kind][0].op, value: "" })} className="px-2 py-1 text-[13px] font-medium text-[var(--ork-violet)] hover:underline">Agregar filtro personalizado</button>
                  ) : (
                    <div className="space-y-2 rounded-lg bg-stone-50 p-2">
                      <select aria-label="Campo" className={`${sel} w-full`} value={custom.field} onChange={(e) => { const f = fieldOf(e.target.value)!; setCustom({ field: f.key, op: OPS[f.kind][0].op, value: "" }); }}>
                        {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                      <select aria-label="Condición" className={`${sel} w-full`} value={custom.op} onChange={(e) => setCustom({ ...custom, op: e.target.value })}>
                        {OPS[customField?.kind ?? "text"].map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                      </select>
                      {!["set", "unset", "true", "false"].includes(custom.op) && (customField?.kind === "select" ? (
                        <select aria-label="Valor" className={`${sel} w-full`} value={custom.value} onChange={(e) => setCustom({ ...custom, value: e.target.value })}>
                          <option value="">Selecciona…</option>{customField.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <input aria-label="Valor" className={`${sel} w-full`} type={customField?.kind === "number" ? "number" : customField?.kind === "date" ? "date" : "text"} value={custom.value}
                          onChange={(e) => setCustom({ ...custom, value: e.target.value })} onKeyDown={(e) => e.key === "Enter" && applyCustom()} />
                      ))}
                      <div className="flex gap-2">
                        <button type="button" onClick={applyCustom} className="rounded-md bg-[var(--ork-purple)] px-3 py-1 text-xs font-medium text-white">Aplicar</button>
                        <button type="button" onClick={() => setCustom(null)} className="rounded-md px-3 py-1 text-xs text-stone-600 hover:bg-stone-200">Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Agrupar por ── */}
            <div className="min-w-0 md:border-l md:border-stone-100 md:pl-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-700">≡ Agrupar por</p>
              {groupBys.map((o) => (
                <button key={o.key} type="button" onClick={() => toggleGroup(o.key)} className={item}>
                  {check(groups.includes(o.key))}{o.label}{groups.includes(o.key) && groups.length > 1 && <span className="ml-auto text-[11px] text-stone-500">nivel {groups.indexOf(o.key) + 1}</span>}
                </button>
              ))}
              {fields.some((f) => f.groupable) && (
                <div className="mt-2 border-t border-stone-100 pt-2">
                  <select aria-label="Agregar grupo personalizado" className={`${sel} w-full text-[13px]`} value="" onChange={(e) => e.target.value && toggleGroup(e.target.value)}>
                    <option value="">Agregar grupo personalizado…</option>
                    {fields.filter((f) => f.groupable && !groupBys.some((g) => g.key === f.key)).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* ── Favoritos ── */}
            <div className="min-w-0 md:border-l md:border-stone-100 md:pl-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">★ Favoritos</p>
              {favorites.length === 0 && <p className="px-2 py-1 text-[13px] text-stone-500">Aún no hay búsquedas guardadas.</p>}
              {favorites.map((f) => (
                <div key={f.id} className="group flex items-center">
                  <button type="button" onClick={() => router.push(`${path}?${f.qs || "all=1"}`)} className={`${item} min-w-0`}>
                    {check(favActive?.id === f.id)}<span className="truncate">{f.name}</span>
                    {f.isDefault && <span className="text-[10px] text-amber-700" title="Predeterminado">★</span>}
                    {f.shared && <span className="text-[10px] text-stone-500" title="Compartido">👥</span>}
                  </button>
                  {(f.mine || f.shared) && (
                    <button type="button" aria-label={`Eliminar favorito ${f.name}`} onClick={() => start(async () => { await deleteFavorite(f.id, path); router.refresh(); })}
                      className="px-2 text-stone-400 opacity-0 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100">×</button>
                  )}
                </div>
              ))}
              {entityType && (
                <div className="mt-2 border-t border-stone-100 pt-2">
                  {!saving ? (
                    <button type="button" onClick={() => setSaving({ name: title, isDefault: false, shared: false })} className="px-2 py-1 text-[13px] font-medium text-[var(--ork-violet)] hover:underline">Guardar búsqueda actual</button>
                  ) : (
                    <div className="space-y-2 rounded-lg bg-stone-50 p-2">
                      <input aria-label="Nombre del favorito" autoFocus className={`${sel} w-full`} value={saving.name} onChange={(e) => setSaving({ ...saving, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && doSave()} />
                      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={saving.isDefault} onChange={(e) => setSaving({ ...saving, isDefault: e.target.checked })} className="accent-[var(--ork-violet)]" />Filtro predeterminado</label>
                      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={saving.shared} onChange={(e) => setSaving({ ...saving, shared: e.target.checked })} className="accent-[var(--ork-violet)]" />Compartido con todos</label>
                      <div className="flex gap-2">
                        <button type="button" disabled={pending} onClick={doSave} className="rounded-md bg-[var(--ork-purple)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50">{pending ? "Guardando…" : "Guardar"}</button>
                        <button type="button" onClick={() => setSaving(null)} className="rounded-md px-3 py-1 text-xs text-stone-600 hover:bg-stone-200">Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        {pager && (
          <div className="flex items-center gap-1 text-sm text-stone-700">
            <span className="tabular-nums">{pager.total ? `${pager.from.toLocaleString("es-CO")}-${pager.to.toLocaleString("es-CO")}` : "0"} / {pager.total.toLocaleString("es-CO")}</span>
            <button type="button" aria-label="Página anterior" disabled={pager.from <= 1} onClick={() => setParam("page", String(Math.max(1, Number(sp.get("page") ?? 1) - 1)), true)} className="grid h-8 w-8 place-items-center rounded-md border border-stone-300 bg-white disabled:opacity-40">‹</button>
            <button type="button" aria-label="Página siguiente" disabled={pager.to >= pager.total} onClick={() => setParam("page", String(Number(sp.get("page") ?? 1) + 1), true)} className="grid h-8 w-8 place-items-center rounded-md border border-stone-300 bg-white disabled:opacity-40">›</button>
          </div>
        )}
        <div className="flex overflow-hidden rounded-lg border border-stone-300 bg-white">
          {views.map((v) => (
            <button key={v.key} type="button" title={v.label} aria-label={`Vista ${v.label}`} aria-pressed={view === v.key} onClick={() => setParam("view", v.key === views[0].key ? null : v.key, true)}
              className={`grid h-9 w-10 place-items-center ${view === v.key ? "bg-[var(--ork-purple)] text-white" : "text-stone-600 hover:bg-stone-50"}`}>
              <svg viewBox="0 0 20 20" width="16" height="16" fill={v.icon === "kanban" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round">{ICON[v.icon]}</svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
