import NextLink from "next/link";
import { requireModule } from "@/lib/core/context";
import { btn, Card, PageHeader, Table, td } from "@/components/ui";
import { OVERTIME_TYPE, REQUEST_STATUS, optsT } from "@/lib/ui/hr-labels";
import { decideOvertimeAction } from "../../actions";
import { dday, DecisionForm, Kpi, Pill, Select } from "../../_ui";
import { TimeOffTabs } from "../_tabs";
import { OvertimeForm } from "./_form";

export const metadata = { title: "Horas extras" };

export default async function Overtime({ searchParams }: PageProps<"/hr/time-off/overtime">) {
  const ctx = await requireModule("hr", "hr.timeoff.read");
  const sp = await searchParams;
  const status = String(sp.status ?? "");
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [rows, employees, month] = await Promise.all([
    ctx.db.overtimeRequest.findMany({ where: status ? { status } : {}, include: { employee: { select: { id: true, name: true } } }, orderBy: { date: "desc" }, take: 300 }),
    ctx.db.employee.findMany({ where: { status: { not: "TERMINATED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.db.overtimeRequest.groupBy({ by: ["status"], where: { date: { gte: monthStart } }, _sum: { hours: true }, _count: { _all: true } }),
  ]);
  const m = Object.fromEntries(month.map((x) => [x.status, x]));
  return (
    <>
      <PageHeader title="Horas extras" subtitle="Reportes de trabajo suplementario: diurnas, nocturnas, dominicales y festivas." />
      <TimeOffTabs active="/hr/time-off/overtime" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Aprobadas este mes" value={`${m.APPROVED?._sum.hours ?? 0} h`} hint={`${m.APPROVED?._count._all ?? 0} reportes`} />
        <Kpi label="Por aprobar" value={`${m.PENDING?._sum.hours ?? 0} h`} tone={m.PENDING ? "warn" : undefined} hint={`${m.PENDING?._count._all ?? 0} reportes`} />
        <Kpi label="Rechazadas este mes" value={`${m.REJECTED?._sum.hours ?? 0} h`} />
      </div>
      <form className="mb-4 flex gap-2">
        <Select name="status" defaultValue={status} empty="Todos los estados" options={optsT(REQUEST_STATUS)} className="max-w-48" />
        <button className={btn.secondary}>Filtrar</button>
      </form>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2">
          <Table head={["Colaborador", "Fecha", "Horario", "Horas", "Tipo", "Estado", ""]} empty={rows.length === 0}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={td}><NextLink href={`/hr/employees/${r.employee.id}`} className="font-medium hover:underline">{r.employee.name}</NextLink>{r.reason && <div className="max-w-xs text-xs text-slate-500">{r.reason}</div>}</td>
                <td className={td}>{dday(r.date)}</td>
                <td className={`${td} tabular-nums`}>{r.startTime}–{r.endTime}</td>
                <td className={`${td} tabular-nums`}>{r.hours}</td>
                <td className={td}>{OVERTIME_TYPE[r.overtimeType]}</td>
                <td className={td}><Pill map={REQUEST_STATUS} value={r.status} />{r.reviewNote && <div className="max-w-40 text-xs text-slate-500">{r.reviewNote}</div>}</td>
                <td className={td}>{ctx.can("hr.approve") && r.status === "PENDING" && <DecisionForm action={decideOvertimeAction} id={r.id} compact />}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {ctx.can("hr.timeoff.write") && <Card title="Registrar horas extras"><OvertimeForm employees={employees} /></Card>}
      </div>
    </>
  );
}
