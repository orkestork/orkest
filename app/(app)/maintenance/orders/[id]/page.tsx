import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { orgPeople } from "@/lib/core/members";
import { ActivityTimeline } from "@/components/activity";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { OpsBadge } from "@/components/ops";
import { btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { dateTime, money } from "@/lib/ui/format";
import { completeOrder, orderStep, saveQuote } from "../../actions";
import { SignatureField } from "./signature-field";

export const metadata = { title: "Orden de mantenimiento" };

export default async function MaintenanceOrderDetail({ params }: PageProps<"/maintenance/orders/[id]">) {
  const ctx = await requireModule("maintenance", "maintenance.read");
  const { id } = await params;
  const o = await ctx.db.maintenanceOrder.findUnique({ where: { id }, include: { equipment: true, quotes: { orderBy: { createdAt: "desc" } } } });
  if (!o) notFound();
  const people = await orgPeople(ctx);
  const who = new Map(people.map((p) => [p.id, p.name]));
  const canWrite = ctx.can("maintenance.write");
  const step = (op: string, label: string, cls: string) => (
    <form action={orderStep}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="op" value={op} /><button className={cls}>{label}</button></form>
  );

  return (
    <>
      <PageHeader title={`Mantenimiento ${o.number}`} crumbs={[{ label: "Órdenes", href: "/maintenance" }, { label: o.number }]}
        subtitle={<>{o.equipment.code} · {o.equipment.name} · reportada {dateTime(o.reportedAt)} por {who.get(o.reportedById) ?? "—"}</>}
        actions={canWrite && <>
          {o.status === "PENDING" && step("start", "Iniciar trabajo", btn.primary)}
          {["PENDING", "IN_PROGRESS"].includes(o.status) && step("cancel", "Cancelar", btn.danger)}
        </>} />
      <div className="mb-6 flex flex-wrap gap-2">
        <OpsBadge kind="maintenanceStatus" value={o.status} /><OpsBadge kind="maintenanceType" value={o.type} /><OpsBadge kind="priority" value={o.priority} />
        <span className="text-sm text-slate-500">Equipo: <OpsBadge kind="equipmentStatus" value={o.equipment.status} /></span>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Detalle">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Descripción</dt><dd className="whitespace-pre-line">{o.description}</dd></div>
              <div><dt className="text-xs text-slate-500">Asignada a</dt><dd>{o.assignedToId ? who.get(o.assignedToId) : "—"}</dd></div>
              <div><dt className="text-xs text-slate-500">Inicio</dt><dd>{dateTime(o.startedAt)}</dd></div>
              <div><dt className="text-xs text-slate-500">Completada</dt><dd>{dateTime(o.completedAt)}</dd></div>
              <div><dt className="text-xs text-slate-500">Tiempo muerto</dt><dd>{o.downtimeMinutes != null ? `${o.downtimeMinutes} min` : "—"}</dd></div>
              {o.resolution && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Trabajo realizado</dt><dd className="whitespace-pre-line">{o.resolution}</dd></div>}
            </dl>
            {o.status === "DONE" && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {[["Ejecutó", o.executorSignatureData, o.executorName], ["Recibió a satisfacción", o.signatureData, o.signedByName]].map(([l, sig, name]) => (
                  <figure key={l} className="rounded-xl border border-slate-200 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {sig && <img src={sig} alt={`Firma de ${name}`} className="h-24 w-full object-contain" />}
                    <figcaption className="mt-1 border-t border-slate-200 pt-1 text-xs text-slate-600">{l}: <strong>{name}</strong> · {dateTime(o.signedAt)}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </Card>
          {o.status === "IN_PROGRESS" && canWrite && (
            <Card title="Cerrar con firmas">
              <ActionForm action={completeOrder} className="space-y-4">
                <input type="hidden" name="id" value={o.id} />
                <Field label="Trabajo realizado *"><textarea name="resolution" rows={3} required className={input} /></Field>
                <Field label="Tiempo muerto (min)" hint="Vacío = tiempo desde el inicio del trabajo"><input name="downtimeMinutes" type="number" min="0" className={input} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><SignatureField name="executorSignatureData" label="Firma de quien ejecutó *" /><input name="executorName" placeholder="Nombre del técnico" required className={input} /></div>
                  <div className="space-y-2"><SignatureField name="signatureData" label="Firma de quien recibe *" /><input name="signedByName" placeholder="Nombre de quien recibe" required className={input} /></div>
                </div>
                <SubmitButton className={btn.primary} pendingText="Cerrando…">Completar orden</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card title="Cotizaciones" padded={false}>
            <Table head={["Proveedor", "Descripción", "Monto", "Estado"]} empty={o.quotes.length === 0}>
              {o.quotes.map((q) => <tr key={q.id}><td className={td}>{q.supplier}</td><td className={td}>{q.description}</td><td className={td}>{money(q.amount, ctx.org.currency)}</td><td className={td}><OpsBadge kind="quoteStatus" value={q.status} /></td></tr>)}
            </Table>
            {canWrite && ["PENDING", "IN_PROGRESS"].includes(o.status) && (
              <ActionForm action={saveQuote} className="grid gap-2 border-t border-slate-100 p-4 sm:grid-cols-4">
                <input type="hidden" name="maintenanceOrderId" value={o.id} />
                <input name="supplier" placeholder="Proveedor" required className={input} />
                <input name="description" placeholder="Descripción" required className={`${input} sm:col-span-2`} />
                <input name="amount" type="number" min="0" placeholder="Monto" required className={input} />
                <SubmitButton className={btn.small}>Agregar cotización</SubmitButton>
              </ActionForm>
            )}
          </Card>
        </div>
        <ActivityTimeline ctx={ctx} entityType="maintenance_order" entityId={o.id} canWrite={false} />
      </div>
    </>
  );
}
