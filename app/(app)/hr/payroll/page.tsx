import NextLink from "next/link";
import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { money } from "@/lib/ui/format";
import { SALARY_PERIOD } from "@/lib/ui/hr-labels";
import { savePayslip } from "../actions";
import { dday, Kpi, Select } from "../_ui";
import { PayrollTabs } from "./_tabs";

export const metadata = { title: "Nómina" };

/** Salario mensual equivalente (quincenal ×2, por hora × 240 h del mes legal colombiano). */
const monthly = (amount: number, period: string) => (period === "BIWEEKLY" ? amount * 2 : period === "HOURLY" ? amount * 240 : amount);

export default async function Payroll({ searchParams }: PageProps<"/hr/payroll">) {
  const ctx = await requireModule("hr", "hr.payroll.read");
  const hide = ctx.restricted("deny:costs");
  const sp = await searchParams;
  const period = String(sp.period ?? "");
  const [employees, slips, periods, pendingCerts] = await Promise.all([
    ctx.db.employee.findMany({ where: { status: { not: "TERMINATED" } }, orderBy: { name: "asc" }, include: { department: { select: { name: true } } } }),
    ctx.db.payslip.findMany({ where: period ? { period } : {}, include: { employee: { select: { id: true, name: true } } }, orderBy: [{ period: "desc" }, { createdAt: "desc" }], take: 300 }),
    ctx.db.payslip.groupBy({ by: ["period"], _sum: { netAmount: true }, _count: { _all: true }, orderBy: { period: "desc" }, take: 12 }),
    ctx.db.certificateRequest.count({ where: { status: "PENDING" } }),
  ]);
  const totalBase = employees.reduce((s, e) => s + monthly(Number(e.salaryAmount ?? 0), e.salaryPeriod), 0);
  const ym = new Date().toISOString().slice(0, 7);
  const thisMonth = periods.filter((p) => p.period.startsWith(ym));
  const next = slips.filter((s) => !s.isPaid && s.paymentDueDate).sort((a, b) => a.paymentDueDate!.getTime() - b.paymentDueDate!.getTime())[0];
  return (
    <>
      <PageHeader title="Nómina" subtitle="Salario base vigente por colaborador y desprendibles de pago publicados." />
      <PayrollTabs active="/hr/payroll" pendingCerts={pendingCerts} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Colaboradores activos" value={employees.length} hint={`${employees.filter((e) => e.salaryAmount == null).length} sin salario registrado`} />
        <Kpi label="Total salario base" value={hide ? "—" : money(totalBase)} hint="Equivalente mensual" />
        <Kpi label="Desprendibles publicados" value={thisMonth.reduce((s, p) => s + p._count._all, 0)} hint="Este mes" />
        <Kpi label="Próximo pago" value={next ? dday(next.paymentDueDate) : "—"} hint={next ? `${next.employee.name} · ${next.period}` : "Sin pagos programados"} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Desprendibles" padded={false} actions={
            <form className="flex gap-2"><Select name="period" defaultValue={period} empty="Todos los periodos" options={periods.map((p) => ({ value: p.period, label: `${p.period} · ${p._count._all}` }))} className="py-1 text-xs" /><button className={btn.small}>Ver</button></form>
          }>
            <Table head={["Periodo", "Colaborador", "Devengado", "Deducciones", "Neto", "Pago"]} empty={slips.length === 0}>
              {slips.map((p) => (
                <tr key={p.id}>
                  <td className={td}><NextLink href={`/hr/payroll/${p.id}`} className="font-medium hover:underline">{p.period}</NextLink></td>
                  <td className={td}>{p.employee.name}</td>
                  <td className={`${td} tabular-nums`}>{hide ? "—" : money(p.grossAmount)}</td>
                  <td className={`${td} tabular-nums`}>{hide ? "—" : money(p.deductions)}</td>
                  <td className={`${td} font-medium tabular-nums`}>{hide ? "—" : money(p.netAmount)}</td>
                  <td className={td}>{p.isPaid ? <Badge tone="emerald">Pagado</Badge> : <Badge tone="amber">{p.paymentDueDate ? dday(p.paymentDueDate) : "Por pagar"}</Badge>}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Salario base por colaborador" padded={false}>
            <Table head={["Colaborador", "Departamento", "Salario base", "Periodicidad"]} empty={employees.length === 0}>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td className={td}><NextLink href={`/hr/employees/${e.id}?tab=nomina`} className="hover:underline">{e.name}</NextLink></td>
                  <td className={td}>{e.department?.name ?? "—"}</td>
                  <td className={`${td} tabular-nums`}>{hide || e.salaryAmount == null ? "—" : money(e.salaryAmount)}</td>
                  <td className={td}>{SALARY_PERIOD[e.salaryPeriod]}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        {ctx.can("hr.payroll.write") && (
          <Card title="Publicar desprendible">
            <ActionForm action={savePayslip} className="space-y-3">
              <Field label="Colaborador *"><Select name="employeeId" required empty="Selecciona…" options={employees.map((e) => ({ value: e.id, label: e.name }))} /></Field>
              <Field label="Periodo *" hint="Ej. 2026-10 o 2026-10 Q1"><input name="period" required defaultValue={ym} className={input} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Devengado *"><input name="grossAmount" required inputMode="numeric" className={input} /></Field>
                <Field label="Deducciones *"><input name="deductions" required inputMode="numeric" defaultValue="0" className={input} /></Field>
              </div>
              <Field label="Fecha de pago"><input type="date" name="paymentDueDate" className={input} /></Field>
              <p className="pt-1 text-xs font-medium text-slate-600">Aportes legales (opcional)</p>
              <div className="grid grid-cols-3 gap-2">
                <Field label="EPS"><input name="epsAmount" inputMode="numeric" className={input} /></Field>
                <Field label="Pensión"><input name="pensionAmount" inputMode="numeric" className={input} /></Field>
                <Field label="ARL"><input name="arlAmount" inputMode="numeric" className={input} /></Field>
              </div>
              <Field label="Archivo del desprendible" hint="PDF (opcional)"><input type="file" name="file" accept="application/pdf,image/*" className="text-sm" /></Field>
              <SubmitButton className={btn.primary}>Publicar</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
