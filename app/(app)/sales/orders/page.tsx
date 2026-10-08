import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { stateLabel } from "@/components/workflow-bar";
import { Badge, btn, Card, PageHeader, Table, td } from "@/components/ui";
import { date, money } from "@/lib/ui/format";
import { DELIVERY_STATUS, INVOICE_STATUS } from "@/lib/ui/sales-labels";

export const metadata = { title: "Pedidos de venta" };

export default async function SalesOrders({ searchParams }: PageProps<"/sales/orders">) {
  const ctx = await requireModule("sales", "sales.quotes.read");
  const { filter } = await searchParams;
  const where = filter === "to_deliver" ? { status: "confirmed", deliveryStatus: { not: "full" } } : filter === "to_invoice" ? { invoiceStatus: "to_invoice" } : {};
  const [orders, label] = await Promise.all([ctx.db.salesOrder.findMany({ where, include: { customer: true }, orderBy: { createdAt: "desc" }, take: 300 }), stateLabel(ctx, "sales_order")]);
  return (
    <>
      <PageHeader title="Pedidos de venta" subtitle="Se crean al convertir una cotización o directamente."
        actions={ctx.can("sales.quotes.write") && <Link href="/sales/orders/new" className={btn.primary}>Nuevo pedido</Link>} />
      <div className="mb-4 flex gap-1.5">
        <Link href="/sales/orders" className={btn.small}>Todos</Link>
        <Link href="/sales/orders?filter=to_deliver" className={btn.small}>Por entregar</Link>
        <Link href="/sales/orders?filter=to_invoice" className={btn.small}>Por facturar</Link>
      </div>
      <Card padded={false}>
        <Table head={["Número", "Cliente", "Total", "Entrega", "Facturación", "Compromiso", "Estado"]} empty={orders.length === 0}>
          {orders.map((o) => { const s = label(o.status); return (
            <tr key={o.id} className="hover:bg-slate-50">
              <td className={td}><Link href={`/sales/orders/${o.id}`} className="font-medium hover:underline">{o.number}</Link></td>
              <td className={td}>{o.customer.name}</td>
              <td className={td}>{money(o.total, o.currency)}</td>
              <td className={td}><Badge tone={DELIVERY_STATUS[o.deliveryStatus].tone}>{DELIVERY_STATUS[o.deliveryStatus].label}</Badge></td>
              <td className={td}><Badge tone={INVOICE_STATUS[o.invoiceStatus].tone}>{INVOICE_STATUS[o.invoiceStatus].label}</Badge></td>
              <td className={td}>{date(o.commitmentAt)}</td>
              <td className={td}><Badge tone={s.color}>{s.label}</Badge></td>
            </tr>
          ); })}
        </Table>
      </Card>
    </>
  );
}
