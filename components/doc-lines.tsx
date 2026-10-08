"use client";

import { useMemo, useState } from "react";

/** Editor de líneas reutilizable (requisiciones, compras, pedidos, producción, transferencias). */
export type LineProduct = { id: string; sku: string; name: string; price: number; taxRate?: number };
type Line = { productId: string; description: string; quantity: number; unitPrice: number; taxRate: number };

const fmt = (v: number) => v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const cell = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

export function DocLines({ products, withPrice = true, withTax = true, freeText = true, name = "lines" }: {
  products: LineProduct[]; withPrice?: boolean; withTax?: boolean; freeText?: boolean; name?: string;
}) {
  const empty = { productId: "", description: "", quantity: 1, unitPrice: 0, taxRate: 19 };
  const [lines, setLines] = useState<Line[]>([empty]);
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0), [lines]);
  const tax = useMemo(() => lines.reduce((s, l) => s + (l.quantity * l.unitPrice * l.taxRate) / 100, 0), [lines]);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(lines.filter((l) => l.productId || l.description))} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-2">Producto</th>{freeText && <th className="pr-2">Descripción</th>}<th className="w-24 pr-2">Cantidad</th>
            {withPrice && <th className="w-36 pr-2">Precio unit.</th>}{withPrice && withTax && <th className="w-20 pr-2">IVA %</th>}
            {withPrice && <th className="w-32 text-right">Subtotal</th>}<th className="w-8" />
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <select className={cell} value={l.productId} onChange={(e) => {
                    const p = products.find((x) => x.id === e.target.value);
                    update(i, { productId: e.target.value, description: p?.name ?? l.description, unitPrice: p?.price ?? l.unitPrice, taxRate: p?.taxRate ?? l.taxRate });
                  }}>
                    <option value="">{freeText ? "Libre…" : "Selecciona…"}</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                  </select>
                </td>
                {freeText && <td className="pr-2"><input className={cell} value={l.description} onChange={(e) => update(i, { description: e.target.value })} /></td>}
                <td className="pr-2"><input className={cell} type="number" min="0" step="any" value={l.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} /></td>
                {withPrice && <td className="pr-2"><input className={cell} type="number" min="0" step="any" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: Number(e.target.value) })} /></td>}
                {withPrice && withTax && <td className="pr-2"><input className={cell} type="number" min="0" max="100" value={l.taxRate} onChange={(e) => update(i, { taxRate: Number(e.target.value) })} /></td>}
                {withPrice && <td className="text-right font-medium">{fmt(l.quantity * l.unitPrice)}</td>}
                <td className="text-right">{lines.length > 1 && <button type="button" aria-label="Quitar línea" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="px-2 text-slate-400 hover:text-[var(--ork-pink)]">×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setLines((ls) => [...ls, empty])} className="text-sm font-medium text-[var(--ork-violet)]">+ Agregar línea</button>
      {withPrice && (
        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{fmt(subtotal)}</span></div>
          {withTax && <div className="flex justify-between"><span className="text-slate-500">Impuestos</span><span>{fmt(tax)}</span></div>}
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold"><span>Total</span><span>{fmt(subtotal + (withTax ? tax : 0))}</span></div>
        </div>
      )}
    </div>
  );
}
