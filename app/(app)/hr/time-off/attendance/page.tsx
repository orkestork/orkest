import NextLink from "next/link";
import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, input, PageHeader, Table, td } from "@/components/ui";
import { dayKey, parseDay, today } from "@/lib/apps/hr";
import { ATTENDANCE_STATUS, optsT } from "@/lib/ui/hr-labels";
import { saveAttendance } from "../../actions";
import { dday, Kpi, Pill, Select } from "../../_ui";
import { TimeOffTabs } from "../_tabs";

export const metadata = { title: "Asistencia" };

export default async function Attendance({ searchParams }: PageProps<"/hr/time-off/attendance">) {
  const ctx = await requireModule("hr", "hr.timeoff.read");
  const sp = await searchParams;
  let day = today();
  try { if (sp.date) day = parseDay(String(sp.date)); } catch { /* fecha inválida: hoy */ }
  const [employees, records, absences] = await Promise.all([
    ctx.db.employee.findMany({ where: { status: { not: "TERMINATED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, department: { select: { name: true } } } }),
    ctx.db.attendanceRecord.findMany({ where: { date: day } }),
    ctx.db.timeOffRequest.findMany({ where: { status: "APPROVED", startDate: { lte: day }, endDate: { gte: day }, subType: { not: "HORAS" } }, select: { employeeId: true, type: true } }),
  ]);
  const byEmp = new Map(records.map((r) => [r.employeeId, r]));
  const away = new Set(absences.map((a) => a.employeeId));
  const count = (s: string) => records.filter((r) => r.status === s).length;
  const canWrite = ctx.can("hr.timeoff.write");
  const prev = dayKey(new Date(day.getTime() - 86_400_000));
  const next = dayKey(new Date(day.getTime() + 86_400_000));
  return (
    <>
      <PageHeader title="Asistencia" subtitle={dday(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        actions={<div className="flex gap-2"><NextLink href={`?date=${prev}`} className={btn.secondary}>← Anterior</NextLink><NextLink href="?" className={btn.secondary}>Hoy</NextLink><NextLink href={`?date=${next}`} className={btn.secondary}>Siguiente →</NextLink></div>} />
      <TimeOffTabs active="/hr/time-off/attendance" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Presentes" value={count("PRESENT")} tone="ok" />
        <Kpi label="Tarde" value={count("LATE")} />
        <Kpi label="Ausentes" value={count("ABSENT")} tone={count("ABSENT") ? "warn" : undefined} />
        <Kpi label="Sin registro" value={employees.filter((e) => !byEmp.has(e.id) && !away.has(e.id)).length} hint={`${away.size} con ausencia aprobada`} />
      </div>
      <Card padded={false}>
        <Table head={["Colaborador", "Estado", "Entrada", "Salida", "Nota", ""]} empty={employees.length === 0}>
          {employees.map((e) => {
            const r = byEmp.get(e.id);
            return (
              <tr key={e.id}>
                <td className={td}><span className="font-medium">{e.name}</span><div className="text-xs text-slate-500">{e.department?.name}</div></td>
                {canWrite ? (
                  <td className={td} colSpan={5}>
                    <ActionForm action={saveAttendance} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="employeeId" value={e.id} />
                      <input type="hidden" name="date" value={dayKey(day)} />
                      <Select name="status" defaultValue={r?.status ?? (away.has(e.id) ? "ABSENT" : "PRESENT")} options={optsT(ATTENDANCE_STATUS)} className="w-32 py-1 text-xs" />
                      <input type="time" name="checkIn" defaultValue={r?.checkIn ?? ""} className={`${input} w-28 py-1 text-xs`} />
                      <input type="time" name="checkOut" defaultValue={r?.checkOut ?? ""} className={`${input} w-28 py-1 text-xs`} />
                      <input name="note" defaultValue={r?.note ?? (away.has(e.id) ? "Ausencia aprobada" : "")} placeholder="Nota" className={`${input} max-w-48 py-1 text-xs`} />
                      <SubmitButton className={btn.small} pendingText="…">{r ? "Actualizar" : "Registrar"}</SubmitButton>
                      {r && <Pill map={ATTENDANCE_STATUS} value={r.status} />}
                    </ActionForm>
                  </td>
                ) : (
                  <>
                    <td className={td}>{r ? <Pill map={ATTENDANCE_STATUS} value={r.status} /> : away.has(e.id) ? "Ausencia aprobada" : "—"}</td>
                    <td className={td}>{r?.checkIn ?? "—"}</td><td className={td}>{r?.checkOut ?? "—"}</td><td className={td}>{r?.note ?? ""}</td><td className={td} />
                  </>
                )}
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
