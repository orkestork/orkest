import Link from "@/components/plink";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { plain } from "@/lib/core/entities";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { orgUsers } from "@/lib/core/members";
import { WorkflowBar } from "@/components/workflow-bar";
import { ActivityTimeline } from "@/components/activity";
import { CustomFieldValues } from "@/components/custom-fields";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { date, num } from "@/lib/ui/format";
import { requisitionToRfq } from "../../actions";

export default async function RequisitionDetail({ params }: PageProps<"/purchasing/requisitions/[id]">) {
  const ctx = await requireModule("purchasing", "purchasing.requisitions.read");
  const { id } = await params;
  const r = await ctx.db.requisition.findUnique({ where: { id }, include: { lines: true } });
  if (!r) notFound();
  const [users, suppliers, pos, wh, defs] = await Promise.all([
    orgUsers(ctx), ctx.db.supplier.findMany({ orderBy: { name: "asc" } }),
    ctx.db.purchaseOrder.findMany({ where: { requisitionId: r.id } }),
    r.warehouseId ? ctx.db.warehouse.findUnique({ where: { id: r.warehouseId } }) : null,
    getFieldDefs(ctx.db, "requisition"),
  ]);
  const umap = new Map(users.map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title={`Requisición ${r.number}`} crumbs={[{ label: "Requisiciones", href: "/purchasing/requisitions" }, { label: r.number }]}
        subtitle={`${umap.get(r.requesterId) ?? ""} · ${r.area ?? "Sin área"} · necesaria para ${date(r.neededBy)} · entregar en ${wh?.name ?? "—"}`} />
      <div className="mb-6"><WorkflowBar ctx={ctx} entityType="requisition" entity={plain(r)} /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Productos solicitados" padded={false}>
            <Table head={["Descripción", "Cantidad"]}>{r.lines.map((l) => <tr key={l.id}><td className={td}>{l.description}</td><td className={td}>{num(l.quantity)}</td></tr>)}</Table>
          </Card>
          {(r.suggestedSupplier || r.notes || defs.length > 0) && (
            <Card title="Detalle">
              {r.suggestedSupplier && <p className="text-sm"><span className="text-slate-500">Proveedor sugerido:</span> {r.suggestedSupplier}</p>}
              {r.notes && <p className="mt-1 text-sm"><span className="text-slate-500">Observaciones:</span> {r.notes}</p>}
              <div className="mt-3"><CustomFieldValues defs={defs} values={r.customFields as Record<string, unknown>} users={umap} /></div>
            </Card>
          )}
          {r.status === "approved" && ctx.can("purchasing.write") && (
            <Card title="Generar solicitud de cotización">
              <ActionForm action={requisitionToRfq} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={r.id} />
                <Field label="Proveedor"><select name="supplierId" required className={`${input} min-w-64`}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                <SubmitButton className={btn.primary}>Crear SdC</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {pos.length > 0 && (
            <Card title="Órdenes de compra">
              {pos.map((p) => <p key={p.id} className="text-sm"><Link href={`/purchasing/orders/${p.id}`} className="font-medium text-[var(--ork-violet)] underline">{p.number}</Link></p>)}
            </Card>
          )}
        </div>
        <ActivityTimeline ctx={ctx} entityType="requisition" entityId={r.id} canWrite={ctx.can("purchasing.requisitions.write")} />
      </div>
    </>
  );
}
