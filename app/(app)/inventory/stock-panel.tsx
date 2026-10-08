"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { adjustAction, quickTransferAction, saveWarehouse } from "./actions";

type P = { id: string; sku: string; name: string; unit: string };
type W = { id: string; code: string; name: string; locationId: string };
const field = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ork-violet)]";
const label = "mb-1 block text-xs font-medium text-stone-700";

/** Panel lateral de Existencias: trasladar entre bodegas, ajustar y crear almacén. */
export function StockPanel({ products, warehouses, qty, defaultProductId, limit, canCreate }: {
  products: P[]; warehouses: W[]; qty: Record<string, Record<string, number>>; defaultProductId?: string; limit: number; canCreate: boolean;
}) {
  const [tab, setTab] = useState<"move" | "adjust" | "new">("move");
  const [productId, setProductId] = useState(defaultProductId ?? products[0]?.id ?? "");
  const withStock = warehouses.filter((w) => (qty[productId]?.[w.id] ?? 0) > 0);
  const [fromId, setFromId] = useState(withStock[0]?.id ?? warehouses[0]?.id ?? "");
  const [toId, setToId] = useState(warehouses.find((w) => w.id !== (withStock[0]?.id ?? warehouses[0]?.id))?.id ?? "");
  const [adjWh, setAdjWh] = useState(warehouses[0]?.id ?? "");
  const p = products.find((x) => x.id === productId);
  const avail = qty[productId]?.[fromId] ?? 0;

  const pickProduct = (id: string) => {
    setProductId(id);
    const first = warehouses.find((w) => (qty[id]?.[w.id] ?? 0) > 0);
    if (first) { setFromId(first.id); if (toId === first.id) setToId(warehouses.find((w) => w.id !== first.id)?.id ?? ""); }
  };

  return (
    <section className="rounded-2xl border border-[var(--ork-rule)] bg-white">
      <div role="tablist" className="grid grid-cols-3 border-b border-stone-200 text-sm">
        {([["move", "Trasladar"], ["adjust", "Ajustar"], ["new", "Nuevo almacén"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-2 py-3 font-medium ${tab === k ? "border-b-2 border-[var(--ork-purple)] text-[var(--ork-purple)]" : "text-stone-600 hover:text-stone-900"}`}>{l}</button>
        ))}
      </div>
      <div className="p-4">
        {tab !== "new" && (
          <label className="mb-3 block"><span className={label}>Producto</span>
            <select value={productId} onChange={(e) => pickProduct(e.target.value)} className={field}>{products.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}</select>
          </label>
        )}

        {tab === "move" && (
          <div className="space-y-3">
            {/* Los selectores van fuera del <form> para que no se reinicien al completar la acción */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <label><span className={label}>Desde</span>
                <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={field}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} ({qty[productId]?.[w.id] ?? 0})</option>)}</select>
              </label>
              <button type="button" aria-label="Intercambiar origen y destino" onClick={() => { setFromId(toId); setToId(fromId); }} className="mb-1 grid h-9 w-9 place-items-center rounded-full border border-stone-300 hover:border-[var(--ork-violet)]">⇄</button>
              <label><span className={label}>Hacia</span>
                <select value={toId} onChange={(e) => setToId(e.target.value)} className={field}>{warehouses.map((w) => <option key={w.id} value={w.id} disabled={w.id === fromId}>{w.code} ({qty[productId]?.[w.id] ?? 0})</option>)}</select>
              </label>
            </div>
            <ActionForm action={quickTransferAction} className="space-y-3">
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="fromWarehouseId" value={fromId} />
              <input type="hidden" name="toWarehouseId" value={toId} />
              <label className="block"><span className={label}>Cantidad <span className="font-normal text-stone-500">· disponible en origen: {avail.toLocaleString("es-CO")} {p?.unit}</span></span>
                <input name="quantity" type="number" step="any" min="0" required className={field} />
              </label>
              <label className="block"><span className={label}>Nota (opcional)</span><input name="note" className={field} placeholder="Traslado para producción" /></label>
              <fieldset className="space-y-1 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="validate" value="yes" defaultChecked className="accent-[var(--ork-violet)]" /> Mover ahora</label>
                <label className="flex items-center gap-2"><input type="radio" name="validate" value="no" className="accent-[var(--ork-violet)]" /> Dejar pendiente (la valida bodega)</label>
              </fieldset>
              <SubmitButton className="w-full rounded-lg bg-[var(--ork-purple)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ork-violet)]" pendingText="Trasladando…">Trasladar</SubmitButton>
            </ActionForm>
          </div>
        )}

        {tab === "adjust" && (
          <div className="space-y-3">
          <label className="block"><span className={label}>Almacén</span>
            <select value={adjWh} onChange={(e) => setAdjWh(e.target.value)} className={field}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name} ({qty[productId]?.[w.id] ?? 0})</option>)}</select>
          </label>
          <ActionForm action={adjustAction} className="space-y-3">
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="locationId" value={warehouses.find((w) => w.id === adjWh)?.locationId ?? ""} />
            <label className="block"><span className={label}>Existencia contada</span><input name="quantity" type="number" step="any" min="0" required className={field} /></label>
            <label className="block"><span className={label}>Motivo</span><input name="reason" className={field} placeholder="Conteo cíclico" /></label>
            <SubmitButton className="w-full rounded-lg bg-[var(--ork-purple)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ork-violet)]">Aplicar ajuste</SubmitButton>
          </ActionForm>
          </div>
        )}

        {tab === "new" && (
          <div>
            <p className="mb-3 text-sm text-stone-600">Tienes <b>{warehouses.length}</b> de <b>{limit}</b> almacenes activos.</p>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-[var(--ork-violet)]" style={{ width: `${(warehouses.length / limit) * 100}%` }} /></div>
            {canCreate && warehouses.length < limit ? (
              <ActionForm action={saveWarehouse} className="space-y-3">
                <label className="block"><span className={label}>Nombre *</span><input name="name" required className={field} placeholder="Bodega Barranquilla" /></label>
                <label className="block"><span className={label}>Código * <span className="font-normal text-stone-500">· máx. 6 letras o números</span></span><input name="code" required maxLength={6} className={`${field} uppercase`} placeholder="BAQ" /></label>
                <SubmitButton className="w-full rounded-lg bg-[var(--ork-purple)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ork-violet)]">Crear almacén</SubmitButton>
              </ActionForm>
            ) : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Llegaste al máximo. Archiva un almacén vacío en «Almacenes» para crear otro.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
