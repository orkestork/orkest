import { Card, PageHeader, Table, td } from "@/components/ui";
import { calcVacationBalance } from "@/lib/apps/hr";
import { fileUrl } from "@/lib/core/files";
import { INCAPACITY_TYPE, PERMIT_SUBTYPE, REQUEST_STATUS, TIME_OFF_TYPE } from "@/lib/ui/hr-labels";
import { cancelMyRequest } from "../../hr/actions";
import { dday, Kpi, Pill, Tabs } from "../../hr/_ui";
import { TimeOffForm } from "../../hr/time-off/_form";
import { NoProfile, portal } from "../_me";

export const metadata = { title: "Mis ausencias" };

const TABS: { key: string; label: string; types: string[]; title: string }[] = [
  { key: "VACATION", label: "Vacaciones", types: ["VACATION"], title: "Solicitar vacaciones" },
  { key: "PERMIT", label: "Permisos y licencias", types: ["PERMIT", "LEAVE", "UNPAID"], title: "Solicitar permiso o licencia" },
  { key: "INCAPACITY", label: "Incapacidades", types: ["INCAPACITY"], title: "Reportar incapacidad" },
];

export default async function MyTimeOff({ searchParams }: PageProps<"/empleado/ausencias">) {
  const { ctx, me } = await portal();
  if (!me) return <NoProfile title="Mis ausencias" />;
  const tipo = String((await searchParams).tipo ?? "VACATION");
  const tab = TABS.find((t) => t.key === tipo) ?? TABS[0];
  const all = await ctx.db.timeOffRequest.findMany({ where: { employeeId: me.id }, orderBy: { startDate: "desc" } });
  const rows = all.filter((r) => tab.types.includes(r.type));
  const bal = calcVacationBalance(me.hireDate, all);
  return (
    <>
      <PageHeader title="Mis ausencias" subtitle="Vacaciones, permisos, licencias e incapacidades. Tu jefe inmediato o talento humano las aprueban." />
      <Tabs active={`/empleado/ausencias?tipo=${tab.key}`} items={TABS.map((t) => ({ label: t.label, href: `/empleado/ausencias?tipo=${t.key}` }))} />
      {tab.key === "VACATION" && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Disponibles" value={bal.diasDisponibles} tone="ok" />
          <Kpi label="Causados" value={bal.diasCausados} hint={`${bal.diasTrabajados} días trabajados`} />
          <Kpi label="Tomados" value={bal.diasTomados} />
          <Kpi label="Pendientes de aprobar" value={bal.diasPendientes} />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2" title="Historial">
          <Table head={["Tipo", "Fechas", "Días", "Estado", ""]} empty={rows.length === 0}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={td}>{TIME_OFF_TYPE[r.type]}<div className="text-xs text-slate-500">{r.subType && PERMIT_SUBTYPE[r.subType]}{r.incapacityType && INCAPACITY_TYPE[r.incapacityType]}{r.incapacityNumber && ` · ${r.incapacityNumber}`}</div></td>
                <td className={`${td} whitespace-nowrap`}>{dday(r.startDate)}<div className="text-xs text-slate-500">{r.subType === "HORAS" ? `${r.startTime}–${r.endTime}` : `al ${dday(r.endDate)}`}</div></td>
                <td className={`${td} tabular-nums`}>{r.subType === "HORAS" ? `${r.hours} h` : r.durationDays}</td>
                <td className={td}><Pill map={REQUEST_STATUS} value={r.status} />{r.reviewNote && <div className="max-w-48 text-xs text-slate-500">{r.reviewNote}</div>}{r.fileId && <a href={fileUrl(r.fileId)} target="_blank" className="block text-xs text-[var(--ork-violet)] hover:underline">Soporte</a>}</td>
                <td className={td}>{r.status === "PENDING" && <form action={cancelMyRequest}><input type="hidden" name="kind" value="timeOff" /><input type="hidden" name="id" value={r.id} /><button className="text-xs text-[var(--ork-pink)] hover:underline">Cancelar</button></form>}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title={tab.title}><TimeOffForm key={tab.key} types={tab.types} /></Card>
      </div>
    </>
  );
}
