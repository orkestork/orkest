"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Modo de IVA de un documento: "taxed" (IVA de cada línea) o "exempt" (todo al 0 %).
 * El selector y el editor de líneas comparten el estado, aunque estén en partes distintas del formulario.
 */
const TaxModeCtx = createContext<{ exempt: boolean; setExempt: (v: boolean) => void } | null>(null);

export function TaxModeScope({ children, initialExempt = false }: { children: ReactNode; initialExempt?: boolean }) {
  const [exempt, setExempt] = useState(initialExempt);
  return <TaxModeCtx.Provider value={{ exempt, setExempt }}>{children}</TaxModeCtx.Provider>;
}

export const useTaxExempt = () => useContext(TaxModeCtx)?.exempt ?? false;

export function TaxModeToggle({ name = "taxMode" }: { name?: string }) {
  const ctx = useContext(TaxModeCtx);
  const exempt = ctx?.exempt ?? false;
  const opt = (value: boolean, label: string, hint: string) => (
    <button type="button" aria-pressed={exempt === value} onClick={() => ctx?.setExempt(value)}
      className={`flex-1 rounded-lg px-3 py-2 text-left text-sm transition ${exempt === value ? "bg-[var(--ork-purple)] text-white" : "text-stone-700 hover:bg-stone-100"}`}>
      <span className="block font-semibold">{label}</span><span className={`block text-xs ${exempt === value ? "text-white/80" : "text-stone-500"}`}>{hint}</span>
    </button>
  );
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-stone-600">IVA del pedido *</p>
      <input type="hidden" name={name} value={exempt ? "exempt" : "taxed"} />
      <div role="group" aria-label="IVA del pedido" className="flex max-w-md gap-1 rounded-xl border border-stone-300 bg-white p-1">
        {opt(false, "Con IVA", "Se suma el IVA de cada producto")}
        {opt(true, "Sin IVA", "Exento: todas las líneas al 0 %")}
      </div>
    </div>
  );
}
