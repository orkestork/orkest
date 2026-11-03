import NextLink from "next/link";
import { requireModule } from "@/lib/core/context";
import { Badge, btn, Card, PageHeader, Table, td } from "@/components/ui";
import { today } from "@/lib/apps/hr";
import { money } from "@/lib/ui/format";
import { togglePayslipPaid } from "../../actions";
import { dday, Kpi, Select } from "../../_ui";
import { PayrollTabs } from "../_tabs";

export const metadata = { title: "Pagos de nómina" };

/** Flujo de caja de nómina: qué desprendible se paga y cuándo. */
export default async function Payments({ searchParams }: PageProps<"/hr/payroll/payments">) {
  const ctx = await requireModule("hr", "hr.payroll.read");
  const hide = ctx.restricted("deny:costs");
  const state = String((await searchParams).state ?? "pending");
  const t0 = today();
  const slips = await ctx.db.payslip.findMany({
    where: state === "paid" ? { isPaid: true } : state === "overdue" ? { isPaid: false, paymentDueDate: { lt: t0 } } : state === "all" ? {} : { isPaid: false },
    include: { employee: { select: { id: true, name: true } } }, orderBy: [{ isPaid: "asc" }, { paymentDueDate: "asc" }], take: 500,
  });
  const pending = await ctx.db.payslip.aggregate({ where: { isPaid: false }, _sum: { netAmount: true }, _count: { _all: true } });
  const overdue = await ctx.db.payslip.aggregate({ where: { isPaid: false, paymentDueDate: { lt: t0 } }, _sum: { netAmount: true }, _count: { _all: true } });
  const next7 = await ctx.db.payslip.aggregate({ where: { isPaid: false, paymentDueDate: { gte: t0, lte: new Date(t0.getTime() + 7 * 86_400_000) } }, _sum: { netAmount: true } });
  const m = (v: unknown) => (hide ? "—" : money(v));
  return (
    <>
      <PageHeader title="Pagos de nómina" subtitle="Flujo de caja de nómina: qué desprendible se paga y cuándo." />
      <PayrollTabs active="/hr/payroll/payments" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Por pagar" value={m(pending._sum.netAmount)} hint={`${pending._count._all} desprendibles`} />
        <Kpi label="Vencidos" value={m(overdue._sum.netAmount)} tone={overdue._count._all ? "warn" : undefined} hint={`${overdue._count._all} desprendibles`} />
        <Kpi label="Próximos 7 días" value={m(next7._sum.netAmount)} />
      </div>
      <form className="mb-4 flex gap-2">
        <Select name="state" defaultValue={state} options={[{ value: "pending", label: "Por pagar" }, { value: "overdue", label: "Vencidos" }, { value: "paid", label: "Pagados" }, { value: "all", label: "Todos" }]} className="max-w-44" />
        <button className={btn.secondary}>Ver</button>
      </form>
      <Card padded={false}>
        <Table head={["Colaborador", "Periodo", "Fecha de pago", "Neto", "Estado", ""]} empty={slips.length === 0}>
          {slips.map((p) => (
            <tr key={p.id}>
              <td className={td}>{p.employee.name}</td>
              <td className={td}><NextLink href={`/hr/payroll/${p.id}`} className="hover:underline">{p.period}</NextLink></td>
              <td className={td}>{dday(p.paymentDueDate)}</td>
              <td className={`${td} font-medium tabular-nums`}>{m(p.netAmount)}</td>
              <td className={td}>{p.isPaid ? <Badge tone="emerald">Pagado {p.paidAt ? new Date(p.paidAt).toLocaleDateString("es-CO") : ""}</Badge> : p.paymentDueDate && p.paymentDueDate < t0 ? <Badge tone="rose">Vencido</Badge> : <Badge tone="amber">Pendiente</Badge>}</td>
              <td className={td}>{ctx.can("hr.payroll.write") && <form action={togglePayslipPaid}><input type="hidden" name="id" value={p.id} /><button className={btn.small}>{p.isPaid ? "Deshacer pago" : "Marcar pagado"}</button></form>}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
