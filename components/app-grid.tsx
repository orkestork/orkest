"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { FAMILIES, type Family } from "@/components/app-icons";

/** Orden de las familias al agrupar por color. */
const FAMILY_ORDER: Family[] = ["intel", "commercial", "admin", "industry", "org"];
type Mode = "default" | "color";
const MODE_KEY = "wz.launcher.order";
const POS_KEY = "wz.launcher.positions";

/*
 * Preferencias del lanzador por navegador (modo y orden propio).
 * `memory` cubre el caso sin localStorage (modo privado, bloqueado): dura mientras la pestaña esté abierta.
 */
const memory: { mode?: Mode; positions?: string | null } = {};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function readMode(): Mode {
  if (memory.mode) return memory.mode;
  try {
    return localStorage.getItem(MODE_KEY) === "color" ? "color" : "default";
  } catch {
    return "default";
  }
}
function setMode(m: Mode) {
  memory.mode = m;
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {}
  notify();
}
/** Texto crudo (estable entre lecturas) para useSyncExternalStore. */
function readPositionsRaw(): string {
  if (memory.positions !== undefined) return memory.positions ?? "";
  try {
    return localStorage.getItem(POS_KEY) ?? "";
  } catch {
    return "";
  }
}
function setPositions(keys: string[] | null) {
  memory.positions = keys ? JSON.stringify(keys) : null;
  try {
    if (keys) localStorage.setItem(POS_KEY, memory.positions!);
    else localStorage.removeItem(POS_KEY);
  } catch {}
  notify();
}
function parse(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export type GridItem = { key: string; family: Family; tile: ReactNode };

/** Aplica el orden guardado; las apps nuevas (no guardadas) van al final en su orden por defecto. */
function applyOrder(items: GridItem[], saved: string[]) {
  const pos = new Map(saved.map((k, i) => [k, i]));
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (pos.get(a.it.key) ?? saved.length + a.i) - (pos.get(b.it.key) ?? saved.length + b.i))
    .map(({ it }) => it);
}

const pill = (active: boolean) =>
  `rounded-full px-3.5 py-1 font-medium transition ${active ? "bg-[var(--ork-ink)] text-white" : "text-stone-600 hover:text-[var(--ork-ink)]"}`;
const arrow =
  "grid h-7 w-7 place-items-center rounded-full border border-stone-300 bg-white text-base leading-none text-stone-700 shadow-sm hover:border-[var(--ork-violet)] hover:text-[var(--ork-violet)] disabled:opacity-30";

