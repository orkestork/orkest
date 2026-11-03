import Link from "@/components/plink";
import type { ReactNode } from "react";

/**
 * Encabezado de ficha Workezt: volver a la lista, documentos relacionados como chips,
 * navegación compacta entre registros y botón Crear a la derecha.
 */
export type SmartButton = { label: string; value: ReactNode; href: string; icon?: string };

export function RecordTopBar({ listLabel, listHref, title, newHref, smart = [], pager }: {
  listLabel: string; listHref: string; title: string; newHref?: string; smart?: SmartButton[];
  pager?: { index: number; total: number; prevHref?: string; nextHref?: string };
}) {
  const arrow = "grid h-7 w-7 place-items-center rounded-full";
  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={listHref} className="group inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-[var(--ork-purple)]">
          <span aria-hidden="true" className="transition group-hover:-translate-x-0.5">←</span>{listLabel}
        </Link>
        <span className="sr-only">{title}</span>
        <div className="ml-auto flex items-center gap-2">
          {pager && (
            <nav aria-label="Navegar entre registros" className="flex items-center gap-1 rounded-full border border-[var(--ork-rule)] bg-white px-1 py-0.5 text-xs text-stone-600">
              {pager.prevHref ? <Link href={pager.prevHref} aria-label="Registro anterior" className={`${arrow} hover:bg-[var(--ork-violet)]/10`}>‹</Link> : <span className={`${arrow} text-stone-300`}>‹</span>}
              <span className="px-1 tabular-nums">{pager.index} de {pager.total}</span>
              {pager.nextHref ? <Link href={pager.nextHref} aria-label="Registro siguiente" className={`${arrow} hover:bg-[var(--ork-violet)]/10`}>›</Link> : <span className={`${arrow} text-stone-300`}>›</span>}
            </nav>
          )}
          {newHref && <Link href={newHref} className="rounded-full bg-[var(--ork-purple)] px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[var(--ork-violet)]">+ Crear</Link>}
        </div>
      </div>
      {smart.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-stone-400">Relacionado</span>
          {smart.map((b) => (
            <Link key={b.label} href={b.href} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ork-violet)]/[0.07] px-3 py-1 text-[var(--ork-purple)] hover:bg-[var(--ork-violet)]/15">
              {b.icon && <span aria-hidden="true">{b.icon}</span>}
              <span className="text-stone-600">{b.label}</span><span className="font-semibold">{b.value}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Recorrido de estados: puntos unidos por una línea, con los pasos cumplidos rellenos.
 * Los finales alternos (rechazado, cancelado, perdido) solo aparecen si son el estado actual.
 */
export function StatusTrack({ states, current }: { states: { key: string; label: string; isFinal: boolean }[]; current: string }) {
  const main = states.filter((s, i) => s.key === current || !s.isFinal || i === states.length - 1 || states.slice(i + 1).every((x) => x.isFinal) && !["rejected", "canceled", "lost"].includes(s.key));
  const visible = main.filter((s) => s.key === current || !["rejected", "canceled", "lost", "pending_approval", "to_approve"].includes(s.key));
  const at = visible.findIndex((s) => s.key === current);
  return (
    <ol className="flex w-full items-start" aria-label="Estado">
      {visible.map((s, i) => {
        const done = i < at, active = i === at;
        return (
          <li key={s.key} aria-current={active ? "step" : undefined} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span aria-hidden="true" className={`absolute right-1/2 top-[7px] h-0.5 w-full ${i <= at ? "bg-[var(--ork-violet)]" : "bg-stone-200"}`} />}
            <span aria-hidden="true" className={`relative z-10 h-4 w-4 rounded-full border-2 ${active ? "border-[var(--ork-violet)] bg-white ring-4 ring-[var(--ork-violet)]/15" : done ? "border-[var(--ork-violet)] bg-[var(--ork-violet)]" : "border-stone-300 bg-white"}`} />
            <span className={`mt-1.5 px-1 text-[12px] leading-tight ${active ? "font-semibold text-[var(--ork-purple)]" : done ? "text-stone-700" : "text-stone-400"}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
