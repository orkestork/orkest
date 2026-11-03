import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Field, input } from "@/components/ui";
import { CONTRACT_TYPE, EMPLOYEE_STATUS, SALARY_PERIOD, opts, optsT } from "@/lib/ui/hr-labels";
import { saveEmployee } from "../actions";
import { isoDay, Select } from "../_ui";

type Emp = {
  id: string; name: string; email: string | null; documentNumber: string | null; phone: string | null; position: string | null; departmentId: string | null;
  managerId: string | null; contractType: string; status: string; site: string | null; hireDate: Date | null; terminationDate: Date | null;
  salaryAmount: unknown; salaryPeriod: string; eps: string | null; afp: string | null; arl: string | null; userId: string | null;
};

export function EmployeeForm({ employee, departments, managers, users, canSalary }: {
  employee?: Emp; departments: { id: string; name: string }[]; managers: { id: string; name: string }[];
  /** Usuarios de la organización sin ficha (para vincular acceso existente) */
  users: { id: string; name: string; email: string }[]; canSalary: boolean;
}) {
  const e = employee;
  return (
    <ActionForm action={saveEmployee} className="space-y-5">
      {e && <input type="hidden" name="id" value={e.id} />}
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nombre completo *"><input name="name" required defaultValue={e?.name} className={input} /></Field>
        <Field label="Documento (cédula)"><input name="documentNumber" defaultValue={e?.documentNumber ?? ""} className={input} /></Field>
        <Field label="Correo"><input type="email" name="email" defaultValue={e?.email ?? ""} className={input} /></Field>
        <Field label="Teléfono"><input name="phone" defaultValue={e?.phone ?? ""} className={input} /></Field>
        <Field label="Cargo *"><input name="position" required defaultValue={e?.position ?? ""} className={input} /></Field>
        <Field label="Departamento"><Select name="departmentId" defaultValue={e?.departmentId} empty="—" options={departments.map((d) => ({ value: d.id, label: d.name }))} /></Field>
        <Field label="Jefe inmediato"><Select name="managerId" defaultValue={e?.managerId} empty="— Sin jefe (cabeza del organigrama)" options={managers.filter((m) => m.id !== e?.id).map((m) => ({ value: m.id, label: m.name }))} /></Field>
        <Field label="Sede"><input name="site" defaultValue={e?.site ?? ""} className={input} /></Field>
        <Field label="Estado"><Select name="status" defaultValue={e?.status ?? "ACTIVE"} options={optsT(EMPLOYEE_STATUS)} /></Field>
      </fieldset>
      <fieldset className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Tipo de contrato"><Select name="contractType" defaultValue={e?.contractType ?? "INDEFINITE"} options={opts(CONTRACT_TYPE)} /></Field>
        <Field label="Fecha de ingreso *"><input type="date" name="hireDate" required defaultValue={isoDay(e?.hireDate)} className={input} /></Field>
        <Field label="Fecha de retiro"><input type="date" name="terminationDate" defaultValue={isoDay(e?.terminationDate)} className={input} /></Field>
        {canSalary && <>
          <Field label="Salario base"><input name="salaryAmount" inputMode="numeric" defaultValue={e?.salaryAmount != null ? String(Number(e.salaryAmount)) : ""} className={input} /></Field>
          <Field label="Periodicidad"><Select name="salaryPeriod" defaultValue={e?.salaryPeriod ?? "MONTHLY"} options={opts(SALARY_PERIOD)} /></Field>
        </>}
        <Field label="EPS"><input name="eps" defaultValue={e?.eps ?? ""} className={input} /></Field>
        <Field label="Fondo de pensiones (AFP)"><input name="afp" defaultValue={e?.afp ?? ""} className={input} /></Field>
        <Field label="ARL"><input name="arl" defaultValue={e?.arl ?? ""} className={input} /></Field>
      </fieldset>
      <fieldset className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <Field label="Usuario de Workezt vinculado" hint="Da acceso al portal del colaborador con su propio usuario.">
          <Select name="userId" defaultValue={e?.userId} empty="— Sin usuario" options={users.map((u) => ({ value: u.id, label: `${u.name} · ${u.email}` }))} />
        </Field>
        {!e && (
          <label className="flex items-start gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" name="createAccount" className="mt-1" />
            <span>Crear acceso al portal con su correo (rol Colaborador; contraseña inicial = documento)</span>
          </label>
        )}
      </fieldset>
      <SubmitButton className={btn.primary}>{e ? "Guardar cambios" : "Vincular colaborador"}</SubmitButton>
    </ActionForm>
  );
}
