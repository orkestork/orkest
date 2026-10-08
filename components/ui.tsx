import Link from "@/components/plink";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions, crumbs }: {
  title: string; subtitle?: ReactNode; actions?: ReactNode; crumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs && (
          <nav className="mb-2 flex flex-wrap gap-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {crumbs.map((c, i) => (
              <span key={i} className="flex gap-1">
                {c.href ? <Link href={c.href} className="hover:text-slate-900">{c.label}</Link> : c.label}
                {i < crumbs.length - 1 && <span>/</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="font-display text-3xl uppercase leading-none tracking-tight text-[var(--ork-ink)] sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "", padded = true }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section className={`rounded-2xl border border-[var(--ork-rule)] bg-white/90 shadow-[0_1px_3px_rgba(17,16,15,.05)] ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">{title}</h2>
          {actions}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-200",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone] ?? TONES.slate}`}>{children}</span>;
}

export const SEVERITY_TONE: Record<string, string> = { LOW: "slate", MEDIUM: "amber", HIGH: "rose", CRITICAL: "rose" };
export const SEVERITY_LABEL: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Crítica" };

export const btn = {
  primary: "inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--ork-violet)] disabled:opacity-50",
  secondary: "inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--ork-ink)]/25 bg-white px-4 py-2 text-sm font-medium text-[var(--ork-ink)] transition hover:border-[var(--ork-violet)] hover:text-[var(--ork-violet)] disabled:opacity-50",
  danger: "inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--ork-pink)]/30 bg-[var(--ork-pink)]/5 px-4 py-2 text-sm font-medium text-[var(--ork-pink)] hover:bg-[var(--ork-pink)]/10",
  ghost: "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100",
  small: "inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-[var(--ork-violet)] hover:text-[var(--ork-violet)]",
};

export const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20";

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2.5 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-10 text-center text-sm text-slate-400">Sin registros todavía.</p>}
    </div>
  );
}

export const td = "px-4 py-2.5 align-top";

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <div className="rounded-2xl border border-[var(--ork-rule)] bg-white/90 p-4 transition hover:border-[var(--ork-violet)]/40">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold leading-none tracking-tight tabular-nums text-[var(--ork-ink)]">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}
