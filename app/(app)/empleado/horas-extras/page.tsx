import { Card, PageHeader, Table, td } from "@/components/ui";
import { OVERTIME_TYPE, REQUEST_STATUS } from "@/lib/ui/hr-labels";
import { cancelMyRequest } from "../../hr/actions";
import { dday, Kpi, Pill } from "../../hr/_ui";
import { OvertimeForm } from "../../hr/time-off/overtime/_form";
import { NoProfile, portal } from "../_me";

export const metadata = { title: "Mis horas extras" };

export default async function MyOvertime() {
  const { ctx, me } = await portal();
  if (!me) return <NoProfile title="Horas extras" />;
  const rows = await ctx.db.overtimeRequest.findMany({ where: { employeeId: me.id }, orderBy: { date: "desc" } });
  const ym = new Date().toISOString().slice(0, 7);
  const month = rows.filter((r) => r.date.toISOString().startsWith(ym));
  return (
    <>
      <PageHeader title="Horas extras" subtitle="Reporta el trabajo suplementario después de realizarlo." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Aprobadas este mes" value={`${month.filter((r) => r.status === "APPROVED").reduce((s, r) => s + r.hours, 0)} h`} tone="ok" />
        <Kpi label="Pendientes" value={`${rows.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.hours, 0)} h`} />
        <Kpi label="Reportes totales" value={rows.length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2" title="Historial">
          <Table head={["Fecha", "Horario", "Horas", "Tipo", "Estado", ""]} empty={rows.length === 0}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={td}>{dday(r.date)}</td>
                <td className={`${td} tabular-nums`}>{r.startTime}–{r.endTime}</td>
                <td className={`${td} tabular-nums`}>{r.hours}</td>
                <td className={td}>{OVERTIME_TYPE[r.overtimeType]}</td>
                <td className={td}><Pill map={REQUEST_STATUS} value={r.status} />{r.reviewNote && <div className="max-w-48 text-xs text-slate-500">{r.reviewNote}</div>}</td>
                <td className={td}>{r.status === "PENDING" && <form action={cancelMyRequest}><input type="hidden" name="kind" value="overtime" /><input type="hidden" name="id" value={r.id} /><button className="text-xs text-[var(--ork-pink)] hover:underline">Cancelar</button></form>}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Reportar horas extras"><OvertimeForm /></Card>
      </div>
    </>
  );
}
