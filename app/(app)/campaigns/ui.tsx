"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Estilos y piezas cliente de la app Campañas (mismos tokens que components/ui, sin imports de servidor). */
export const cls = {
  primary: "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--ork-violet)] disabled:opacity-50",
  secondary: "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--ork-ink)]/25 bg-white px-4 py-2 text-sm font-medium text-[var(--ork-ink)] transition hover:border-[var(--ork-violet)] hover:text-[var(--ork-violet)] disabled:opacity-50",
  small: "inline-flex items-center justify-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-[var(--ork-violet)] hover:text-[var(--ork-violet)] disabled:opacity-40",
  input: "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20",
  label: "mb-1 block text-xs font-medium text-slate-600",
  card: "rounded-2xl border border-[var(--ork-rule)] bg-white/90 shadow-[0_1px_3px_rgba(17,16,15,.05)]",
  eyebrow: "text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500",
  th: "whitespace-nowrap px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500",
};

export const fmtMoney = (n: number, currency: string) =>
  (n || 0).toLocaleString("es-CO", { style: "currency", currency, maximumFractionDigits: 0 });
export const fmtUSD = (n: number, decimals = 0) =>
  `US$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

export function PageTitle({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">{eyebrow}</p>}
        <h1 className="font-display text-3xl uppercase leading-none tracking-tight text-[var(--ork-ink)] sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Línea de tendencia mínima (sin ejes) para tarjetas de KPI. */
export function Sparkline({ values, color, width = 84, height = 36 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return <div style={{ width, height }} />;
  const pad = 3;
  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (width - pad * 2) / (values.length - 1);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${(pad + (height - pad * 2) * (1 - (v - min) / range)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Modal portalizado. Sin cierre por fondo (protege borradores); Escape solo si `escape`. */
export function Modal({ onClose, children, className = "max-w-lg", escape = false }: { onClose: () => void; children: ReactNode; className?: string; escape?: boolean }) {
  useEffect(() => {
    if (!escape) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose, escape]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ork-ink)]/40 p-4">
      <div role="dialog" aria-modal="true" className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-[var(--ork-rule)] bg-[var(--ork-paper-light)] shadow-2xl ${className}`}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

type ConfirmOpts = { title: string; message: string; confirmLabel?: string; danger?: boolean };

/** Confirmación con diálogo propio (sin confirm() nativo). */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (v: boolean) => { state?.resolve(v); setState(null); };
  const dialog = state ? (
    <Modal onClose={() => done(false)} className="max-w-sm" escape>
      <div className="p-5">
        <h3 className="text-base font-semibold text-[var(--ork-ink)]">{state.title}</h3>
        <p className="mt-2 text-sm text-slate-600">{state.message}</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--ork-rule)] px-5 py-3">
        <button className={cls.secondary} onClick={() => done(false)}>Cancelar</button>
        <button autoFocus onClick={() => done(true)} className={state.danger ? "inline-flex items-center justify-center rounded-full bg-[var(--ork-pink)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" : cls.primary}>
          {state.confirmLabel ?? "Confirmar"}
        </button>
      </div>
    </Modal>
  ) : null;
  return { confirm, dialog };
}

/** Menú desplegable con cierre al hacer clic fuera. */
export function Popover({ button, buttonClassName, label, align = "right", children }: {
  button: ReactNode; buttonClassName?: string; label?: string; align?: "left" | "right"; children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} className={buttonClassName}>{button}</button>
      {open && (
        <div className={`absolute top-full z-40 mt-1 min-w-[190px] rounded-xl border border-slate-200 bg-white py-1 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Selector con varias opciones marcables (p. ej. estados); valor "all" o lista separada por comas. */
export function MultiSelect({ value, options, onChange, allLabel = "Todos" }: {
  value: string; options: { value: string; label: string; dot?: string }[]; onChange: (v: string) => void; allLabel?: string;
}) {
  const sel = value === "all" ? [] : value.split(",");
  const toggle = (v: string) => {
    const next = sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v];
    onChange(next.length ? next.join(",") : "all");
  };
  const text = sel.length === 0 ? allLabel : sel.length === 1 ? options.find((o) => o.value === sel[0])?.label ?? sel[0] : `${sel.length} estados`;
  return (
    <Popover align="left" button={<span className="flex w-full items-center justify-between gap-2"><span className="truncate">{text}</span><span className="text-xs text-slate-400">▾</span></span>}
      buttonClassName={`${cls.input} text-left`}>
      {() => (
        <div className="py-1">
          <button type="button" onClick={() => onChange("all")} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50">{allLabel}</button>
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={sel.includes(o.value)} onChange={() => toggle(o.value)} className="accent-[var(--ork-violet)]" />
              {o.dot && <span className="h-2 w-2 rounded-full" style={{ background: o.dot }} />}
              {o.label}
            </label>
          ))}
        </div>
      )}
    </Popover>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}
