"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { addNoteAction } from "@/app/(app)/entity-actions";
import { scheduleActivity } from "@/app/(app)/chatter-actions";

const field = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ork-violet)]";

export function ChatterComposer({ entityType, entityId, users, canWrite }: { entityType: string; entityId: string; users: { id: string; name: string }[]; canWrite: boolean }) {
  const [tab, setTab] = useState<"note" | "log" | "activity" | null>(null);
  const tabs: [typeof tab, string, string][] = [["note", "Comentar", "💬"], ["log", "Registrar contacto", "📞"], ["activity", "Programar seguimiento", "📅"]];
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tabs.filter(([k]) => canWrite || k === "activity").map(([k, l, ic]) => (
          <button key={k} type="button" onClick={() => setTab(tab === k ? null : k)} aria-pressed={tab === k}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm ${tab === k ? "border-[var(--ork-violet)] bg-[var(--ork-violet)]/10 font-medium text-[var(--ork-purple)]" : "border-[var(--ork-rule)] text-stone-700 hover:border-[var(--ork-violet)]/50"}`}>
            <span aria-hidden="true">{ic}</span>{l}
          </button>
        ))}
      </div>
      {(tab === "note" || tab === "log") && (
        <ActionForm action={addNoteAction} className="mt-3 space-y-2">
          <input type="hidden" name="entityType" value={entityType} /><input type="hidden" name="entityId" value={entityId} />
          {tab === "log" ? (
            <select name="type" className={field} aria-label="Tipo"><option value="CALL">Llamada</option><option value="MEETING">Reunión</option><option value="EMAIL">Correo enviado</option></select>
          ) : <input type="hidden" name="type" value="NOTE" />}
          <textarea name="content" rows={3} autoFocus placeholder={tab === "note" ? "Escribe un comentario interno (el cliente no lo ve)…" : "Resumen del contacto…"} className={field} />
          <SubmitButton className="rounded-full bg-[var(--ork-purple)] px-4 py-1.5 text-sm font-medium text-white">Guardar</SubmitButton>
        </ActionForm>
      )}
      {tab === "activity" && (
        <ActionForm action={scheduleActivity} className="mt-3 space-y-2">
          <input type="hidden" name="entityType" value={entityType} /><input type="hidden" name="entityId" value={entityId} />
          <select name="kind" className={field} aria-label="Tipo de actividad">{["Llamada", "Correo", "Reunión", "Seguimiento", "Pendiente"].map((k) => <option key={k}>{k}</option>)}</select>
          <input name="title" placeholder="¿Qué hay que hacer? p. ej. llamar para cerrar fecha" className={field} />
          <div className="grid grid-cols-2 gap-2">
            <input name="dueDate" type="date" className={field} aria-label="Vence" />
            <select name="assigneeId" className={field} aria-label="Asignado a">{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </div>
          <SubmitButton className="rounded-full bg-[var(--ork-purple)] px-4 py-1.5 text-sm font-medium text-white">Agendar</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
