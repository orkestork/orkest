import type { ReactNode } from "react";
import { Card, input, PageHeader, Table, td } from "@/components/ui";
import { Avatar } from "@/components/list/status-pill";
import { calcVacationBalance } from "@/lib/apps/hr";
import { fileUrl } from "@/lib/core/files";
import { OVERTIME_TYPE, PERMIT_SUBTYPE, TIME_OFF_TYPE } from "@/lib/ui/hr-labels";
import { decideOvertimeAction, decideTimeOffAction } from "../../hr/actions";
import { dday, DecisionForm } from "../../hr/_ui";
import { portal } from "../_me";

export const metadata = { title: "Equipo" };

type Node = { id: string; name: string; position: string | null; managerId: string | null; department: { name: string } | null; email: string | null; phone: string | null };

export default async function Team({ searchParams }: PageProps<"/empleado/equipo">) {
  const { ctx, me } = await portal();
  const q = String((await searchParams).q ?? "").trim().toLowerCase();
  const people: Node[] = await ctx.db.employee.findMany({
    where: { status: { not: "TERMINATED" } }, orderBy: { name: "asc" },
    select: { id: true, name: true, position: true, managerId: true, email: true, phone: true, department: { select: { name: true } } },
  });
  const reports = me ? await ctx.db.employee.findMany({
    where: { managerId: me.id, status: { not: "TERMINATED" } }, orderBy: { name: "asc" },
    include: { timeOffRequests: true, overtimeRequests: { where: { status: "PENDING" } } },
  }) : [];
  const pendingOff = reports.flatMap((r) => r.timeOffRequests.filter((t) => t.status === "PENDING").map((t) => ({ ...t, who: r.name })));
  const pendingOt = reports.flatMap((r) => r.overtimeRequests.map((t) => ({ ...t, who: r.name })));

  const ids = new Set(people.map((p) => p.id));
  const children = (id: string | null) => people.filter((p) => (id ? p.managerId === id : !p.managerId || !ids.has(p.managerId)));
  const tree = (id: string | null, depth = 0): ReactNode => {
    const kids = children(id);
    if (!kids.length || depth > 12) return null;
    return (
      <ul className={depth ? "ml-5 border-l border-[var(--ork-rule)] pl-4" : ""}>
        {kids.map((p) => (
          <li key={p.id} className="py-1.5">
            <span className={`inline-flex items-center gap-2 rounded-xl px-2 py-1 ${me?.id === p.id ? "bg-[var(--ork-violet)]/10" : ""}`}>
              <Avatar name={p.name} label={false} /><span className="text-sm"><span className="font-medium">{p.name}</span> <span className="text-xs text-slate-500">{p.position}{p.department ? ` · ${p.department.name}` : ""}</span></span>
            </span>
            {tree(p.id, depth + 1)}
          </li>
        ))}
      </ul>
    );
  };
  const directory = q ? people.filter((p) => [p.name, p.position, p.department?.name, p.email].some((v) => v?.toLowerCase().includes(q))) : [];

  return (
    <>
      <PageHeader title="Equipo" subtitle="Organigrama y directorio de la empresa." />
      {reports.length > 0 && (
        <div className="mb-6 space-y-6">
          <Card title={`Mi equipo (${reports.length})`} padded={false}>
            <Table head={["Colaborador", "Cargo", "Vacaciones disponibles"]}>
              {reports.map((r) => <tr key={r.id}><td className={td}>{r.name}</td><td className={td}>{r.position}</td><td className={`${td} tabular-nums`}>{calcVacationBalance(r.hireDate, r.timeOffRequests).diasDisponibles}</td></tr>)}
            </Table>
          </Card>
          {(pendingOff.length > 0 || pendingOt.length > 0) && (
            <Card title="Por aprobar" padded={false}>
              <Table head={["Colaborador", "Solicitud", "Decisión"]}>
                {pendingOff.map((t) => (
                  <tr key={t.id}>
                    <td className={td}>{t.who}</td>
                    <td className={td}>{TIME_OFF_TYPE[t.type]}{t.subType ? ` · ${PERMIT_SUBTYPE[t.subType]}` : ""}<div className="text-xs text-slate-500">{dday(t.startDate)} → {dday(t.endDate)} · {t.durationDays} día(s)</div>{t.reason && <div className="text-xs italic text-slate-500">“{t.reason}”</div>}{t.fileId && <a href={fileUrl(t.fileId)} target="_blank" className="text-xs text-[var(--ork-violet)] hover:underline">Soporte</a>}</td>
                    <td className={td}><DecisionForm action={decideTimeOffAction} id={t.id} compact extra={t.type === "PERMIT" && <select name="isPaid" defaultValue="yes" className="rounded-md border border-slate-300 px-1 py-1 text-xs"><option value="yes">Remunerado</option><option value="no">No remunerado</option></select>} /></td>
                  </tr>
                ))}
                {pendingOt.map((t) => (
                  <tr key={t.id}>
                    <td className={td}>{t.who}</td>
                    <td className={td}>Horas extras · {t.hours} h {OVERTIME_TYPE[t.overtimeType]}<div className="text-xs text-slate-500">{dday(t.date)} · {t.startTime}–{t.endTime}</div></td>
                    <td className={td}><DecisionForm action={decideOvertimeAction} id={t.id} compact /></td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Organigrama" className="lg:col-span-2">{people.length ? tree(null) : <p className="text-sm text-slate-400">Sin colaboradores.</p>}</Card>
        <Card title="Directorio">
          <form><input name="q" defaultValue={q} placeholder="Buscar persona, cargo o área" className={input} /></form>
          <ul className="mt-3 space-y-2 text-sm">
            {directory.map((p) => <li key={p.id}><p className="font-medium">{p.name}</p><p className="text-xs text-slate-500">{p.position}{p.department ? ` · ${p.department.name}` : ""}</p><p className="text-xs text-slate-500">{[p.email, p.phone].filter(Boolean).join(" · ")}</p></li>)}
            {q && directory.length === 0 && <li className="text-slate-400">Sin resultados.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
