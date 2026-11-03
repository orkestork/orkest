"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Field, input } from "@/components/ui-base";
import { INCAPACITY_TYPE, PERMIT_SUBTYPE, TIME_OFF_TYPE } from "@/lib/ui/hr-labels";
import { submitTimeOff } from "../actions";

/**
 * Solicitud de ausencia. Con `employeeId` la registra talento humano a nombre del colaborador;
 * sin él, la envía el colaborador desde su portal. `types` limita los tipos ofrecidos.
 */
export function TimeOffForm({ employeeId, employees, types = Object.keys(TIME_OFF_TYPE), defaultType }: {
  employeeId?: string; employees?: { id: string; name: string }[]; types?: string[]; defaultType?: string;
}) {
  const [type, setType] = useState(defaultType ?? types[0]);
  const [sub, setSub] = useState("CITA_MEDICA");
  const byHours = type === "PERMIT" && sub === "HORAS";
  return (
    <ActionForm action={submitTimeOff} className="space-y-3">
      {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
      {employees && (
        <Field label="Colaborador *">
          <select name="employeeId" required className={input} defaultValue="">
            <option value="" disabled>Selecciona…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
      )}
      {types.length > 1 ? (
        <Field label="Tipo">
          <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={input}>
            {types.map((t) => <option key={t} value={t}>{TIME_OFF_TYPE[t]}</option>)}
          </select>
        </Field>
      ) : <input type="hidden" name="type" value={type} />}
      {type === "PERMIT" && (
        <Field label="Tipo de permiso">
          <select name="subType" value={sub} onChange={(e) => setSub(e.target.value)} className={input}>
            {Object.entries(PERMIT_SUBTYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={byHours ? "Fecha *" : "Desde *"}><input type="date" name="startDate" required className={input} /></Field>
        {!byHours && <Field label="Hasta *"><input type="date" name="endDate" required className={input} /></Field>}
      </div>
      {byHours && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sale a las *"><input type="time" name="startTime" required className={input} /></Field>
          <Field label="Regresa a las *"><input type="time" name="endTime" required className={input} /></Field>
        </div>
      )}
      {type === "INCAPACITY" && (
        <>
          <Field label="Tipo de incapacidad">
            <select name="incapacityType" className={input}>{Object.entries(INCAPACITY_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="EPS"><input name="epsName" className={input} /></Field>
            <Field label="Fecha de expedición"><input type="date" name="issueDate" className={input} /></Field>
            <Field label="Médico tratante"><input name="treatingDoctor" className={input} /></Field>
            <Field label="Código diagnóstico (CIE-10)"><input name="diagnosisCode" className={input} /></Field>
          </div>
          <Field label="Diagnóstico"><input name="diagnosis" className={input} /></Field>
        </>
      )}
      <Field label={type === "INCAPACITY" ? "Observaciones" : "Motivo"}><textarea name="reason" rows={2} className={input} /></Field>
      <Field label={type === "INCAPACITY" ? `Soporte de la incapacidad${employeeId || employees ? "" : " *"}` : "Soporte (opcional)"} hint="PDF o imagen, máx. 8 MB">
        <input type="file" name="file" accept="application/pdf,image/*" required={type === "INCAPACITY" && !employeeId && !employees} className="text-sm" />
      </Field>
      <SubmitButton className={btn.primary} pendingText="Enviando…">{employeeId || employees ? "Registrar" : "Enviar solicitud"}</SubmitButton>
    </ActionForm>
  );
}
