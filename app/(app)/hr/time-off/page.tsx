import NextLink from "next/link";
import { requireModule } from "@/lib/core/context";
import { btn, Card, PageHeader, Table, td } from "@/components/ui";
import { fileUrl } from "@/lib/core/files";
import { INCAPACITY_TYPE, PERMIT_SUBTYPE, REQUEST_STATUS, TIME_OFF_TYPE, opts, optsT } from "@/lib/ui/hr-labels";
import { decideTimeOffAction } from "../actions";
import { dday, DecisionForm, Pill, Select } from "../_ui";
import { TimeOffTabs } from "./_tabs";
import { TimeOffForm } from "./_form";

export const metadata = { title: "Ausencias" };

export default async function TimeOff({ searchParams }: PageProps<"/hr/time-off">) {
  const ctx = await requireModule("hr", "hr.timeoff.read");
  const sp = await searchParams;
  const type = String(sp.type ?? "");
  const status = String(sp.status ?? "");
  const [rows, employees] = await Promise.all([
    ctx.db.timeOffRequest.findMany({
      where: { ...(type ? { type } : {}), ...(status ? { status } : {}) },
      include: { employee: { select: { id: true, name: true, department: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 300,
    }),
    ctx.db.employee.findMany({ where: { status: { not: "TERMINATED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const canDecide = ctx.can("hr.approve");
  return (
    <>
      <PageHeader title="Ausencias" subtitle="Vacaciones, permisos, licencias e incapacidades de todos los colaboradores." />
      <TimeOffTabs active="/hr/time-off" />
      <form className="mb-4 flex flex-wrap gap-2">
        <Select name="type" defaultValue={type} empty="Todos los tipos" options={opts(TIME_OFF_TYPE)} className="max-w-48" />
        <Select name="status" defaultValue={status} empty="Todos los estados" options={optsT(REQUEST_STATUS)} className="max-w-48" />
        <button className={btn.secondary}>Filtrar</button>
      </form>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2">
          <Table head={["Colaborador", "Tipo", "Fechas", "Días", "Estado", ""]} empty={rows.length === 0}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={td}><NextLink href={`/hr/employees/${r.employee.id}?tab=ausencias`} className="font-medium hover:underline">{r.employee.name}</NextLink><div className="text-xs text-slate-500">{r.employee.department?.name}</div></td>
                <td className={td}>
                  {TIME_OFF_TYPE[r.type]}
                  <div className="text-xs text-slate-500">
                    {r.subType && PERMIT_SUBTYPE[r.subType]}{r.incapacityType && INCAPACITY_TYPE[r.incapacityType]}{r.incapacityNumber && ` · ${r.incapacityNumber}`}
                    {r.fileId && <> · <a href={fileUrl(r.fileId)} target="_blank" className="text-[var(--ork-violet)] hover:underline">soporte</a></>}
                  </div>
                  {r.reason && <div className="max-w-xs text-xs italic text-slate-500">“{r.reason}”</div>}
                </td>
                <td className={`${td} whitespace-nowrap`}>{dday(r.startDate)}{r.subType === "HORAS" ? <div className="text-xs text-slate-500">{r.startTime}–{r.endTime}</div> : <div className="text-xs text-slate-500">al {dday(r.endDate)}</div>}</td>
                <td className={`${td} tabular-nums`}>{r.subType === "HORAS" ? `${r.hours} h` : r.durationDays}</td>
                <td className={td}><Pill map={REQUEST_STATUS} value={r.status} />{r.type === "PERMIT" && r.isPaid != null && <div className="text-xs text-slate-500">{r.isPaid ? "Remunerado" : "No remunerado"}</div>}{r.reviewNote && <div className="max-w-40 text-xs text-slate-500">{r.reviewNote}</div>}</td>
                <td className={td}>
                  {canDecide && r.status === "PENDING" && (
                    <DecisionForm action={decideTimeOffAction} id={r.id} compact extra={r.type === "PERMIT" && (
                      <select name="isPaid" defaultValue="yes" className="rounded-md border border-slate-300 px-1 py-1 text-xs"><option value="yes">Remunerado</option><option value="no">No remunerado</option></select>
                    )} />
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
        {ctx.can("hr.timeoff.write") && <Card title="Registrar ausencia"><TimeOffForm employees={employees} /></Card>}
      </div>
    </>
  );
}
