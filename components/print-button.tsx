"use client";

/** Abre el diálogo del navegador para imprimir o guardar como PDF. */
export function PrintButton({ label = "Imprimir / guardar PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full bg-[var(--ork-purple)] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[var(--ork-violet)]">
      {label}
    </button>
  );
}
