import Link from "@/components/plink";
import type { ReactNode } from "react";

/** Cabecera de ficha estilo Odoo: Nuevo · ruta · botones inteligentes · paginador de registros. */
export type SmartButton = { label: string; value: ReactNode; href: string; icon?: string };

export function RecordTopBar({ listLabel, listHref, title, newHref, smart = [], pager }: {
  listLabel: string; listHref: string; title: string; newHref?: string; smart?: SmartButton[];
  pager?: { index: number; total: number; prevHref?: string; nextHref?: string };
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      {newHref && <Link href={newHref} className="rounded-lg border border-[var(--ork-purple)] px-3 py-1.5 text-sm font-medium text-[var(--ork-purple)] hover:bg-[var(--ork-purple)] hover:text-white">Nuevo</Link>}
      <div className="min-w-0 leading-tight">
        <Link href={listHref} className="block text-sm text-[var(--ork-violet)] hover:underline">{listLabel}</Link>
        <p className="truncate font-display text-xl uppercase tracking-tight">{title}</p>
      </div>
      {smart.length > 0 && (
        <div className="flex flex-wrap gap-2 lg:mx-auto">
          {smart.map((b) => (
            <Link key={b.label} href={b.href} className="flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-left hover:border-[var(--ork-violet)]">
              {b.icon && <span aria-hidden="true" className="text-lg text-[var(--ork-violet)]">{b.icon}</span>}
              <span className="leading-tight"><span className="block text-xs text-stone-600">{b.label}</span><span className="block text-sm font-semibold">{b.value}</span></span>
            </Link>
          ))}
        </div>
      )}
      {pager && (
        <div className="ml-auto flex items-center gap-1 text-sm text-stone-700">
          <span className="tabular-nums">{pager.index} / {pager.total}</span>
          {pager.prevHref ? <Link href={pager.prevHref} aria-label="Registro anterior" className="grid h-8 w-8 place-items-center rounded-md border border-stone-300 bg-white hover:border-[var(--ork-violet)]">‹</Link> : <span className="grid h-8 w-8 place-items-center rounded-md border border-stone-200 text-stone-300">‹</span>}
          {pager.nextHref ? <Link href={pager.nextHref} aria-label="Registro siguiente" className="grid h-8 w-8 place-items-center rounded-md border border-stone-300 bg-white hover:border-[var(--ork-violet)]">›</Link> : <span className="grid h-8 w-8 place-items-center rounded-md border border-stone-200 text-stone-300">›</span>}
        </div>
      )}
    </div>
  );
}

/** Barra de estados en flechas (estado actual resaltado). Los finales alternos solo se muestran si son el actual. */
export function StatusChevrons({ states, current }: { states: { key: string; label: string; isFinal: boolean }[]; current: string }) {
  const main = states.filter((s, i) => s.key === current || !s.isFinal || i === states.length - 1 || states.slice(i + 1).every((x) => x.isFinal) && !["rejected", "canceled", "lost"].includes(s.key));
  const visible = main.filter((s) => s.key === current || !["rejected", "canceled", "lost", "pending_approval", "to_approve"].includes(s.key));
  return (
    <ol className="flex overflow-hidden rounded-lg border border-stone-300 bg-white text-[13px]" aria-label="Estado">
      {visible.map((s, i) => {
        const active = s.key === current;
        return (
          <li key={s.key} aria-current={active ? "step" : undefined}
            className={`relative flex items-center whitespace-nowrap py-1.5 pl-5 pr-3 first:pl-3 ${active ? "bg-[var(--ork-purple)] font-semibold text-white" : "text-stone-600"}`}
            style={{ clipPath: i < visible.length - 1 ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)" : undefined, marginRight: i < visible.length - 1 ? -8 : 0, zIndex: visible.length - i }}>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}
