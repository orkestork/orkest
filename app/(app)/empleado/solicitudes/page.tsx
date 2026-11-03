import NextLink from "next/link";
import { btn, Card, PageHeader, Table, td } from "@/components/ui";
import { isTicketOverdue } from "@/lib/apps/hr";
import { dateTime } from "@/lib/ui/format";
import { TICKET_PRIORITY, TICKET_STATUS } from "@/lib/ui/hr-labels";
import { Pill } from "../../hr/_ui";
import { NoProfile, portal } from "../_me";

export const metadata = { title: "Mis solicitudes" };

export default async function MyTickets() {
  const { ctx, me } = await portal();
  if (!me) return <NoProfile title="Centro de solicitudes" />;
  const include = { category: { select: { name: true } }, employee: { select: { name: true } } };
  const [mine, assigned] = await Promise.all([
    ctx.db.hrTicket.findMany({ where: { employeeId: me.id }, include, orderBy: { createdAt: "desc" } }),
    ctx.db.hrTicket.findMany({ where: { responsibleId: ctx.user.id, status: { notIn: ["FINALIZADO", "CANCELADO"] } }, include, orderBy: { dueDate: "asc" } }),
  ]);
  const table = (rows: typeof mine, who: boolean) => (
    <Table head={["Código", "Asunto", ...(who ? ["Solicitante"] : []), "Categoría", "Prioridad", "Límite", "Estado"]} empty={rows.length === 0}>
      {rows.map((t) => (
        <tr key={t.id}>
          <td className={`${td} font-mono text-xs`}><NextLink href={`/empleado/solicitudes/${t.id}`} className="hover:underline">{t.code}</NextLink></td>
          <td className={td}><NextLink href={`/empleado/solicitudes/${t.id}`} className="font-medium hover:underline">{t.subject}</NextLink></td>
          {who && <td className={td}>{t.employee.name}</td>}
          <td className={td}>{t.category.name}</td>
          <td className={td}><Pill map={TICKET_PRIORITY} value={t.priority} /></td>
          <td className={`${td} whitespace-nowrap text-xs ${isTicketOverdue(t) ? "font-medium text-[var(--ork-pink)]" : ""}`}>{dateTime(t.dueDate)}</td>
          <td className={td}><Pill map={TICKET_STATUS} value={t.status} /></td>
        </tr>
      ))}
    </Table>
  );
  return (
    <>
      <PageHeader title="Centro de solicitudes" subtitle="Pide soporte, materiales, mantenimiento o lo que necesites a las áreas de la empresa y sigue su avance."
        actions={<NextLink href="/empleado/solicitudes/new" className={btn.primary}>Nueva solicitud</NextLink>} />
      <div className="space-y-6">
        {assigned.length > 0 && <Card title={`Asignadas a mí (${assigned.length})`} padded={false}>{table(assigned, true)}</Card>}
        <Card title="Mis solicitudes" padded={false}>{table(mine, false)}</Card>
      </div>
    </>
  );
}
