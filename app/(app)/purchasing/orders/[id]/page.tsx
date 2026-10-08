import Link from "@/components/plink";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { plain } from "@/lib/core/entities";
import { WorkflowBar } from "@/components/workflow-bar";
import { ActivityTimeline } from "@/components/activity";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, PageHeader, Table, td } from "@/components/ui";
import { date, money, num } from "@/lib/ui/format";
import { TRANSFER_STATUS } from "@/lib/ui/stock-labels";
import { RECEIPT_STATUS, BILL_STATUS } from "@/lib/ui/purchase-labels";
import { poAction } from "../../actions";

export default async function PurchaseOrderDetail({ params }: PageProps<"/purchasing/orders/[id]">) {
  const ctx = await requireModule("purchasing", "purchasing.read");
  const { id } = await params;
  const po = await ctx.db.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, lines: true } });
  if (!po) notFound();
  const [wh, receipts, bills, approvals, req] = await Promise.all([
    ctx.db.warehouse.findUnique({ where: { id: po.warehouseId } }),
    ctx.db.transfer.findMany({ where: { sourceType: "purchase_order", sourceId: po.id }, orderBy: { createdAt: "asc" } }),
    ctx.hasModule("invoicing") ? ctx.db.bill.findMany({ where: { purchaseOrderId: po.id } }) : [],
    ctx.db.approval.findMany({ where: { entityType: "purchase_order", entityId: po.id }, orderBy: { createdAt: "desc" } }),
    po.requisitionId ? ctx.db.requisition.findUnique({ where: { id: po.requisitionId } }) : null,
  ]);
  const confirmed = ["purchase", "received"].includes(po.status);
  return (
    <>
      <PageHeader title={`${confirmed ? "Orden de compra" : "Solicitud de cotización"} ${po.number}`} crumbs={[{ label: "Órdenes de compra", href: "/purchasing/orders" }, { label: po.number }]}
        subtitle={<span className="flex flex-wrap items-center gap-2">{po.supplier.name} · recibir en {wh?.name} · llegada {date(po.expectedAt)}
          <Badge tone={RECEIPT_STATUS[po.receiptStatus].tone}>{RECEIPT_STATUS[po.receiptStatus].label}</Badge>
          <Badge tone={BILL_STATUS[po.billStatus].tone}>{BILL_STATUS[po.billStatus].label}</Badge></span>} />
      <div className="mb-6"><WorkflowBar ctx={ctx} entityType="purchase_order" entity={plain(po)} /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Productos" padded={false}>
            <Table head={["Descripción", "Cantidad", "Recibido", "Facturado", "Precio", "IVA", "Subtotal"]}>
              {po.lines.map((l) => (
                <tr key={l.id}>
                  <td className={td}>{l.description}</td><td className={td}>{num(l.quantity)}</td>
                  <td className={`${td} ${Number(l.receivedQty) >= Number(l.quantity) ? "text-emerald-700" : ""}`}>{num(l.receivedQty)}</td>
                  <td className={td}>{num(l.billedQty)}</td>
                  <td className={td}>{money(l.unitPrice, po.currency)}</td><td className={td}>{num(l.taxRate)}%</td><td className={td}>{money(l.total, po.currency)}</td>
                </tr>
              ))}
            </Table>
            <div className="ml-auto max-w-xs space-y-1 p-5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span>{money(po.subtotal, po.currency)}</div>
              <div className="flex justify-between"><span className="text-slate-500">Impuestos</span>{money(po.tax, po.currency)}</div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Total</span>{money(po.total, po.currency)}</div>
            </div>
          </Card>
          {approvals.length > 0 && (
            <Card title="Aprobaciones">
              {approvals.map((a) => <p key={a.id} className="text-sm">{a.reason} · <Badge tone={a.status === "APPROVED" ? "emerald" : a.status === "REJECTED" ? "rose" : "amber"}>{a.status}</Badge>{a.comment ? ` · ${a.comment}` : ""}</p>)}
            </Card>
          )}
          {confirmed && (
            <Card title="Recepciones y facturación">
              <div className="space-y-2 text-sm">
                {receipts.map((t) => <p key={t.id}><Link href={`/inventory/transfers/${t.id}`} className="font-mono text-xs font-semibold text-[var(--ork-violet)] underline">{t.number}</Link> <Badge tone={TRANSFER_STATUS[t.status].tone}>{TRANSFER_STATUS[t.status].label}</Badge></p>)}
                {bills.map((b) => <p key={b.id}>Factura de proveedor <b>{b.number}</b> · {money(b.total)} · saldo {money(b.balance)}</p>)}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {po.receiptStatus !== "full" && ctx.can("purchasing.write") && !receipts.some((t) => !["done", "canceled"].includes(t.status)) && (
                  <ActionForm action={poAction}><input type="hidden" name="id" value={po.id} /><input type="hidden" name="op" value="receipt" /><SubmitButton className={btn.secondary}>Generar recepción</SubmitButton></ActionForm>
                )}
                {ctx.hasModule("invoicing") && ctx.can("invoicing.write") && po.billStatus !== "billed" && po.receiptStatus !== "none" && (
                  <ActionForm action={poAction} className="flex items-center gap-2"><input type="hidden" name="id" value={po.id} /><input type="hidden" name="op" value="bill" />
                    <input name="supplierRef" placeholder="N.º factura del proveedor" className="rounded-full border border-slate-300 px-3 py-1.5 text-sm" />
                    <SubmitButton className={btn.primary}>Registrar factura de proveedor</SubmitButton></ActionForm>
                )}
              </div>
            </Card>
          )}
          {req && <p className="text-sm text-slate-500">Origen: <Link href={`/purchasing/requisitions/${req.id}`} className="text-[var(--ork-violet)] underline">Requisición {req.number}</Link></p>}
        </div>
        <ActivityTimeline ctx={ctx} entityType="purchase_order" entityId={po.id} canWrite={ctx.can("purchasing.write")} />
      </div>
    </>
  );
}
