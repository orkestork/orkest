import Link from "@/components/plink";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { plain } from "@/lib/core/entities";
import { componentAvailability } from "@/lib/apps/manufacturing";
import { WorkflowBar } from "@/components/workflow-bar";
import { ActivityTimeline } from "@/components/activity";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, PageHeader, Table, td } from "@/components/ui";
import { date, num } from "@/lib/ui/format";
import { TRANSFER_STATUS } from "@/lib/ui/stock-labels";
import { produceAction, workOrderStep } from "../../actions";

const WO: Record<string, { label: string; tone: string }> = { pending: { label: "Pendiente", tone: "slate" }, in_progress: { label: "En curso", tone: "amber" }, done: { label: "Hecha", tone: "emerald" } };

export default async function ProductionDetail({ params }: PageProps<"/manufacturing/orders/[id]">) {
  const ctx = await requireModule("manufacturing", "manufacturing.read");
  const { id } = await params;
  const mo = await ctx.db.productionOrder.findUnique({ where: { id }, include: { workOrders: { orderBy: { position: "asc" } } } });
  if (!mo) notFound();
  const [product, wh, comps, transfers, centers] = await Promise.all([
    ctx.db.product.findUniqueOrThrow({ where: { id: mo.productId } }),
    ctx.db.warehouse.findUniqueOrThrow({ where: { id: mo.warehouseId } }),
    componentAvailability(ctx, mo.id),
    ctx.db.transfer.findMany({ where: { sourceType: "production", sourceId: mo.id }, orderBy: { createdAt: "asc" } }),
    ctx.db.workCenter.findMany(),
  ]);
  const wc = new Map(centers.map((c) => [c.id, c.name]));
  const canWrite = ctx.can("manufacturing.write");
  const canProduce = ["confirmed", "in_progress"].includes(mo.status) && canWrite;
  const remaining = Number(mo.quantity) - Number(mo.producedQty);
  const missing = comps.filter((c) => c.missing > 0);

  return (
    <>
      <PageHeader title={`Producción ${mo.number}`} crumbs={[{ label: "Órdenes de producción", href: "/manufacturing/orders" }, { label: mo.number }]}
        subtitle={`${product.name} · ${num(mo.producedQty)}/${num(mo.quantity)} ${product.unit} · planta ${wh.name} · programada ${date(mo.scheduledAt)}${mo.origin ? ` · ${mo.origin}` : ""}`} />
      <div className="mb-6"><WorkflowBar ctx={ctx} entityType="production" entity={plain(mo)} /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Componentes" padded={false}>
            <Table head={["Componente", "Requerido", "Consumido", "Disponible en planta", ""]}>
              {comps.map((c) => (
                <tr key={c.id}>
                  <td className={td}>{c.name}</td><td className={td}>{num(c.required)} {c.unit}</td><td className={td}>{num(c.consumed)}</td>
                  <td className={td}>{num(c.available)}</td>
                  <td className={td}>{c.pending <= 0 ? <Badge tone="emerald">Consumido</Badge> : c.missing > 0 ? <Badge tone="rose">Faltan {num(c.missing)}</Badge> : <Badge tone="blue">Disponible</Badge>}</td>
                </tr>
              ))}
            </Table>
          </Card>
          {canProduce && remaining > 0 && (
            <Card title="Registrar producción">
              {missing.length > 0 && <p className="mb-3 text-sm text-[var(--ork-pink)]">Faltan componentes para producir todo. Puedes producir parcialmente o abastecer desde <Link href="/manufacturing/planning" className="underline">Planificación</Link>.</p>}
              <ActionForm action={produceAction} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={mo.id} />
                <input name="quantity" type="number" step="any" min="0.001" max={remaining} defaultValue={remaining} className="w-32 rounded-full border border-slate-300 px-3 py-2 text-sm" aria-label="Cantidad a producir" />
                <SubmitButton className={btn.primary} pendingText="Produciendo…">Producir</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {mo.workOrders.length > 0 && (
            <Card title="Órdenes de trabajo" padded={false}>
              <Table head={["Operación", "Centro de trabajo", "Esperado", "Real", "Estado", ""]}>
                {mo.workOrders.map((w) => (
                  <tr key={w.id}>
                    <td className={td}>{w.name}</td><td className={td}>{wc.get(w.workCenterId)}</td><td className={td}>{w.expectedMinutes} min</td><td className={td}>{w.realMinutes ? `${w.realMinutes} min` : "—"}</td>
                    <td className={td}><Badge tone={WO[w.status].tone}>{WO[w.status].label}</Badge></td>
                    <td className={td}>{canWrite && ["confirmed", "in_progress"].includes(mo.status) && w.status !== "done" && (
                      <form action={workOrderStep}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="productionId" value={mo.id} /><input type="hidden" name="op" value={w.status === "pending" ? "start" : "finish"} /><button className={btn.small}>{w.status === "pending" ? "Iniciar" : "Terminar"}</button></form>
                    )}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
          {transfers.length > 0 && (
            <Card title="Movimientos de inventario">
              {transfers.map((t) => <p key={t.id} className="text-sm"><Link href={`/inventory/transfers/${t.id}`} className="font-mono text-xs font-semibold text-[var(--ork-violet)] underline">{t.number}</Link> <Badge tone={TRANSFER_STATUS[t.status].tone}>{TRANSFER_STATUS[t.status].label}</Badge></p>)}
            </Card>
          )}
        </div>
        <ActivityTimeline ctx={ctx} entityType="production" entityId={mo.id} canWrite={canWrite} />
      </div>
    </>
  );
}
