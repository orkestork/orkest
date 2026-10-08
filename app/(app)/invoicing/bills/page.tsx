import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { PayForm } from "@/components/pay-form";
import { Badge, Card, PageHeader, Stat, Table, td } from "@/components/ui";
import { date, money } from "@/lib/ui/format";

export const metadata = { title: "Facturas de proveedor" };

export default async function Bills() {
  const ctx = await requireModule("invoicing", "invoicing.read");
  const [bills, journals, pos] = await Promise.all([
    ctx.db.bill.findMany({ include: { supplier: true }, orderBy: { issuedAt: "desc" }, take: 300 }),
    ctx.db.journal.findMany({ where: { type: { in: ["BANK", "CASH"] }, active: true } }),
    ctx.db.purchaseOrder.findMany({ select: { id: true, number: true } }),
  ]);
  const pmap = new Map(pos.map((p) => [p.id, p.number]));
  const open = bills.filter((b) => b.status === "posted");
  const due = open.filter((b) => b.dueDate < new Date());
  return (
    <>
      <PageHeader title="Facturas de proveedor" subtitle="Se registran desde la orden de compra por lo recibido (bienes) o lo pedido (servicios)." />
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat label="Cuentas por pagar" value={money(open.reduce((s, b) => s + Number(b.balance), 0), ctx.org.currency)} hint={`${open.length} facturas`} />
        <Stat label="Vencidas" value={money(due.reduce((s, b) => s + Number(b.balance), 0), ctx.org.currency)} hint={`${due.length} facturas`} />
      </div>
      <Card padded={false}>
        <Table head={["Número", "Proveedor", "Ref. proveedor", "OC", "Total", "Saldo", "Vence", "Estado", ""]} empty={bills.length === 0}>
          {bills.map((b) => (
            <tr key={b.id}>
              <td className={`${td} font-medium`}>{b.number}</td><td className={td}>{b.supplier.name}</td><td className={td}>{b.supplierRef ?? "—"}</td>
              <td className={td}>{b.purchaseOrderId ? <Link href={`/purchasing/orders/${b.purchaseOrderId}`} className="underline">{pmap.get(b.purchaseOrderId)}</Link> : "—"}</td>
              <td className={td}>{money(b.total)}</td><td className={td}>{money(b.balance)}</td><td className={td}>{date(b.dueDate)}</td>
              <td className={td}><Badge tone={b.status === "paid" ? "emerald" : b.dueDate < new Date() ? "rose" : "amber"}>{b.status === "paid" ? "Pagada" : "Por pagar"}</Badge></td>
              <td className={td}>{b.status === "posted" && ctx.can("invoicing.write") && <PayForm billId={b.id} balance={Number(b.balance)} journals={journals} />}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
