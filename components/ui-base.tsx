import type { ReactNode } from "react";

/** Piezas de UI sin dependencias de servidor (seguras en componentes cliente). Se re-exportan desde components/ui. */
export const btn = {
  primary: "inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--ork-violet)] disabled:opacity-50",
  secondary: "inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--ork-ink)]/25 bg-white px-4 py-2 text-sm font-medium text-[var(--ork-ink)] transition hover:border-[var(--ork-violet)] hover:text-[var(--ork-violet)] disabled:opacity-50",
  danger: "inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--ork-pink)]/30 bg-[var(--ork-pink)]/5 px-4 py-2 text-sm font-medium text-[var(--ork-pink)] hover:bg-[var(--ork-pink)]/10",
  ghost: "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100",
  small: "inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-[var(--ork-violet)] hover:text-[var(--ork-violet)]",
};

export const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20";

export function Field({ label, children, hint, error, className = "" }: { label: string; children: ReactNode; hint?: string; error?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

