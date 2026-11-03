import { requireModule } from "@/lib/core/context";
import { btn, Card, input, PageHeader } from "@/components/ui";
import { parseDay, today } from "@/lib/apps/hr";
import { compactCop, money } from "@/lib/ui/format";
import { ATTENDANCE_STATUS, CONTRACT_TYPE, OVERTIME_TYPE, REQUEST_STATUS, TICKET_STATUS, TIME_OFF_TYPE } from "@/lib/ui/hr-labels";
import { Bars, isoDay, Kpi, Tabs } from "../_ui";

export const metadata = { title: "Reportes de talento humano" };

const by = <T,>(rows: T[], key: (r: T) => string, value: (r: T) => number) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r));
  return [...m.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
};

/** Consolidado de nómina, ausentismo, horas extra, solicitudes y plantilla en el rango elegido. */
export default async function Reports({ searchParams }: PageProps<"/hr/reports">) {
  const ctx = await requireModule("hr", "hr.employees.read");
  const sp = await searchParams;
  const t0 = today();
  let to = t0, from = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth() - 5, 1));
  try { if (sp.from) from = parseDay(String(sp.from)); if (sp.to) to = parseDay(String(sp.to)); } catch { /* rango inválido: por defecto */ }
  const end = new Date(to.getTime() + 86_400_000 - 1);
  const range = { gte: from, lte: end };
  const payroll = ctx.can("hr.payroll.read") && !ctx.restricted("deny:costs");
  const [payslips, timeOff, attendance, overtime, tickets, employees] = await Promise.all([
    payroll ? ctx.db.payslip.findMany({ where: { createdAt: range }, select: { period: true, grossAmount: true, deductions: true, netAmount: true } }) : Promise.resolve([]),
    ctx.db.timeOffRequest.findMany({ where: { startDate: range }, select: { type: true, status: true, durationDays: true } }),
    ctx.db.attendanceRecord.groupBy({ by: ["status"], where: { date: range }, _count: { _all: true } }),
    ctx.db.overtimeRequest.findMany({ where: { date: range }, select: { overtimeType: true, status: true, hours: true } }),
    ctx.db.hrTicket.findMany({ where: { createdAt: range }, select: { status: true, category: { select: { name: true } } } }),
    ctx.db.employee.findMany({ where: { status: { not: "TERMINATED" } }, select: { contractType: true, department: { select: { name: true } } } }),
  ]);
  const approvedOff = timeOff.filter((r) => r.status === "APPROVED");
  const approvedOt = overtime.filter((r) => r.status === "APPROVED");
  return (
    <>
      <PageHeader title="Reportes" subtitle="Consolidado de nómina, ausentismo, horas extra, solicitudes y plantilla en el rango elegido." />
      <Tabs active="/hr/reports" items={[{ label: "Reportes", href: "/hr/reports" }, { label: "Cómo funciona", href: "/hr/reports/help" }]} />
      <form className="mb-5 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-600">Desde<input type="date" name="from" defaultValue={isoDay(from)} className={`${input} mt-1`} /></label>
        <label className="text-xs text-slate-600">Hasta<input type="date" name="to" defaultValue={isoDay(to)} className={`${input} mt-1`} /></label>
        <button className={btn.secondary}>Aplicar</button>
      </form>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Plantilla activa" value={employees.length} />
        <Kpi label="Días de ausencia aprobados" value={approvedOff.reduce((s, r) => s + r.durationDays, 0)} hint={`${timeOff.length} solicitudes`} />
        <Kpi label="Horas extra aprobadas" value={approvedOt.reduce((s, r) => s + r.hours, 0).toLocaleString("es-CO")} hint={`${overtime.length} reportes`} />
        {payroll ? <Kpi label="Nómina neta" value={compactCop(payslips.reduce((s, p) => s + Number(p.netAmount), 0))} hint={`${payslips.length} desprendibles`} /> : <Kpi label="Solicitudes internas" value={tickets.length} />}
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {payroll && <Card title="Nómina neta por periodo"><Bars rows={by(payslips, (p) => p.period, (p) => Number(p.netAmount)).sort((a, b) => a.label.localeCompare(b.label))} format={(v) => money(v)} /></Card>}
        <Card title="Ausentismo por tipo (días aprobados)"><Bars rows={by(approvedOff, (r) => TIME_OFF_TYPE[r.type] ?? r.type, (r) => r.durationDays)} /></Card>
        <Card title="Solicitudes de ausencia por estado"><Bars rows={by(timeOff, (r) => REQUEST_STATUS[r.status]?.label ?? r.status, () => 1)} /></Card>
        <Card title="Asistencia registrada"><Bars rows={attendance.map((a) => ({ label: ATTENDANCE_STATUS[a.status]?.label ?? a.status, total: a._count._all }))} /></Card>
        <Card title="Horas extra aprobadas por tipo"><Bars rows={by(approvedOt, (r) => OVERTIME_TYPE[r.overtimeType] ?? r.overtimeType, (r) => r.hours)} /></Card>
        <Card title="Solicitudes internas por categoría"><Bars rows={by(tickets, (t) => t.category.name, () => 1)} /></Card>
        <Card title="Solicitudes internas por estado"><Bars rows={by(tickets, (t) => TICKET_STATUS[t.status]?.label ?? t.status, () => 1)} /></Card>
        <Card title="Plantilla por departamento"><Bars rows={by(employees, (e) => e.department?.name ?? "Sin departamento", () => 1)} /></Card>
        <Card title="Plantilla por tipo de contrato"><Bars rows={by(employees, (e) => CONTRACT_TYPE[e.contractType] ?? e.contractType, () => 1)} /></Card>
      </div>
    </>
  );
}
