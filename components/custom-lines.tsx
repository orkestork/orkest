"use client";

import { useState } from "react";

type Def = { key: string; label: string; type: string; options: unknown; required: boolean };
type Choice = { id: string; name: string };
const cell = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

/** Editor de líneas de un objeto personalizado: columnas = campos de línea definidos en Studio. */
export function CustomLines({ defs, relations }: { defs: Def[]; relations: Record<string, Choice[]> }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([{}]);
  const set = (i: number, k: string, v: unknown) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const control = (d: Def, i: number) => {
    const v = rows[i][d.key];
    const target = (d.options as { entityType?: string } | null)?.entityType;
    if (d.type === "relation" && target) return <select className={cell} value={String(v ?? "")} onChange={(e) => set(i, d.key, e.target.value)}><option value="">—</option>{(relations[target] ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>;
    if (d.type === "select") return <select className={cell} value={String(v ?? "")} onChange={(e) => set(i, d.key, e.target.value)}><option value="">—</option>{((d.options as { value: string; label: string }[]) ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    if (d.type === "boolean") return <input type="checkbox" checked={!!v} onChange={(e) => set(i, d.key, e.target.checked)} />;
    const type = ["number", "currency"].includes(d.type) ? "number" : d.type === "date" ? "date" : "text";
    return <input className={cell} type={type} step="any" value={String(v ?? "")} onChange={(e) => set(i, d.key, e.target.value)} />;
  };
  if (!defs.length) return <p className="text-sm text-slate-400">Define los campos de línea en Studio → Campos.</p>;
  return (
    <div className="space-y-2">
      <input type="hidden" name="lines" value={JSON.stringify(rows.filter((r) => Object.values(r).some((v) => v !== "" && v !== undefined && v !== false)))} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">{defs.map((d) => <th key={d.key} className="py-2 pr-2">{d.label}{d.required ? " *" : ""}</th>)}<th className="w-8" /></tr></thead>
          <tbody>{rows.map((_, i) => (
            <tr key={i}>{defs.map((d) => <td key={d.key} className="py-1 pr-2">{control(d, i)}</td>)}
              <td>{rows.length > 1 && <button type="button" aria-label="Quitar línea" onClick={() => setRows((rs) => rs.filter((__, j) => j !== i))} className="px-2 text-slate-400 hover:text-[var(--ork-pink)]">×</button>}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <button type="button" onClick={() => setRows((rs) => [...rs, {}])} className="text-sm font-medium text-[var(--ork-violet)]">+ Agregar línea</button>
    </div>
  );
}
