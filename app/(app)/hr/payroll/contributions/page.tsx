import { requireModule } from "@/lib/core/context";
import { Card, PageHeader, Table, td } from "@/components/ui";
import { money } from "@/lib/ui/format";
import { PayrollTabs } from "../_tabs";

export const metadata = { title: "Aportes de nómina" };

/** Aportes legales de nómina (EPS, ARL, pensión) por periodo. Solo suma lo cargado: no inventa desgloses. */
export default async function Contributions() {
  const ctx = await requireModule("hr", "hr.payroll.read");
  const hide = ctx.restricted("deny:costs");
  const rows = await ctx.db.payslip.groupBy({
    by: ["period"], _sum: { grossAmount: true, deductions: true, netAmount: true, epsAmount: true, arlAmount: true, pensionAmount: true },
    _count: { _all: true, epsAmount: true }, orderBy: { period: "desc" }, take: 24,
  });
  const m = (v: unknown) => (hide ? "—" : money(v));
  return (
    <>
      <PageHeader title="Aportes" subtitle="Aportes legales de nómina (EPS, ARL, pensión) por periodo. Lleva estos totales a Contabilidad o Facturación > Proveedores para pagarlos." />
      <PayrollTabs active="/hr/payroll/contributions" />
      <Card padded={false}>
        <Table head={["Periodo", "Desprendibles", "Devengado", "EPS", "Pensión", "ARL", "Deducciones totales", "Neto"]} empty={rows.length === 0}>
          {rows.map((r) => (
            <tr key={r.period}>
              <td className={`${td} font-medium`}>{r.period}</td>
              <td className={`${td} tabular-nums`}>{r._count._all}{r._count.epsAmount < r._count._all && <div className="text-xs text-amber-700">{r._count._all - r._count.epsAmount} sin desglose</div>}</td>
              <td className={`${td} tabular-nums`}>{m(r._sum.grossAmount)}</td>
              <td className={`${td} tabular-nums`}>{m(r._sum.epsAmount)}</td>
              <td className={`${td} tabular-nums`}>{m(r._sum.pensionAmount)}</td>
              <td className={`${td} tabular-nums`}>{m(r._sum.arlAmount)}</td>
              <td className={`${td} tabular-nums`}>{m(r._sum.deductions)}</td>
              <td className={`${td} font-medium tabular-nums`}>{m(r._sum.netAmount)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