/** Cuadrícula del lanzador: orden propio (editable arrastrando) o agrupado por color. */
export function AppGrid({ items }: { items: GridItem[] }) {
  const mode = useSyncExternalStore(subscribe, readMode, () => "default" as Mode);
  const raw = useSyncExternalStore(subscribe, readPositionsRaw, () => "");
  const ordered = applyOrder(items, parse(raw));

  const [editing, setEditing] = useState(false);
  /** Arrastre en curso: app, punto de inicio y desplazamiento actual del puntero. */
  const [drag, setDrag] = useState<{ key: string; x0: number; y0: number; dx: number; dy: number } | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const keys = ordered.map((i) => i.key);
  const move = (key: string, to: number) => {
    const from = keys.indexOf(key);
    if (from < 0 || to < 0 || to >= keys.length || from === to) return;
    const next = [...keys];
    next.splice(from, 1);
    next.splice(to, 0, key);
    setPositions(next);
  };

  /** App bajo el puntero, ignorando la que se está arrastrando. */
  const keyAt = (x: number, y: number, skip: string) => {
    for (const el of document.elementsFromPoint(x, y)) {
      const k = (el.closest("[data-app-key]") as HTMLElement | null)?.dataset.appKey;
      if (k && k !== skip) return k;
    }
    return null;
  };

  const editTile = (it: GridItem, idx: number) => {
    const dragging = drag?.key === it.key;
    return (
      <div
        key={it.key}
        data-app-key={it.key}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ key: it.key, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
        }}
        onPointerMove={(e) => {
          if (!dragging || !drag) return;
          setDrag({ ...drag, dx: e.clientX - drag.x0, dy: e.clientY - drag.y0 });
          setOverKey(keyAt(e.clientX, e.clientY, it.key));
        }}
        onPointerUp={() => {
          if (dragging && overKey) move(it.key, keys.indexOf(overKey));
          setDrag(null);
          setOverKey(null);
        }}
        onPointerCancel={() => {
          setDrag(null);
          setOverKey(null);
        }}
        style={dragging ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.08)`, zIndex: 20 } : undefined}
        className={`relative touch-none select-none rounded-3xl pb-1 ${dragging ? "cursor-grabbing opacity-90 drop-shadow-xl" : "wz-wiggle cursor-grab"} ${
          overKey === it.key ? "bg-[var(--ork-violet)]/10 outline-2 outline-dashed outline-offset-4 outline-[var(--ork-violet)]" : ""
        }`}
      >
        {/* En edición el ícono no navega */}
        <div className="pointer-events-none">{it.tile}</div>
        {/* Flechas para mover sin arrastrar (teclado y precisión) */}
        <div className="mt-1.5 flex justify-center gap-1.5">
          <button type="button" aria-label={`Mover antes`} disabled={idx === 0} onClick={() => move(it.key, idx - 1)} className={arrow}>‹</button>
          <button type="button" aria-label={`Mover después`} disabled={idx === ordered.length - 1} onClick={() => move(it.key, idx + 1)} className={arrow}>›</button>
        </div>
      </div>
    );
  };

  const grid = (list: GridItem[]) => (
    <div className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 md:grid-cols-6">
      {list.map((i, idx) => (editing ? editTile(i, idx) : <div key={i.key}>{i.tile}</div>))}
    </div>
  );

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-[var(--ork-ink)] sm:text-3xl">Aplicaciones</h2>
        {editing ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-stone-500 sm:inline">Arrastra los íconos para ordenarlos</span>
            <button type="button" onClick={() => setPositions(null)} className="rounded-full border border-[var(--ork-rule)] bg-white px-3.5 py-1 font-medium text-stone-600 hover:text-[var(--ork-ink)]">
              Restablecer
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-full bg-[var(--ork-violet)] px-4 py-1 font-medium text-white">
              Listo
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Ordenar aplicaciones" className="flex rounded-full border border-[var(--ork-rule)] bg-white p-0.5 text-sm">
              <button type="button" role="radio" aria-checked={mode === "default"} onClick={() => setMode("default")} className={pill(mode === "default")}>Mi orden</button>
              <button type="button" role="radio" aria-checked={mode === "color"} onClick={() => setMode("color")} className={pill(mode === "color")}>Por color</button>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode("default");
                setEditing(true);
              }}
              className="rounded-full border border-[var(--ork-rule)] bg-white px-3.5 py-1 text-sm font-medium text-stone-600 hover:text-[var(--ork-ink)]"
            >
              Editar
            </button>
          </div>
        )}
      </div>

      <div className="mx-auto mt-6 max-w-[1000px]">
        {mode === "default" || editing
          ? grid(ordered)
          : FAMILY_ORDER.map((f) => {
              const list = ordered.filter((i) => i.family === f);
              if (!list.length) return null;
              return (
                <section key={f} className="mb-10">
                  <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold text-stone-700">
                    <span className="h-3 w-3 rounded-full" style={{ background: `linear-gradient(135deg, ${FAMILIES[f].light}, ${FAMILIES[f].dark})` }} />
                    {FAMILIES[f].name}
                    <span className="font-normal text-stone-400">· {list.length}</span>
                  </h3>
                  {grid(list)}
                </section>
              );
            })}
      </div>
    </>
  );
}
