"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { LookupItem } from "@/app/(app)/lookup-actions";

/**
 * Selector con autocompletar (como los campos relacionales de Odoo): busca en el servidor mientras escribes,
 * se maneja con teclado y, si se permite, ofrece «Crear "texto"». Envía el id en un input oculto `name`.
 */
export function RecordPicker({ name, initial, search, create, onChange, placeholder = "Escribe para buscar…", required, disabled, className = "", label }: {
  name?: string; initial?: LookupItem | null;
  search: (q: string) => Promise<LookupItem[]>;
  create?: (text: string) => Promise<LookupItem>;
  onChange?: (item: LookupItem | null) => void;
  placeholder?: string; required?: boolean; disabled?: boolean; className?: string; label?: string;
}) {
  const [value, setValue] = useState<LookupItem | null>(initial ?? null);
  const [text, setText] = useState(initial?.name ?? "");
  const [items, setItems] = useState<LookupItem[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const listId = useId();

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setText(value?.name ?? ""); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [value]);

  // Búsqueda con espera corta para no consultar en cada tecla
  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    const t = setTimeout(() => { search(text === value?.name ? "" : text).then((r) => { if (n === seq.current) { setItems(r); setHi(0); } }); }, 180);
    return () => clearTimeout(t);
  }, [text, open, search, value]);

  const pick = (it: LookupItem | null) => { setValue(it); setText(it?.name ?? ""); setOpen(false); onChange?.(it); };
  const canCreate = !!create && text.trim().length >= 2 && !items.some((i) => i.name.toLowerCase() === text.trim().toLowerCase()) && text !== value?.name;
  const options = items.length + (canCreate ? 1 : 0);
  const doCreate = () => start(async () => { if (create) pick(await create(text.trim())); });

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, options - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && open) { e.preventDefault(); if (hi < items.length) pick(items[hi]); else if (canCreate) doCreate(); }
    else if (e.key === "Escape") { setOpen(false); setText(value?.name ?? ""); }
  };

  return (
    <div ref={box} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value?.id ?? ""} />}
      <input
        value={text} disabled={disabled} placeholder={placeholder} aria-label={label} required={required && !value}
        role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        onFocus={(e) => { setOpen(true); e.target.select(); }}
        onChange={(e) => { setText(e.target.value); setOpen(true); if (!e.target.value) pick(null); }}
        onKeyDown={onKey}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 pr-8 text-sm outline-none focus:border-[var(--ork-violet)] disabled:bg-stone-100"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400" aria-hidden>{pending ? "…" : "▾"}</span>
      {open && !disabled && (
        <ul id={listId} role="listbox" className="absolute left-0 z-40 mt-1 max-h-72 w-full min-w-[20rem] overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 text-sm shadow-xl">
          {items.map((it, i) => (
            <li key={it.id} role="option" aria-selected={i === hi}>
              <button type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(it)} className={`block w-full px-3 py-1.5 text-left ${i === hi ? "bg-[var(--ork-lavender)]/25" : ""}`}>
                <span className="block truncate">{it.name}</span>{it.hint && <span className="block truncate text-xs text-stone-500">{it.hint}</span>}
              </button>
            </li>
          ))}
          {items.length === 0 && !canCreate && <li className="px-3 py-2 text-stone-500">Sin resultados</li>}
          {canCreate && (
            <li role="option" aria-selected={hi === items.length}>
              <button type="button" onMouseEnter={() => setHi(items.length)} onClick={doCreate} className={`block w-full border-t border-stone-100 px-3 py-1.5 text-left font-medium text-[var(--ork-violet)] ${hi === items.length ? "bg-[var(--ork-lavender)]/25" : ""}`}>
                Crear «{text.trim()}»
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
