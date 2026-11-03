import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { Card, PageHeader, Table, td } from "@/components/ui";
import { isTicketOverdue, today } from "@/lib/apps/hr";
import { TIME_OFF_TYPE } from "@/lib/ui/hr-labels";
import { dday, Kpi } from "./_ui";

export const metadata = { title: "Talento humano" };

export default async function HrHome() {
  const ctx = await requireModule("hr", "hr.employees.read");
  const t0 = today();
  const in30 = new Date(t0.getTime() + 30 * 86_400_000);
  const [active, onLeave, pendingTimeOff, pendingOvertime, pendingBenefits, pendingCerts, expiring, attendanceToday, openTickets, outToday, hires] = await Promise.all([
    ctx.db.employee.count({ where: { status: { not: "TERMINATED" } } }),
    ctx.db.employee.count({ where: { status: "ON_LEAVE" } }),
    ctx.db.timeOffRequest.findMany({ where: { status: "PENDING" }, select: { type: true } }),
    ctx.db.overtimeRequest.count({ where: { status: "PENDING" } }),
    ctx.db.benefitRequest.count({ where: { status: "PENDING" } }),
    ctx.db.certificateRequest.count({ where: { status: "PENDING" } }),
    ctx.db.employeeDocument.count({ where: { expiresAt: { gte: t0, lte: in30 } } }),
    ctx.db.attendanceRecord.groupBy({ by: ["status"], where: { date: t0 }, _count: { _all: true } }),
    ctx.db.hrTicket.findMany({ where: { status: { notIn: ["FINALIZADO", "CANCELADO"] } }, select: { dueDate: true, status: true } }),
    ctx.db.timeOffRequest.findMany({ where: { status: "APPROVED", startDate: { lte: t0 }, endDate: { gte: t0 } }, include: { employee: { select: { id: true, name: true, position: true } } }, orderBy: { endDate: "asc" } }),
    ctx.db.employee.findMany({ where: { status: { not: "TERMINATED" } }, orderBy: { hireDate: "desc" }, take: 5, include: { department: true } }),
  ]);
  const pending = pendingTimeOff.length + pendingOvertime + pendingBenefits + pendingCerts;
  const vac = pendingTimeOff.filter((p) => p.type === "VACATION").length;
  const att = Object.fromEntries(attendanceToday.map((a) => [a.status, a._count._all]));
  const overdue = openTickets.filter((t) => isTicketOverdue(t)).length;

  return (
    <>
      <PageHeader title="Talento humano" subtitle="Plantilla, solicitudes pendientes y novedades del día." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Link href="/hr/employees"><Kpi label="Colaboradores activos" value={active} hint={onLeave ? `${onLeave} en licencia` : "Plantilla vigente"} /></Link>
        <Link href="/hr/inbox"><Kpi label="Por aprobar" value={pending} tone={pending ? "warn" : undefined} hint="Todas las solicitudes" /></Link>
        <Link href="/hr/time-off?status=PENDING"><Kpi label="Vacaciones pendientes" value={vac} hint="Esperando aprobación" /></Link>
        <Link href="/hr/employees/documents?expiring=1"><Kpi label="Documentos por vencer" value={expiring} tone={expiring ? "warn" : undefined} hint="Próximos 30 días" /></Link>
        <Link href="/hr/time-off/attendance"><Kpi label="Asistencia hoy" value={(att.PRESENT ?? 0) + (att.LATE ?? 0)} hint={`${att.LATE ?? 0} tarde · ${att.ABSENT ?? 0} ausentes`} /></Link>
        <Link href="/hr/tickets"><Kpi label="Solicitudes abiertas" value={openTickets.length} tone={overdue ? "warn" : undefined} hint={`${overdue} vencidas`} /></Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Ausentes hoy" padded={false}>
          <Table head={["Colaborador", "Motivo", "Regresa"]} empty={outToday.length === 0}>
            {outToday.map((r) => (
              <tr key={r.id}>
                <td className={td}><Link href={`/hr/employees/${r.employee.id}`} className="font-medium hover:underline">{r.employee.name}</Link><div className="text-xs text-slate-500">{r.employee.position}</div></td>
                <td className={td}>{TIME_OFF_TYPE[r.type]}</td>
                <td className={td}>{dday(new Date(r.endDate.getTime() + 86_400_000))}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Ingresos recientes" padded={false}>
          <Table head={["Colaborador", "Departamento", "Ingreso"]} empty={hires.length === 0}>
            {hires.map((e) => (
              <tr key={e.id}>
                <td className={td}><Link href={`/hr/employees/${e.id}`} className="font-medium hover:underline">{e.name}</Link><div className="text-xs text-slate-500">{e.position}</div></td>
                <td className={td}>{e.department?.name ?? "—"}</td>
                <td className={td}>{dday(e.hireDate)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
