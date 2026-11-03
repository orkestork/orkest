"use client";

export function PrintButton() {
  return <button onClick={() => window.print()} className="rounded-full bg-[#32125e] px-4 py-2 text-sm font-medium text-white print:hidden">Imprimir / guardar PDF</button>;
}
