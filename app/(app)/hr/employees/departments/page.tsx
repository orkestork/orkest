import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { saveDepartment } from "../../actions";
import { EmployeeTabs } from "../_tabs";

export const metadata = { title: "Departamentos" };

export default async function Departments({ searchParams }: PageProps<"/hr/employees/departments">) {
  const ctx = await requireModule("hr", "hr.employees.read");
  const sp = await searchParams;
  const depts = await ctx.db.orgUnit.findMany({
    where: { kind: "DEPARTMENT" }, orderBy: { name: "asc" },
    include: { employees: { where: { status: { not: "TERMINATED" } }, select: { id: true, managerId: true, name: true } } },
  });
  const editing = depts.find((d) => d.id === sp.edit);
  const canWrite = ctx.can("hr.employees.write");
  return (
    <>
      <PageHeader title="Departamentos" subtitle="Áreas de la organización. Se usan en colaboradores, requisiciones, conocimiento y el centro de solicitudes." />
      <EmployeeTabs active="/hr/employees/departments" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Departamento", "Código", "Colaboradores", "Responsable", "Estado", ""]} empty={depts.length === 0}>
            {depts.map((d) => {
              // Cabeza del área: quien no reporta a nadie dentro del mismo departamento
              const ids = new Set(d.employees.map((e) => e.id));
              const head = d.employees.find((e) => !e.managerId || !ids.has(e.managerId));
              return (
                <tr key={d.id}>
                  <td className={td}><span className="font-medium">{d.name}</span>{d.description && <div className="text-xs text-slate-500">{d.description}</div>}</td>
                  <td className={`${td} font-mono text-xs`}>{d.code ?? "—"}</td>
                  <td className={`${td} tabular-nums`}>{d.employees.length}</td>
                  <td className={td}>{head?.name ?? "—"}</td>
                  <td className={td}>{d.active ? <Badge tone="emerald">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                  <td className={td}>{canWrite && <a href={`?edit=${d.id}`} className={btn.ghost}>Editar</a>}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
        {canWrite && (
          <Card title={editing ? `Editar ${editing.name}` : "Nuevo departamento"}>
            <ActionForm action={saveDepartment} className="space-y-3" key={editing?.id ?? "new"}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field label="Nombre *"><input name="name" required defaultValue={editing?.name} className={input} /></Field>
              <Field label="Código"><input name="code" defaultValue={editing?.code ?? ""} className={input} placeholder="Ej. PRD" /></Field>
              <Field label="Descripción"><textarea name="description" rows={2} defaultValue={editing?.description ?? ""} className={input} /></Field>
              {editing && (
                <Field label="Estado">
                  <select name="active" defaultValue={editing.active ? "on" : "off"} className={input}><option value="on">Activo</option><option value="off">Inactivo</option></select>
                </Field>
              )}
              <div className="flex gap-2">
                <SubmitButton className={btn.primary}>{editing ? "Guardar" : "Crear"}</SubmitButton>
                {editing && <a href="?" className={btn.secondary}>Cancelar</a>}
              </div>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
