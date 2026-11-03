import NextLink from "next/link";
import { Badge, Card, PageHeader, Table, td } from "@/components/ui";
import { money } from "@/lib/ui/format";
import { SALARY_PERIOD } from "@/lib/ui/hr-labels";
import { dday, Kpi } from "../../hr/_ui";
import { NoProfile, portal } from "../_me";

export const metadata = { title: "Mi nómina" };

export default async function MyPayroll() {
  const { ctx, me } = await portal();
  if (!me) return <NoProfile title="Nómina" />;
  const slips = await ctx.db.payslip.findMany({ where: { employeeId: me.id }, orderBy: [{ period: "desc" }, { createdAt: "desc" }] });
  const year = String(new Date().getFullYear());
  const ytd = slips.filter((s) => s.period.startsWith(year));
  return (
    <>
      <PageHeader title="Nómina" subtitle="Tus desprendibles de pago publicados por talento humano." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Salario base" value={me.salaryAmount != null ? money(me.salaryAmount) : "—"} hint={SALARY_PERIOD[me.salaryPeriod]} />
        <Kpi label={`Neto recibido ${year}`} value={money(ytd.reduce((s, p) => s + Number(p.netAmount), 0))} hint={`${ytd.length} desprendibles`} />
        <Kpi label="Último pago" value={slips[0] ? money(slips[0].netAmount) : "—"} hint={slips[0]?.period} />
      </div>
      <Card padded={false}>
        <Table head={["Periodo", "Devengado", "Deducciones", "Neto", "Pago"]} empty={slips.length === 0}>
          {slips.map((p) => (
            <tr key={p.id}>
              <td className={td}><NextLink href={`/empleado/nomina/${p.id}`} className="font-medium text-[var(--ork-violet)] hover:underline">{p.period}</NextLink></td>
              <td className={`${td} tabular-nums`}>{money(p.grossAmount)}</td>
              <td className={`${td} tabular-nums`}>{money(p.deductions)}</td>
              <td className={`${td} font-medium tabular-nums`}>{money(p.netAmount)}</td>
              <td className={td}>{p.isPaid ? <Badge tone="emerald">Pagado</Badge> : <Badge tone="amber">{p.paymentDueDate ? `Se paga ${dday(p.paymentDueDate)}` : "Por pagar"}</Badge>}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
