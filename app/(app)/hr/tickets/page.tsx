import NextLink from "next/link";
import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { prisma } from "@/lib/core/prisma";
import { Badge, btn, Card, input, PageHeader, Table, td } from "@/components/ui";
import { isTicketOverdue } from "@/lib/apps/hr";
import { dateTime } from "@/lib/ui/format";
import { TICKET_PRIORITY, TICKET_STATUS, optsT } from "@/lib/ui/hr-labels";
import { Kpi, Pill, Select, Tabs } from "../_ui";

export const metadata = { title: "Centro de solicitudes" };

export default async function Tickets({ searchParams }: PageProps<"/hr/tickets">) {
  const ctx = await requireModule("hr", "hr.tickets.read");
  const sp = await searchParams;
  const status = String(sp.status ?? "OPEN");
  const category = String(sp.category ?? "");
  const q = String(sp.q ?? "").trim();
  const mine = sp.mine === "1";
  const [tickets, categories, all] = await Promise.all([
    ctx.db.hrTicket.findMany({
      where: {
        ...(status === "OPEN" ? { status: { notIn: ["FINALIZADO", "CANCELADO"] } } : status ? { status } : {}),
        ...(category ? { categoryId: category } : {}),
        ...(mine ? { responsibleId: ctx.user.id } : {}),
        ...(q ? { OR: [{ subject: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { employee: { name: { contains: q, mode: "insensitive" } } }] } : {}),
      },
      include: { category: { select: { name: true } }, employee: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 500,
    }),
    ctx.db.hrRequestCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.db.hrTicket.findMany({ where: { status: { notIn: ["FINALIZADO", "CANCELADO"] } }, select: { status: true, dueDate: true, responsibleId: true } }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(tickets.map((t) => t.responsibleId).filter(Boolean) as string[])] } }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Centro de solicitudes" subtitle="Solicitudes internas de los colaboradores con responsable, prioridad y tiempo de respuesta (SLA)."
        actions={<Link href="/empleado/solicitudes/new" className={btn.secondary}>Crear solicitud</Link>} />
      <Tabs active="/hr/tickets" items={[{ label: "Solicitudes", href: "/hr/tickets" }, { label: "Categorías", href: "/hr/tickets/categories" }]} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Abiertas" value={all.length} />
        <Kpi label="Sin asignar" value={all.filter((t) => !t.responsibleId).length} />
        <Kpi label="Vencidas" value={all.filter((t) => isTicketOverdue(t)).length} tone={all.some((t) => isTicketOverdue(t)) ? "warn" : undefined} />
        <Kpi label="Asignadas a mí" value={all.filter((t) => t.responsibleId === ctx.user.id).length} />
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar asunto, código o solicitante" className={`${input} max-w-xs`} />
        <Select name="status" defaultValue={status} options={[{ value: "OPEN", label: "Abiertas" }, ...optsT(TICKET_STATUS), { value: "", label: "Todas" }]} className="max-w-44" />
        <Select name="category" defaultValue={category} empty="Todas las categorías" options={categories.map((c) => ({ value: c.id, label: c.name }))} className="max-w-52" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={mine} /> Asignadas a mí</label>
        <button className={btn.secondary}>Filtrar</button>
      </form>
      <Card padded={false}>
        <Table head={["Código", "Asunto", "Solicitante", "Categoría", "Prioridad", "Responsable", "Límite", "Estado"]} empty={tickets.length === 0}>
          {tickets.map((t) => (
            <tr key={t.id}>
              <td className={`${td} font-mono text-xs`}><NextLink href={`/hr/tickets/${t.id}`} className="hover:underline">{t.code}</NextLink></td>
              <td className={td}><NextLink href={`/hr/tickets/${t.id}`} className="font-medium hover:underline">{t.subject}</NextLink></td>
              <td className={td}>{t.employee.name}</td>
              <td className={td}>{t.category.name}</td>
              <td className={td}><Pill map={TICKET_PRIORITY} value={t.priority} /></td>
              <td className={td}>{users.find((u) => u.id === t.responsibleId)?.name ?? <span className="text-slate-400">Sin asignar</span>}</td>
              <td className={`${td} whitespace-nowrap text-xs`}>{isTicketOverdue(t) ? <Badge tone="rose">{dateTime(t.dueDate)}</Badge> : dateTime(t.dueDate)}</td>
              <td className={td}><Pill map={TICKET_STATUS} value={t.status} /></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
