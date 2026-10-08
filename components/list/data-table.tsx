"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Tabla de lista estilo Odoo: selección múltiple, columnas ordenables y opcionales
 * (preferencia guardada en el navegador), grupos plegables con subtotales,
 * totales al pie y clic en fila para abrir el registro. Exporta la selección a CSV.
 */
export type Column = { key: string; label: string; align?: "right" | "center"; sortable?: boolean; optional?: boolean; hidden?: boolean; sum?: boolean; width?: string };
export type Row = { id: string; href: string; cells: Record<string, ReactNode>; raw: Record<string, string | number> };
export type Group = { key: string; label: string; rows: Row[] };

const fmtSum = (v: number, money: boolean) => (money ? v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }) : v.toLocaleString("es-CO"));

export function DataTable({ storageKey, columns, rows, groups, moneyColumns = [] }: {
  storageKey: string; columns: Column[]; rows: Row[]; groups?: Group[]; moneyColumns?: string[];
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [visible, setVisible] = useState<Set<string>>(() => new Set(columns.filter((c) => !c.hidden).map((c) => c.key)));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chooser, setChooser] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`cols:${storageKey}`);
      if (saved) setVisible(new Set(JSON.parse(saved) as string[]));
    } catch { /* sin almacenamiento disponible */ }
  }, [storageKey]);
  const toggleCol = (k: string) => {
    const next = new Set(visible);
    if (next.has(k)) next.delete(k); else next.add(k);
    setVisible(next);
    try { localStorage.setItem(`cols:${storageKey}`, JSON.stringify([...next])); } catch { /* opcional */ }
  };

  const cols = columns.filter((c) => !c.optional || visible.has(c.key));
  const sort = sp.get("sort") ?? "", dir = sp.get("dir") ?? "desc";
  const sortBy = (k: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set("sort", k);
    next.set("dir", sort === k && dir === "desc" ? "asc" : "desc");
    router.push(`${path}?${next.toString()}`);
  };
  const all = groups ? groups.flatMap((g) => g.rows) : rows;
  const allSelected = all.length > 0 && all.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sums = (rs: Row[]) => Object.fromEntries(cols.filter((c) => c.sum).map((c) => [c.key, rs.reduce((s, r) => s + Number(r.raw[c.key] ?? 0), 0)]));

  const exportCsv = () => {
    const pick = all.filter((r) => selected.has(r.id));
    const header = cols.map((c) => c.label);
    const lines = pick.map((r) => cols.map((c) => `"${String(r.raw[c.key] ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${storageKey}.csv`;
    a.click();
  };

  const renderRow = (r: Row) => (
    <tr key={r.id} onClick={() => router.push(r.href)} className={`cursor-pointer border-b border-stone-100 hover:bg-[var(--ork-lavender)]/10 ${selected.has(r.id) ? "bg-[var(--ork-lavender)]/15" : ""}`}>
      <td className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label="Seleccionar fila" className="h-4 w-4 accent-[var(--ork-violet)]" />
      </td>
      {cols.map((c) => <td key={c.key} className={`max-w-0 truncate px-3 py-2.5 ${c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : ""}`}>{r.cells[c.key]}</td>)}
      <td />
    </tr>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--ork-rule)] bg-white">
      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-stone-200 bg-[var(--ork-lavender)]/20 px-4 py-2 text-sm">
          <span className="font-medium text-[var(--ork-purple)]">{selected.size} seleccionado(s)</span>
          <button onClick={exportCsv} className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium hover:border-[var(--ork-violet)]">Exportar CSV</button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-stone-600 hover:underline">Quitar selección</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed text-sm">
          <colgroup><col className="w-10" />{cols.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}<col className="w-9" /></colgroup>
          <thead>
            <tr className="border-b border-stone-200 text-left text-[13px] font-semibold text-stone-800">
              <th className="px-3 py-2.5"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(all.map((r) => r.id)))} aria-label="Seleccionar todo" className="h-4 w-4 accent-[var(--ork-violet)]" /></th>
              {cols.map((c) => (
                <th key={c.key} className={`truncate px-3 py-2.5 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}>
                  {c.sortable ? (
                    <button onClick={() => sortBy(c.key)} className="inline-flex max-w-full items-center gap-1 hover:text-[var(--ork-violet)]">
                      <span className="truncate">{c.label}</span>{sort === c.key && <span aria-hidden="true">{dir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  ) : c.label}
                </th>
              ))}
              <th className="relative px-1">
                <button onClick={() => setChooser(!chooser)} aria-label="Elegir columnas" className="grid h-7 w-7 place-items-center rounded hover:bg-stone-100">⚙</button>
                {chooser && (
                  <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-stone-200 bg-white p-2 text-sm font-normal shadow-xl">
                    {columns.filter((c) => c.optional).map((c) => (
                      <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-stone-50">
                        <input type="checkbox" checked={visible.has(c.key)} onChange={() => toggleCol(c.key)} className="accent-[var(--ork-violet)]" />{c.label}
                      </label>
                    ))}
                  </div>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {groups ? groups.map((g) => {
              const s = sums(g.rows);
              const closed = collapsed.has(g.key);
              return [
                <tr key={`g-${g.key}`} onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                  className="cursor-pointer border-b border-stone-200 bg-stone-50 font-semibold hover:bg-stone-100">
                  <td className="px-3 py-2 text-stone-500">{closed ? "▸" : "▾"}</td>
                  {(() => {
                    // La etiqueta del grupo ocupa todas las columnas antes del primer subtotal
                    const firstSum = Math.max(1, cols.findIndex((c) => c.sum));
                    const span = firstSum === -1 ? cols.length : firstSum;
                    return [
                      <td key="label" colSpan={span} className="truncate px-3 py-2">{g.label} <span className="font-normal text-stone-500">({g.rows.length})</span></td>,
                      ...cols.slice(span).map((c) => <td key={c.key} className={`truncate px-3 py-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>{c.sum ? fmtSum(s[c.key], moneyColumns.includes(c.key)) : ""}</td>),
                    ];
                  })()}
                  <td />
                </tr>,
                ...(closed ? [] : g.rows.map(renderRow)),
              ];
            }) : rows.map(renderRow)}
            {all.length === 0 && <tr><td colSpan={cols.length + 2} className="py-12 text-center text-stone-500">No hay registros con estos filtros.</td></tr>}
          </tbody>
          {all.length > 0 && cols.some((c) => c.sum) && (
            <tfoot>
              <tr className="border-t-2 border-stone-200 font-semibold">
                <td />
                {cols.map((c) => <td key={c.key} className={`px-3 py-2.5 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>{c.sum ? fmtSum(sums(all)[c.key], moneyColumns.includes(c.key)) : ""}</td>)}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
