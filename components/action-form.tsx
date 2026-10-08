"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionResult = { error?: string; errors?: Record<string, string>; ok?: string } | undefined;

/** Formulario con estado: muestra errores de validación devueltos por la server action. */
export function ActionForm({ action, children, className }: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {state?.error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
          {state.errors && (
            <ul className="mt-1 list-inside list-disc text-xs">
              {Object.entries(state.errors).map(([k, v]) => <li key={k}>{v}</li>)}
            </ul>
          )}
        </div>
      )}
      {state?.ok && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</div>}
      {children}
    </form>
  );
}

export function SubmitButton({ children, className, pendingText = "Guardando…" }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}
