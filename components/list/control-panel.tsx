"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Panel de control de listas (estilo Odoo): Nuevo · título · búsqueda con facetas ·
 * menú Filtros / Agrupar por · paginador · selector de vista. Todo vive en la URL.
 */
export type FilterOption = { key: string; label: string };
export type ViewOption = { key: string; label: string; icon: "list" | "kanban" | "graph" };
type Props = {
  title: string; newHref?: string; newLabel?: string;
  filters: { group: string; options: FilterOption[] }[];
  groupBys: FilterOption[];
  views: ViewOption[];
  pager?: { from: number; to: number; total: number };
};

const ICON = {
  list: <path d="M3 5h14M3 10h14M3 15h14" />,
  kanban: <><rect x="3" y="3" width="4" height="14" rx="1" /><rect x="8" y="3" width="4" height="9" rx="1" /><rect x="13" y="3" width="4" height="11" rx="1" /></>,
  graph: <path d="M3 17h14M5 14V9M9 14V5M13 14v-3M17 14V7" />,
};

export function ControlPanel({ title, newHref, newLabel = "Nuevo", filters, groupBys, views, pager }: Props) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const box = useRef<HTMLDivElement>(null);
  const active = (sp.get("f") ?? "").split(",").filter(Boolean);
  const group = sp.get("group") ?? "";
  const view = sp.get("view") ?? views[0]?.key;
  const labelOf = (k: string) => filters.flatMap((g) => g.options).find((o) => o.key === k)?.label ?? k;

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!("page" in patch)) next.delete("page");
    router.push(`${path}?${next.toString()}`);
  };
  const toggleFilter = (k: string) => go({ f: (active.includes(k) ? active.filter((x) => x !== k) : [...active, k]).join(",") || null });

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-3">
        {newHref && <Link href={newHref} className="rounded-lg bg-[var(--ork-purple)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--ork-violet)]">{newLabel}</Link>}
        <h1 className="font-display text-2xl uppercase leading-none tracking-tight">{title}</h1>
      </div>

      <div ref={box} className="relative order-3 w-full lg:order-none lg:mx-auto lg:w-[34rem]">
        <form onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || null }); }}
          className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-stone-300 bg-white py-1 pl-3 pr-1 focus-within:border-[var(--ork-violet)]">
          <svg viewBox="0 0 20 20" width="15" height="15" className="shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="9" r="6" /><path d="M14 14l4 4" /></svg>
          {active.map((k) => (
            <span key={k} className="flex items-center gap-1 rounded-md bg-[var(--ork-lavender)]/35 py-0.5 pl-2 pr-1 text-xs font-medium text-[var(--ork-purple)]">
              <svg viewBox="0 0 20 20" width="11" height="11" fill="currentColor"><path d="M3 4h14l-5 7v5l-4 2v-7z" /></svg>{labelOf(k)}
              <button type="button" aria-label={`Quitar filtro ${labelOf(k)}`} onClick={() => toggleFilter(k)} className="rounded px-1 hover:bg-black/10">×</button>
            </span>
          ))}
          {group && (
            <span className="flex items-center gap-1 rounded-md bg-amber-100 py-0.5 pl-2 pr-1 text-xs font-medium text-amber-900">
              ≡ {groupBys.find((g) => g.key === group)?.label}
              <button type="button" aria-label="Quitar agrupación" onClick={() => go({ group: null })} className="rounded px-1 hover:bg-black/10">×</button>
            </span>
          )}
          {sp.get("q") && (
            <span className="flex items-center gap-1 rounded-md bg-stone-100 py-0.5 pl-2 pr-1 text-xs font-medium text-stone-800">
              “{sp.get("q")}”<button type="button" aria-label="Quitar búsqueda" onClick={() => { setQ(""); go({ q: null }); }} className="rounded px-1 hover:bg-black/10">×</button>
            </span>
          )}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="min-w-24 flex-1 bg-transparent py-1 text-sm outline-none" aria-label="Buscar" />
          <button type="button" aria-label="Filtros y agrupación" aria-expanded={open} onClick={() => setOpen(!open)} className="grid h-8 w-8 place-items-center rounded-md text-stone-600 hover:bg-stone-100">▾</button>
        </form>
        {open && (
          <div className="absolute left-0 right-0 z-30 mt-1 grid gap-4 rounded-xl border border-stone-200 bg-white p-4 text-sm shadow-xl sm:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ork-pink)]">Filtros</p>
              {filters.map((g, gi) => (
                <div key={g.group} className={gi ? "mt-2 border-t border-stone-100 pt-2" : ""}>
                  {g.options.map((o) => (
                    <button key={o.key} type="button" onClick={() => toggleFilter(o.key)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-stone-50">
                      <span className={`grid h-4 w-4 place-items-center rounded border ${active.includes(o.key) ? "border-[var(--ork-violet)] bg-[var(--ork-violet)] text-white" : "border-stone-300"}`}>{active.includes(o.key) && "✓"}</span>{o.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-700">Agrupar por</p>
              {groupBys.map((o) => (
                <button key={o.key} type="button" onClick={() => go({ group: group === o.key ? null : o.key })} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-stone-50">
                  <span className={`grid h-4 w-4 place-items-center rounded-full border ${group === o.key ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300"}`}>{group === o.key && "•"}</span>{o.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        {pager && (
          <div className="flex items-center gap-1 text-sm text-stone-700">
            <span className="tabular-nums">{pager.total ? `${pager.from}-${pager.to}` : "0"} / {pager.total}</span>
            <button type="button" aria-label="Página anterior" disabled={pager.from <= 1} onClick={() => go({ page: String(Math.max(1, Number(sp.get("page") ?? 1) - 1)) })} className="grid h-8 w-8 place-items-center rounded-md border border-stone-300 bg-white disabled:opacity-40">‹</button>
            <button type="button" aria-label="Página siguiente" disabled={pager.to >= pager.total} onClick={() => go({ page: String(Number(sp.get("page") ?? 1) + 1) })} className="grid h-8 w-8 place-items-center rounded-md border border-stone-300 bg-white disabled:opacity-40">›</button>
          </div>
        )}
        <div className="flex overflow-hidden rounded-lg border border-stone-300 bg-white">
          {views.map((v) => (
            <button key={v.key} type="button" title={v.label} aria-label={`Vista ${v.label}`} aria-pressed={view === v.key} onClick={() => go({ view: v.key === views[0].key ? null : v.key })}
              className={`grid h-9 w-10 place-items-center ${view === v.key ? "bg-[var(--ork-purple)] text-white" : "text-stone-600 hover:bg-stone-50"}`}>
              <svg viewBox="0 0 20 20" width="16" height="16" fill={v.icon === "kanban" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round">{ICON[v.icon]}</svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
