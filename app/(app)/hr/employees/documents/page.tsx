import NextLink from "next/link";
import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { today } from "@/lib/apps/hr";
import { fileUrl } from "@/lib/core/files";
import { DOCUMENT_CATEGORY, opts } from "@/lib/ui/hr-labels";
import { deleteEmployeeDocument, uploadEmployeeDocument } from "../../actions";
import { dday, Select } from "../../_ui";
import { EmployeeTabs } from "../_tabs";

export const metadata = { title: "Documentos de colaboradores" };

export default async function Documents({ searchParams }: PageProps<"/hr/employees/documents">) {
  const ctx = await requireModule("hr", "hr.employees.read");
  const sp = await searchParams;
  const cat = String(sp.category ?? "");
  const expiring = sp.expiring === "1";
  const t0 = today();
  const [docs, employees] = await Promise.all([
    ctx.db.employeeDocument.findMany({
      where: { ...(cat ? { category: cat } : {}), ...(expiring ? { expiresAt: { gte: t0, lte: new Date(t0.getTime() + 30 * 86_400_000) } } : {}) },
      include: { employee: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 500,
    }),
    ctx.db.employee.findMany({ where: { status: { not: "TERMINATED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const canWrite = ctx.can("hr.employees.write");
  return (
    <>
      <PageHeader title="Documentos" subtitle="Contratos, certificados y soportes de cada colaborador, con alertas de vencimiento." />
      <EmployeeTabs active="/hr/employees/documents" />
      <form className="mb-4 flex flex-wrap gap-2">
        <Select name="category" defaultValue={cat} empty="Todas las categorías" options={opts(DOCUMENT_CATEGORY)} className="max-w-56" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="expiring" value="1" defaultChecked={expiring} /> Por vencer (30 días)</label>
        <button className={btn.secondary}>Filtrar</button>
      </form>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Documento", "Colaborador", "Categoría", "Vence", "Cargado", ""]} empty={docs.length === 0}>
            {docs.map((d) => {
              const soon = d.expiresAt && d.expiresAt.getTime() - t0.getTime() < 30 * 86_400_000;
              return (
                <tr key={d.id}>
                  <td className={td}><a href={fileUrl(d.fileId)} target="_blank" className="font-medium text-[var(--ork-violet)] hover:underline">{d.name}</a>{d.uploadedBySelf && <div className="text-xs text-slate-400">Cargado por el colaborador</div>}</td>
                  <td className={td}><NextLink href={`/hr/employees/${d.employee.id}?tab=documentos`} className="hover:underline">{d.employee.name}</NextLink></td>
                  <td className={td}>{DOCUMENT_CATEGORY[d.category] ?? d.category}</td>
                  <td className={td}>{d.expiresAt ? (soon ? <Badge tone={d.expiresAt < t0 ? "rose" : "amber"}>{dday(d.expiresAt)}</Badge> : dday(d.expiresAt)) : "—"}</td>
                  <td className={td}>{dday(d.createdAt)}</td>
                  <td className={td}>{canWrite && <form action={deleteEmployeeDocument}><input type="hidden" name="id" value={d.id} /><button className={btn.ghost}>Eliminar</button></form>}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Cargar documento">
            <ActionForm action={uploadEmployeeDocument} className="space-y-3">
              <Field label="Colaborador *"><Select name="employeeId" required empty="Selecciona…" options={employees.map((e) => ({ value: e.id, label: e.name }))} /></Field>
              <Field label="Nombre"><input name="name" className={input} /></Field>
              <Field label="Categoría"><Select name="category" options={opts(DOCUMENT_CATEGORY)} /></Field>
              <Field label="Vence"><input type="date" name="expiresAt" className={input} /></Field>
              <Field label="Archivo *" hint="PDF, imagen, Word o Excel · máx. 8 MB"><input type="file" name="file" required className="text-sm" /></Field>
              <SubmitButton className={btn.primary}>Cargar</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
