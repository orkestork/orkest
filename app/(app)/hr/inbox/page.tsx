import NextLink from "next/link";
import type { ReactNode } from "react";
import { requireModule } from "@/lib/core/context";
import { Badge, Card, Empty, PageHeader, Table, td } from "@/components/ui";
import { fileUrl } from "@/lib/core/files";
import { ago } from "@/lib/ui/format";
import { INCAPACITY_TYPE, OVERTIME_TYPE, PERMIT_SUBTYPE, TIME_OFF_TYPE } from "@/lib/ui/hr-labels";
import { decideBenefitAction, decideCertificateAction, decideOvertimeAction, decideTimeOffAction } from "../actions";
import { dday, DecisionForm, Tabs } from "../_ui";

export const metadata = { title: "Bandeja de aprobación" };

type Item = { id: string; kind: string; employee: { id: string; name: string }; createdAt: Date; detail: ReactNode; decide: ReactNode };

/** Todo lo pendiente de aprobar en un solo lugar, de todos los tipos de solicitud. */
export default async function Inbox({ searchParams }: PageProps<"/hr/inbox">) {
  const ctx = await requireModule("hr", "hr.approve");
  const kind = String((await searchParams).kind ?? "");
  const emp = { select: { id: true, name: true } };
  const [timeOff, overtime, benefits, certs] = await Promise.all([
    ctx.db.timeOffRequest.findMany({ where: { status: "PENDING" }, include: { employee: emp }, orderBy: { createdAt: "asc" } }),
    ctx.db.overtimeRequest.findMany({ where: { status: "PENDING" }, include: { employee: emp }, orderBy: { createdAt: "asc" } }),
    ctx.db.benefitRequest.findMany({ where: { status: "PENDING" }, include: { employee: emp, benefit: true }, orderBy: { createdAt: "asc" } }),
    ctx.can("hr.payroll.write") ? ctx.db.certificateRequest.findMany({ where: { status: "PENDING" }, include: { employee: emp }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
  ]);
  const items: Item[] = [
    ...timeOff.map((r) => ({
      id: r.id, kind: "Ausencia", employee: r.employee, createdAt: r.createdAt,
      detail: <>
        <span className="font-medium">{TIME_OFF_TYPE[r.type]}</span>{r.subType && ` · ${PERMIT_SUBTYPE[r.subType]}`}{r.incapacityType && ` · ${INCAPACITY_TYPE[r.incapacityType]}`}
        <div className="text-xs text-slate-500">{dday(r.startDate)}{r.subType === "HORAS" ? ` · ${r.startTime}–${r.endTime} (${r.hours} h)` : ` → ${dday(r.endDate)} · ${r.durationDays} día(s)`}</div>
        {r.reason && <div className="text-xs italic text-slate-500">“{r.reason}”</div>}
        {r.fileId && <a href={fileUrl(r.fileId)} target="_blank" className="text-xs text-[var(--ork-violet)] hover:underline">Ver soporte</a>}
      </>,
      decide: <DecisionForm action={decideTimeOffAction} id={r.id} compact extra={r.type === "PERMIT" && (
        <select name="isPaid" defaultValue="yes" className="rounded-md border border-slate-300 px-1 py-1 text-xs"><option value="yes">Remunerado</option><option value="no">No remunerado</option></select>
      )} />,
    })),
    ...overtime.map((r) => ({
      id: r.id, kind: "Horas extras", employee: r.employee, createdAt: r.createdAt,
      detail: <><span className="font-medium">{r.hours} h · {OVERTIME_TYPE[r.overtimeType]}</span><div className="text-xs text-slate-500">{dday(r.date)} · {r.startTime}–{r.endTime}</div>{r.reason && <div className="text-xs italic text-slate-500">“{r.reason}”</div>}</>,
      decide: <DecisionForm action={decideOvertimeAction} id={r.id} compact />,
    })),
    ...benefits.map((r) => ({
      id: r.id, kind: "Beneficio", employee: r.employee, createdAt: r.createdAt,
      detail: <><span className="font-medium">{r.benefit.title}</span>{r.note && <div className="text-xs italic text-slate-500">“{r.note}”</div>}</>,
      decide: <DecisionForm action={decideBenefitAction} id={r.id} compact />,
    })),
    ...certs.map((r) => ({
      id: r.id, kind: "Certificado", employee: r.employee, createdAt: r.createdAt,
      detail: <><span className="font-medium">Certificado laboral</span><div className="text-xs text-slate-500">{r.includeSalary ? "Con salario" : "Sin salario"}{r.addressee ? ` · Dirigido a ${r.addressee}` : ""}</div></>,
      decide: <DecisionForm action={decideCertificateAction} id={r.id} compact />,
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const kinds = ["Ausencia", "Horas extras", "Beneficio", "Certificado"];
  const shown = kind ? items.filter((i) => i.kind === kind) : items;
  return (
    <>
      <PageHeader title="Bandeja de aprobación" subtitle="Todo lo pendiente de aprobar en un solo lugar, de todos los tipos de solicitud. Lo más antiguo primero." />
      <Tabs active={kind ? `/hr/inbox?kind=${encodeURIComponent(kind)}` : "/hr/inbox"} items={[
        { label: "Todo", href: "/hr/inbox", count: items.length },
        ...kinds.map((k) => ({ label: k, href: `/hr/inbox?kind=${encodeURIComponent(k)}`, count: items.filter((i) => i.kind === k).length })),
      ]} />
      {shown.length === 0 ? <Empty title="Nada pendiente con estos filtros.">Cuando un colaborador envíe una solicitud aparecerá aquí.</Empty> : (
        <Card padded={false}>
          <Table head={["Colaborador", "Solicitud", "Detalle", "Esperando", "Decisión"]}>
            {shown.map((i) => (
              <tr key={`${i.kind}-${i.id}`}>
                <td className={td}><NextLink href={`/hr/employees/${i.employee.id}`} className="font-medium hover:underline">{i.employee.name}</NextLink></td>
                <td className={td}><Badge tone="violet">{i.kind}</Badge></td>
                <td className={td}>{i.detail}</td>
                <td className={`${td} whitespace-nowrap text-xs text-slate-500`}>{ago(i.createdAt)}</td>
                <td className={td}>{i.decide}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
