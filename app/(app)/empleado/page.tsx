import NextLink from "next/link";
import { Badge, btn, Card, PageHeader } from "@/components/ui";
import { calcVacationBalance, today } from "@/lib/apps/hr";
import { money } from "@/lib/ui/format";
import { REQUEST_STATUS, TIME_OFF_TYPE } from "@/lib/ui/hr-labels";
import { dday, Kpi, Pill } from "../hr/_ui";
import { NoProfile, portal } from "./_me";

export const metadata = { title: "Mi portal" };

export default async function PortalHome() {
  const { ctx, me } = await portal();
  if (!me) return <NoProfile title={`Hola, ${ctx.user.name.split(" ")[0]}`} />;
  const t0 = today();
  const [requests, openTickets, lastSlip, news, reads, teamPending] = await Promise.all([
    ctx.db.timeOffRequest.findMany({ where: { employeeId: me.id }, orderBy: { createdAt: "desc" } }),
    ctx.db.hrTicket.count({ where: { employeeId: me.id, status: { notIn: ["FINALIZADO", "CANCELADO"] } } }),
    ctx.db.payslip.findFirst({ where: { employeeId: me.id }, orderBy: { createdAt: "desc" } }),
    ctx.db.hrAnnouncement.findMany({ where: { isActive: true, OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] }, orderBy: [{ isImportant: "desc" }, { createdAt: "desc" }], take: 3 }),
    ctx.db.hrAnnouncementRead.findMany({ where: { userId: ctx.user.id }, select: { announcementId: true } }),
    ctx.db.timeOffRequest.count({ where: { status: "PENDING", employee: { managerId: me.id } } }),
  ]);
  const bal = calcVacationBalance(me.hireDate, requests);
  const pending = requests.filter((r) => r.status === "PENDING").length;
  const read = new Set(reads.map((r) => r.announcementId));
  const upcoming = requests.filter((r) => r.status === "APPROVED" && r.endDate >= t0).slice(0, 3);
  return (
    <>
      <PageHeader title={`Hola, ${me.name.split(" ")[0]}`} subtitle={`${me.position ?? ""}${me.department ? ` · ${me.department.name}` : ""}${me.manager ? ` · Reportas a ${me.manager.name}` : ""}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <NextLink href="/empleado/ausencias"><Kpi label="Vacaciones disponibles" value={bal.diasDisponibles} hint={`${bal.diasCausados} causados · ${bal.diasTomados} tomados`} /></NextLink>
        <NextLink href="/empleado/ausencias"><Kpi label="Solicitudes pendientes" value={pending} /></NextLink>
        <NextLink href="/empleado/solicitudes"><Kpi label="Solicitudes internas abiertas" value={openTickets} /></NextLink>
        <NextLink href={lastSlip ? `/empleado/nomina/${lastSlip.id}` : "/empleado/nomina"}><Kpi label="Último desprendible" value={lastSlip ? <span className="text-lg">{money(lastSlip.netAmount)}</span> : "—"} hint={lastSlip?.period ?? "Sin desprendibles"} /></NextLink>
      </div>
      {teamPending > 0 && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-[var(--ork-pink)]/30 bg-[var(--ork-pink)]/5 px-4 py-3 text-sm">
          <span>Tu equipo tiene <strong>{teamPending}</strong> solicitud(es) esperando tu aprobación.</span>
          <NextLink href="/empleado/equipo" className={btn.small}>Revisar</NextLink>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Noticias" className="lg:col-span-2" actions={<NextLink href="/empleado/noticias" className={btn.ghost}>Ver todas</NextLink>}>
          {news.length === 0 ? <p className="text-sm text-slate-400">No hay noticias por ahora.</p> : (
            <ul className="divide-y divide-slate-100">{news.map((n) => (
              <li key={n.id} className="py-3">
                <p className="flex flex-wrap items-center gap-2 font-medium">{n.title}{n.isImportant && <Badge tone="rose">Importante</Badge>}{!read.has(n.id) && <Badge tone="violet">Nueva</Badge>}</p>
                <p className="line-clamp-2 text-sm text-slate-600">{n.body}</p>
              </li>
            ))}</ul>
          )}
        </Card>
        <Card title="Próximas ausencias">
          {upcoming.length === 0 ? <p className="text-sm text-slate-400">No tienes ausencias aprobadas próximas.</p> : (
            <ul className="space-y-2 text-sm">{upcoming.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span>{TIME_OFF_TYPE[r.type]}<span className="block text-xs text-slate-500">{dday(r.startDate)} → {dday(r.endDate)}</span></span><Pill map={REQUEST_STATUS} value={r.status} /></li>)}</ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <NextLink href="/empleado/ausencias?tipo=VACATION" className={btn.small}>Pedir vacaciones</NextLink>
            <NextLink href="/empleado/ausencias?tipo=PERMIT" className={btn.small}>Pedir permiso</NextLink>
            <NextLink href="/empleado/solicitudes/new" className={btn.small}>Nueva solicitud</NextLink>
          </div>
        </Card>
      </div>
    </>
  );
}
