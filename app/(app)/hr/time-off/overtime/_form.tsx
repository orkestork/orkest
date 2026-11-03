import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Field, input } from "@/components/ui";
import { OVERTIME_TYPE, opts } from "@/lib/ui/hr-labels";
import { submitOvertime } from "../../actions";
import { Select } from "../../_ui";

/** Reporte de horas extras (portal) o registro de talento humano (con lista de colaboradores). */
export function OvertimeForm({ employees }: { employees?: { id: string; name: string }[] }) {
  return (
    <ActionForm action={submitOvertime} className="space-y-3">
      {employees && <Field label="Colaborador *"><Select name="employeeId" required empty="Selecciona…" options={employees.map((e) => ({ value: e.id, label: e.name }))} /></Field>}
      <Field label="Fecha trabajada *"><input type="date" name="date" required className={input} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde *"><input type="time" name="startTime" required className={input} /></Field>
        <Field label="Hasta *"><input type="time" name="endTime" required className={input} /></Field>
      </div>
      <Field label="Tipo *"><Select name="overtimeType" options={opts(OVERTIME_TYPE)} /></Field>
      <Field label="Motivo / actividad"><textarea name="reason" rows={2} className={input} /></Field>
      <SubmitButton className={btn.primary}>{employees ? "Registrar" : "Reportar horas"}</SubmitButton>
    </ActionForm>
  );
}
