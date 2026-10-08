"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { addNoteAction } from "@/app/(app)/entity-actions";
import { scheduleActivity } from "@/app/(app)/chatter-actions";

const field = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ork-violet)]";

export function ChatterComposer({ entityType, entityId, users, canWrite }: { entityType: string; entityId: string; users: { id: string; name: string }[]; canWrite: boolean }) {
  const [tab, setTab] = useState<"note" | "log" | "activity" | null>(null);
  const tabs: [typeof tab, string][] = [["note", "Registrar nota"], ["log", "Llamada / reunión"], ["activity", "Actividad"]];
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tabs.filter(([k]) => canWrite || k === "activity").map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(tab === k ? null : k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-[var(--ork-purple)] text-white" : k === "note" ? "bg-[var(--ork-purple)]/90 text-white hover:bg-[var(--ork-purple)]" : "bg-stone-200/70 text-stone-800 hover:bg-stone-200"}`}>
            {l}
          </button>
        ))}
      </div>
      {(tab === "note" || tab === "log") && (
        <ActionForm action={addNoteAction} className="mt-3 space-y-2">
          <input type="hidden" name="entityType" value={entityType} /><input type="hidden" name="entityId" value={entityId} />
          {tab === "log" ? (
            <select name="type" className={field} aria-label="Tipo"><option value="CALL">Llamada</option><option value="MEETING">Reunión</option><option value="EMAIL">Correo enviado</option></select>
          ) : <input type="hidden" name="type" value="NOTE" />}
          <textarea name="content" rows={3} autoFocus placeholder={tab === "note" ? "Nota interna (no se envía al cliente)…" : "¿Qué se habló?"} className={field} />
          <SubmitButton className="rounded-lg bg-[var(--ork-purple)] px-3 py-1.5 text-sm font-medium text-white">Registrar</SubmitButton>
        </ActionForm>
      )}
      {tab === "activity" && (
        <ActionForm action={scheduleActivity} className="mt-3 space-y-2">
          <input type="hidden" name="entityType" value={entityType} /><input type="hidden" name="entityId" value={entityId} />
          <select name="kind" className={field} aria-label="Tipo de actividad">{["Llamada", "Correo", "Reunión", "Seguimiento", "Por hacer"].map((k) => <option key={k}>{k}</option>)}</select>
          <input name="title" placeholder="Resumen, p. ej. Confirmar fecha de entrega" className={field} />
          <div className="grid grid-cols-2 gap-2">
            <input name="dueDate" type="date" className={field} aria-label="Vence" />
            <select name="assigneeId" className={field} aria-label="Asignado a">{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </div>
          <SubmitButton className="rounded-lg bg-[var(--ork-purple)] px-3 py-1.5 text-sm font-medium text-white">Programar</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
