import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { dateTime } from "@/lib/ui/format";
import { BENEFIT_CATEGORY, REQUEST_STATUS, opts } from "@/lib/ui/hr-labels";
import { saveBenefit, toggleBenefit } from "../../actions";
import { dday, isoDay, Pill, Select } from "../../_ui";
import { CommsTabs } from "../_tabs";

export const metadata = { title: "Beneficios" };

export default async function Benefits({ searchParams }: PageProps<"/hr/news/benefits">) {
  const ctx = await requireModule("hr", "hr.comms.read");
  const sp = await searchParams;
  const [benefits, requests] = await Promise.all([
    ctx.db.benefit.findMany({ orderBy: [{ isActive: "desc" }, { order: "asc" }, { title: "asc" }], include: { _count: { select: { requests: true } } } }),
    ctx.db.benefitRequest.findMany({ include: { benefit: { select: { title: true } }, employee: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const editing = benefits.find((b) => b.id === sp.edit);
  const canWrite = ctx.can("hr.comms.write");
  return (
    <>
      <PageHeader title="Beneficios" subtitle="Catálogo de beneficios y convenios que los colaboradores pueden solicitar desde su portal. Las solicitudes se aprueban en la Bandeja." />
      <CommsTabs active="/hr/news/benefits" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {benefits.length === 0 && <Card><p className="text-sm text-slate-400">Aún no hay beneficios publicados.</p></Card>}
            {benefits.map((b) => (
              <Card key={b.id} className={b.isActive ? "" : "opacity-60"}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{b.title} {b.isFeatured && <Badge tone="violet">Destacado</Badge>}</p>
                    <p className="text-xs text-slate-500">{BENEFIT_CATEGORY[b.category]}{b.frequency ? ` · ${b.frequency}` : ""}{b.expiresAt ? ` · vence ${dday(b.expiresAt)}` : ""}</p>
                  </div>
                  {!b.isActive && <Badge>Inactivo</Badge>}
                </div>
                <p className="mt-2 text-sm">{b.description}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>{b._count.requests} solicitudes</span>
                  {canWrite && <span className="flex gap-1">
                    <a href={`?edit=${b.id}`} className={btn.ghost}>Editar</a>
                    <form action={toggleBenefit}><input type="hidden" name="id" value={b.id} /><button className={btn.ghost}>{b.isActive ? "Desactivar" : "Activar"}</button></form>
                  </span>}
                </div>
              </Card>
            ))}
          </div>
          <Card title="Últimas solicitudes" padded={false}>
            <Table head={["Colaborador", "Beneficio", "Fecha", "Estado"]} empty={requests.length === 0}>
              {requests.map((r) => (
                <tr key={r.id}><td className={td}>{r.employee.name}</td><td className={td}>{r.benefit.title}</td><td className={td}>{dateTime(r.createdAt)}</td><td className={td}><Pill map={REQUEST_STATUS} value={r.status} /></td></tr>
              ))}
            </Table>
          </Card>
        </div>
        {canWrite && (
          <Card title={editing ? "Editar beneficio" : "Nuevo beneficio"}>
            <ActionForm action={saveBenefit} className="space-y-3" key={editing?.id ?? "new"}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field label="Título *"><input name="title" required defaultValue={editing?.title} className={input} /></Field>
              <Field label="Categoría"><Select name="category" defaultValue={editing?.category ?? "BIENESTAR"} options={opts(BENEFIT_CATEGORY)} /></Field>
              <Field label="Descripción corta *"><textarea name="description" rows={2} required defaultValue={editing?.description} className={input} /></Field>
              <Field label="Detalle y condiciones"><textarea name="detail" rows={3} defaultValue={editing?.detail ?? ""} className={input} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Frecuencia"><input name="frequency" defaultValue={editing?.frequency ?? ""} placeholder="Anual, mensual…" className={input} /></Field>
                <Field label="Vence"><input type="date" name="expiresAt" defaultValue={isoDay(editing?.expiresAt)} className={input} /></Field>
              </div>
              <Field label="Orden"><input name="order" type="number" defaultValue={editing?.order ?? 0} className={input} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isFeatured" defaultChecked={editing?.isFeatured} /> Destacar en el portal</label>
              <div className="flex gap-2">
                <SubmitButton className={btn.primary}>{editing ? "Guardar" : "Publicar"}</SubmitButton>
                {editing && <a href="?" className={btn.secondary}>Cancelar</a>}
              </div>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
