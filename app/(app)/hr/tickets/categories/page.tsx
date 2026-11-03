import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { fieldsToText, parseFields } from "@/lib/apps/hr";
import { saveCategory, toggleCategory } from "../../actions";
import { Select, Tabs } from "../../_ui";

export const metadata = { title: "Categorías de solicitudes" };

export default async function Categories({ searchParams }: PageProps<"/hr/tickets/categories">) {
  const ctx = await requireModule("hr", "hr.tickets.read");
  const sp = await searchParams;
  const [cats, depts, people, counts] = await Promise.all([
    ctx.db.hrRequestCategory.findMany({ orderBy: { name: "asc" } }),
    ctx.db.orgUnit.findMany({ where: { kind: "DEPARTMENT", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.db.employee.findMany({ where: { userId: { not: null }, status: { not: "TERMINATED" } }, orderBy: { name: "asc" }, select: { userId: true, name: true } }),
    ctx.db.hrTicket.groupBy({ by: ["categoryId"], _count: { _all: true } }),
  ]);
  const editing = cats.find((c) => c.id === sp.edit);
  const canWrite = ctx.can("hr.tickets.write");
  const deptName = (id: string) => depts.find((d) => d.id === id)?.name ?? "—";
  return (
    <>
      <PageHeader title="Categorías" subtitle="Tipos de solicitud que ven los colaboradores, quién las atiende por defecto, qué departamentos las usan y qué datos extra piden." />
      <Tabs active="/hr/tickets/categories" items={[{ label: "Solicitudes", href: "/hr/tickets" }, { label: "Categorías", href: "/hr/tickets/categories" }]} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Categoría", "Departamentos", "Responsable", "Campos", "Solicitudes", "Estado", ""]} empty={cats.length === 0}>
            {cats.map((c) => (
              <tr key={c.id}>
                <td className={`${td} font-medium`}>{c.name}</td>
                <td className={td}>{c.allowedDepartmentIds.length ? c.allowedDepartmentIds.map(deptName).join(", ") : <span className="text-slate-400">Todos</span>}</td>
                <td className={td}>{people.find((p) => p.userId === c.defaultResponsibleId)?.name ?? "—"}</td>
                <td className={`${td} tabular-nums`}>{parseFields(c.fieldsSchema).length}</td>
                <td className={`${td} tabular-nums`}>{counts.find((x) => x.categoryId === c.id)?._count._all ?? 0}</td>
                <td className={td}>{c.active ? <Badge tone="emerald">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                <td className={`${td} whitespace-nowrap`}>{canWrite && <>
                  <a href={`?edit=${c.id}`} className={btn.ghost}>Editar</a>
                  <form action={toggleCategory} className="inline"><input type="hidden" name="id" value={c.id} /><button className={btn.ghost}>{c.active ? "Desactivar" : "Activar"}</button></form>
                </>}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {canWrite && (
          <Card title={editing ? `Editar ${editing.name}` : "Nueva categoría"}>
            <ActionForm action={saveCategory} className="space-y-3" key={editing?.id ?? "new"}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field label="Nombre *"><input name="name" required defaultValue={editing?.name} className={input} placeholder="Ej. Soporte de TI" /></Field>
              <Field label="Responsable por defecto"><Select name="defaultResponsibleId" defaultValue={editing?.defaultResponsibleId} empty="Sin asignar" options={people.map((p) => ({ value: p.userId!, label: p.name }))} /></Field>
              <Field label="Departamentos que la pueden usar" hint="Sin selección: todos. Con un solo departamento, el solicitante puede elegir responsable de ese departamento.">
                <select name="allowedDepartmentIds" multiple defaultValue={editing?.allowedDepartmentIds ?? []} className={`${input} h-28`}>
                  {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Campos adicionales" hint="Uno por línea: Etiqueta | text/select/boolean | opciones separadas por coma | obligatorio">
                <textarea name="fields" rows={4} defaultValue={editing ? fieldsToText(parseFields(editing.fieldsSchema)) : ""} className={`${input} font-mono text-xs`} placeholder={"Equipo afectado | select | Portátil, Celular, Impresora | obligatorio\nPlaca del activo | text"} />
              </Field>
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
