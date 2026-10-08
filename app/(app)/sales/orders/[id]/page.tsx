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
import { DELIVERY_STATUS, INVOICE_STATUS } from "@/lib/ui/sales-labels";
import { soAction } from "../../order-actions";

export default async function SalesOrderDetail({ params }: PageProps<"/sales/orders/[id]">) {
  const ctx = await requireModule("sales", "sales.quotes.read");
  const { id } = await params;
  const so = await ctx.db.salesOrder.findUnique({ where: { id }, include: { customer: true, lines: true } });
  if (!so) notFound();
  const [deliveries, invoices, term, pricelist, quote] = await Promise.all([
    ctx.db.transfer.findMany({ where: { sourceType: "sales_order", sourceId: so.id }, orderBy: { createdAt: "asc" } }),
    ctx.hasModule("invoicing") ? ctx.db.invoice.findMany({ where: { salesOrderId: so.id }, orderBy: { issuedAt: "asc" } }) : [],
    so.paymentTermId ? ctx.db.paymentTerm.findUnique({ where: { id: so.paymentTermId } }) : null,
    so.pricelistId ? ctx.db.pricelist.findUnique({ where: { id: so.pricelistId } }) : null,
    so.quoteId ? ctx.db.quote.findUnique({ where: { id: so.quoteId } }) : null,
  ]);
  const products = new Map((await ctx.db.product.findMany({ where: { id: { in: so.lines.map((l) => l.productId ?? "") } } })).map((p) => [p.id, p]));
  const open = so.status === "confirmed";
  return (
    <>
      <PageHeader title={`Pedido ${so.number}`} crumbs={[{ label: "Pedidos", href: "/sales/orders" }, { label: so.number }]}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Link href={`/crm/customers/${so.customerId}`} className="hover:underline">{so.customer.name}</Link> · {term?.name ?? "sin plazo"} · {pricelist?.name ?? "precio base"} · compromiso {date(so.commitmentAt)}
          <Badge tone={DELIVERY_STATUS[so.deliveryStatus].tone}>{DELIVERY_STATUS[so.deliveryStatus].label}</Badge>
          <Badge tone={INVOICE_STATUS[so.invoiceStatus].tone}>{INVOICE_STATUS[so.invoiceStatus].label}</Badge></span>} />
      <div className="mb-6"><WorkflowBar ctx={ctx} entityType="sales_order" entity={plain(so)} /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Productos" padded={false}>
            <Table head={["Descripción", "Cantidad", "Entregado", "Facturado", "Precio", "Desc.", "Subtotal", "Factura por"]}>
              {so.lines.map((l) => {
                const p = l.productId ? products.get(l.productId) : undefined;
                return (
                  <tr key={l.id}>
                    <td className={td}>{l.description}</td><td className={td}>{num(l.quantity)}</td>
                    <td className={td}>{p?.kind === "SERVICE" ? "—" : num(l.deliveredQty)}</td><td className={td}>{num(l.invoicedQty)}</td>
                    <td className={td}>{money(l.unitPrice, so.currency)}</td><td className={td}>{Number(l.discountPct) ? `${num(l.discountPct)}%` : "—"}</td>
                    <td className={td}>{money(l.total, so.currency)}</td>
                    <td className={`${td} text-xs`}>{p?.invoicePolicy === "DELIVERY" ? "Lo entregado" : "Lo pedido"}</td>
                  </tr>
                );
              })}
            </Table>
            <div className="ml-auto max-w-xs space-y-1 p-5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span>{money(so.subtotal, so.currency)}</div>
              <div className="flex justify-between"><span className="text-slate-500">Impuestos</span>{money(so.tax, so.currency)}</div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Total</span>{money(so.total, so.currency)}</div>
            </div>
          </Card>
          <Card title="Entregas y facturas">
            <div className="space-y-2 text-sm">
              {deliveries.map((t) => <p key={t.id}><Link href={`/inventory/transfers/${t.id}`} className="font-mono text-xs font-semibold text-[var(--ork-violet)] underline">{t.number}</Link> <Badge tone={TRANSFER_STATUS[t.status].tone}>{TRANSFER_STATUS[t.status].label}</Badge></p>)}
              {invoices.map((i) => <p key={i.id}><Link href={`/invoicing/${i.id}`} className="font-medium text-[var(--ork-violet)] underline">{i.number}</Link> · {money(i.total)} · saldo {money(i.balance)} · vence {date(i.dueDate)}</p>)}
              {deliveries.length + invoices.length === 0 && <p className="text-slate-400">Sin entregas ni facturas.</p>}
            </div>
            {open && (
              <div className="mt-4 flex flex-wrap gap-2">
                {so.deliveryStatus !== "full" && ctx.can("sales.quotes.write") && !deliveries.some((t) => !["done", "canceled"].includes(t.status)) && (
                  <ActionForm action={soAction}><input type="hidden" name="id" value={so.id} /><input type="hidden" name="op" value="delivery" /><SubmitButton className={btn.secondary}>Generar entrega</SubmitButton></ActionForm>
                )}
                {so.invoiceStatus === "to_invoice" && ctx.hasModule("invoicing") && ctx.can("invoicing.write") && (
                  <ActionForm action={soAction}><input type="hidden" name="id" value={so.id} /><input type="hidden" name="op" value="invoice" /><SubmitButton className={btn.primary}>Crear factura</SubmitButton></ActionForm>
                )}
              </div>
            )}
          </Card>
          {quote && <p className="text-sm text-slate-500">Origen: <Link href={`/sales/quotes/${quote.id}`} className="text-[var(--ork-violet)] underline">Cotización {quote.number}</Link></p>}
        </div>
        <ActivityTimeline ctx={ctx} entityType="sales_order" entityId={so.id} canWrite={ctx.can("sales.quotes.write")} />
      </div>
    </>
  );
}
