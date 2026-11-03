"use client";

import { btn } from "@/components/ui-base";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className={btn.secondary}>Imprimir / guardar PDF</button>;
}
