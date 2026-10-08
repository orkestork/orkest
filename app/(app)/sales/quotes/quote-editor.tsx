"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ActionForm, SubmitButton, type ActionResult } from "@/components/action-form";
import { RecordPicker } from "@/components/record-picker";
import { lookupCustomers, quickCreateCustomer } from "@/app/(app)/lookup-actions";

type Product = { id: string; sku: string; name: string; price: number; cost: number; taxRate: number; unit: string };
type Opt = { id: string; name: string };
export type EditorLine = { kind: "PRODUCT" | "SECTION" | "NOTE"; productId: string; description: string; quantity: number; unitPrice: number; discountPct: number; taxRate: number };
export type EditorInitial = { id?: string; customerId: string; validUntil: string; paymentTermId: string; pricelistId: string; terms: string; notes: string; lines: EditorLine[] };

const fmt = (v: number) => v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const cell = "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-stone-200 focus:border-[var(--ork-violet)] focus:bg-white";
const field = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ork-violet)]";

/** Ficha editable de cotización (estilo Odoo): encabezado, líneas con secciones/notas, términos y totales. */
export function QuoteEditor({ action, initial, products, customer, terms, pricelists, readOnlyHeader, canCreateCustomer, extra }: {
  action: (p: ActionResult, f: FormData) => Promise<ActionResult>; initial: EditorInitial;
  products: Product[]; customer: Opt | null; terms: Opt[]; pricelists: Opt[]; readOnlyHeader?: boolean; canCreateCustomer?: boolean;
  /** Campos adicionales (p. ej. campos de Studio) dentro del mismo formulario */
  extra?: ReactNode;
}) {
  const [head, setHead] = useState({ customerId: initial.customerId, validUntil: initial.validUntil, paymentTermId: initial.paymentTermId, pricelistId: initial.pricelistId, terms: initial.terms, notes: initial.notes });
  const [lines, setLines] = useState<EditorLine[]>(initial.lines.length ? initial.lines : []);
  const [dirty, setDirty] = useState(!initial.id);
  const pm = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const touch = () => setDirty(true);
  const setLine = (i: number, patch: Partial<EditorLine>) => { setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); touch(); };
  const add = (kind: EditorLine["kind"]) => { setLines((ls) => [...ls, { kind, productId: "", description: kind === "SECTION" ? "Nueva sección" : kind === "NOTE" ? "" : "", quantity: 1, unitPrice: 0, discountPct: 0, taxRate: 19 }]); touch(); };
  const move = (i: number, d: -1 | 1) => { setLines((ls) => { const n = [...ls]; const j = i + d; if (j < 0 || j >= n.length) return ls; [n[i], n[j]] = [n[j], n[i]]; return n; }); touch(); };

  const sub = (l: EditorLine) => (l.kind === "PRODUCT" ? l.quantity * l.unitPrice * (1 - l.discountPct / 100) : 0);
  const subtotal = lines.reduce((s, l) => s + sub(l), 0);
  const tax = lines.reduce((s, l) => s + (sub(l) * l.taxRate) / 100, 0);
  const cost = lines.reduce((s, l) => s + (l.kind === "PRODUCT" ? l.quantity * (pm.get(l.productId)?.cost ?? 0) : 0), 0);
  const margin = subtotal - cost;

  return (
    <ActionForm action={action} className="space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {Object.entries(head).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="lines" value={JSON.stringify(lines.map((l) => ({ ...l, productId: l.productId || null })))} />

      <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
        <label className="grid grid-cols-[120px_1fr] items-center gap-3 text-sm"><span className="font-semibold text-stone-800">Cliente</span>
          <RecordPicker label="Cliente" initial={customer} disabled={readOnlyHeader} required search={lookupCustomers} create={canCreateCustomer ? quickCreateCustomer : undefined}
            placeholder="Busca por nombre, NIT o teléfono…" onChange={(c) => { setHead({ ...head, customerId: c?.id ?? "" }); touch(); }} /></label>
        <label className="grid grid-cols-[120px_1fr] items-center gap-3 text-sm"><span className="font-semibold text-stone-800">Vencimiento</span>
          <input type="date" value={head.validUntil} onChange={(e) => { setHead({ ...head, validUntil: e.target.value }); touch(); }} className={field} /></label>
        <label className="grid grid-cols-[120px_1fr] items-center gap-3 text-sm"><span className="font-semibold text-stone-800">Lista de precios</span>
          <select value={head.pricelistId} onChange={(e) => { setHead({ ...head, pricelistId: e.target.value }); touch(); }} className={field}><option value="">La del cliente</option>{pricelists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="grid grid-cols-[120px_1fr] items-center gap-3 text-sm"><span className="font-semibold text-stone-800">Plazo de pago</span>
          <select value={head.paymentTermId} onChange={(e) => { setHead({ ...head, paymentTermId: e.target.value }); touch(); }} className={field}><option value="">El del cliente</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      </div>

      {extra && <div onChange={touch} className="rounded-xl border border-[var(--ork-rule)] bg-[var(--ork-paper-light)] p-4">{extra}</div>}

      <div className="overflow-x-auto rounded-xl border border-stone-200">
        <table className="w-full min-w-[860px] table-fixed text-sm">
          <colgroup><col className="w-12" /><col /><col className="w-24" /><col className="w-32" /><col className="w-20" /><col className="w-20" /><col className="w-36" /><col className="w-9" /></colgroup>
          <thead className="bg-stone-50 text-left text-[13px] font-semibold text-stone-800">
            <tr><th /><th className="px-2 py-2">Producto</th><th className="px-2 py-2 text-right">Cantidad</th><th className="px-2 py-2 text-right">Precio unit.</th><th className="px-2 py-2 text-right">Desc. %</th><th className="px-2 py-2 text-right">IVA %</th><th className="px-2 py-2 text-right">Subtotal</th><th /></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className={`border-t border-stone-100 ${l.kind === "SECTION" ? "bg-stone-100 font-semibold" : ""}`}>
                <td className="px-1 text-center text-stone-400">
                  <button type="button" aria-label="Subir línea" onClick={() => move(i, -1)} className="px-0.5 hover:text-stone-800">▴</button>
                  <button type="button" aria-label="Bajar línea" onClick={() => move(i, 1)} className="px-0.5 hover:text-stone-800">▾</button>
                </td>
                {l.kind === "PRODUCT" ? (
                  <>
                    <td className="px-1 py-1">
                      <select value={l.productId} onChange={(e) => { const p = pm.get(e.target.value); setLine(i, { productId: e.target.value, description: p?.name ?? l.description, unitPrice: p?.price ?? l.unitPrice, taxRate: p?.taxRate ?? l.taxRate }); }} className={`${cell} font-medium text-[var(--ork-purple)]`} aria-label="Producto">
                        <option value="">Producto libre…</option>{products.map((p) => <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>)}
                      </select>
                      {(!l.productId || l.description !== pm.get(l.productId)?.name) && <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Descripción" className={`${cell} text-stone-600`} aria-label="Descripción" />}
                    </td>
                    <td className="px-1"><input type="number" step="any" min="0" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className={`${cell} text-right`} aria-label="Cantidad" /></td>
                    <td className="px-1"><input type="number" step="any" min="0" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} className={`${cell} text-right`} aria-label="Precio unitario" /></td>
                    <td className="px-1"><input type="number" step="any" min="0" max="100" value={l.discountPct} onChange={(e) => setLine(i, { discountPct: Number(e.target.value) })} className={`${cell} text-right`} aria-label="Descuento" /></td>
                    <td className="px-1"><input type="number" step="any" min="0" max="100" value={l.taxRate} onChange={(e) => setLine(i, { taxRate: Number(e.target.value) })} className={`${cell} text-right`} aria-label="IVA" /></td>
                    <td className="px-2 text-right font-medium tabular-nums">{fmt(sub(l))}</td>
                  </>
                ) : (
                  <td colSpan={6} className="px-1 py-1"><input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder={l.kind === "NOTE" ? "Nota para el cliente…" : "Título de la sección"} className={`${cell} ${l.kind === "NOTE" ? "italic text-stone-700" : "font-semibold"}`} aria-label={l.kind === "NOTE" ? "Nota" : "Sección"} /></td>
                )}
                <td className="text-center"><button type="button" aria-label="Eliminar línea" onClick={() => { setLines((ls) => ls.filter((_, j) => j !== i)); touch(); }} className="px-1 text-stone-400 hover:text-rose-700">🗑</button></td>
              </tr>
            ))}
            <tr className="border-t border-stone-100">
              <td />
              <td colSpan={7} className="space-x-5 px-2 py-2.5 text-sm font-medium text-[var(--ork-violet)]">
                <button type="button" onClick={() => add("PRODUCT")} className="hover:underline">Agregar un producto</button>
                <button type="button" onClick={() => add("SECTION")} className="hover:underline">Agregar una sección</button>
                <button type="button" onClick={() => add("NOTE")} className="hover:underline">Agregar una nota</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <textarea value={head.terms} onChange={(e) => { setHead({ ...head, terms: e.target.value }); touch(); }} rows={4} placeholder="Términos y condiciones…" className={`${field} resize-y`} aria-label="Términos y condiciones" />
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-stone-600">Subtotal</dt><dd className="tabular-nums">{fmt(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-stone-600">Impuestos</dt><dd className="tabular-nums">{fmt(tax)}</dd></div>
          <div className="flex items-baseline justify-between border-t border-stone-200 pt-2"><dt className="font-semibold">Total</dt><dd className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--ork-ink)]">{fmt(subtotal + tax)}</dd></div>
          <div className="flex justify-between pt-2 text-stone-600"><dt>Margen</dt><dd className={`tabular-nums ${margin < 0 ? "font-semibold text-rose-700" : ""}`}>{fmt(margin)} ({subtotal ? Math.round((margin / subtotal) * 100) : 0} %)</dd></div>
        </dl>
      </div>

      {dirty && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-[var(--ork-violet)]/40 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <p className="text-sm text-stone-700">{initial.id ? "Tienes cambios sin guardar." : "Completa la cotización y guárdala."}</p>
          <div className="flex gap-2">
            {initial.id && <button type="button" onClick={() => location.reload()} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm">Descartar</button>}
            <SubmitButton className="rounded-lg bg-[var(--ork-purple)] px-4 py-1.5 text-sm font-medium text-white" pendingText="Guardando…">Guardar</SubmitButton>
          </div>
        </div>
      )}
    </ActionForm>
  );
}
