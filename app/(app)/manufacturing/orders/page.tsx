import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { stateLabel } from "@/components/workflow-bar";
import { Badge, btn, Card, PageHeader, Table, td } from "@/components/ui";
import { date, num } from "@/lib/ui/format";

export const metadata = { title: "Órdenes de producción" };

export default async function ProductionOrders() {
  const ctx = await requireModule("manufacturing", "manufacturing.read");
  const [orders, label] = await Promise.all([ctx.db.productionOrder.findMany({ orderBy: [{ status: "asc" }, { scheduledAt: "asc" }], take: 300 }), stateLabel(ctx, "production")]);
  const products = new Map((await ctx.db.product.findMany({ where: { id: { in: orders.map((o) => o.productId) } } })).map((p) => [p.id, p]));
  const whs = new Map((await ctx.db.warehouse.findMany()).map((w) => [w.id, w.code]));
  return (
    <>
      <PageHeader title="Órdenes de producción" actions={ctx.can("manufacturing.write") && <Link href="/manufacturing/orders/new" className={btn.primary}>Nueva orden</Link>} />
      <Card padded={false}>
        <Table head={["Número", "Producto", "Cantidad", "Producido", "Planta", "Programada", "Origen", "Estado"]} empty={orders.length === 0}>
          {orders.map((o) => { const s = label(o.status); const late = ["confirmed", "in_progress"].includes(o.status) && o.scheduledAt.getTime() < Date.now() - 86400000; return (
            <tr key={o.id} className="hover:bg-slate-50">
              <td className={td}><Link href={`/manufacturing/orders/${o.id}`} className="font-medium hover:underline">{o.number}</Link></td>
              <td className={td}>{products.get(o.productId)?.name}</td>
              <td className={td}>{num(o.quantity)}</td>
              <td className={td}>{num(o.producedQty)}</td>
              <td className={td}>{whs.get(o.warehouseId)}</td>
              <td className={`${td} ${late ? "font-semibold text-[var(--ork-pink)]" : ""}`}>{date(o.scheduledAt)}</td>
              <td className={td}>{o.origin ?? "—"}</td>
              <td className={td}><Badge tone={s.color}>{s.label}</Badge></td>
            </tr>
          ); })}
        </Table>
      </Card>
    </>
  );
}
