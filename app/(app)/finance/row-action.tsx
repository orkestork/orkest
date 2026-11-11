"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/components/action-form";
import { btn } from "@/components/ui-base";

function Button({ label, tone }: { label: string; tone: "small" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={tone === "danger" ? "rounded-full px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50" : `${btn.small} disabled:opacity-50`}>
      {pending ? "…" : label}
    </button>
  );
}

/**
 * Botón de una sola acción dentro de una fila (eliminar, pausar, marcar pagado…).
 * A diferencia de ActionForm no muestra mensaje de éxito (el cambio de la fila ya lo dice) y
 * el error sale como texto corto, para no deformar la tabla.
 */
export function RowAction({ action, fields, label, tone = "small" }: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  label: string;
  tone?: "small" | "danger";
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="inline-flex flex-col items-end">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button label={label} tone={tone} />
      {state?.error && <span role="alert" className="mt-0.5 max-w-[14rem] text-right text-[11px] leading-tight text-rose-600">{state.error}</span>}
    </form>
  );
}
