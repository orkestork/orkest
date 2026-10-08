import { requirePermission } from "@/lib/core/context";
import { orgUsers } from "@/lib/core/members";
import { Card, PageHeader, Table, td } from "@/components/ui";
import { dateTime } from "@/lib/ui/format";

export const metadata = { title: "Auditoría" };

export default async function Audit() {
  const ctx = await requirePermission("audit.read");
  const [logs, users] = await Promise.all([ctx.db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }), orgUsers(ctx)]);
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Auditoría" subtitle="Toda acción relevante y todo evento de dominio queda registrado para esta organización." />
      <Card padded={false}>
        <Table head={["Fecha", "Usuario", "Acción", "Entidad", "Detalle"]} empty={logs.length === 0}>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className={`${td} whitespace-nowrap text-xs`}>{dateTime(l.createdAt)}</td>
              <td className={td}>{l.actorId ? userMap.get(l.actorId) ?? "API" : "ORKEST"}</td>
              <td className={`${td} font-mono text-xs`}>{l.action}</td>
              <td className={`${td} text-xs`}>{l.entityType}{l.entityId ? ` · ${l.entityId.slice(-6)}` : ""}</td>
              <td className={`${td} max-w-sm truncate font-mono text-[11px] text-slate-500`}>{JSON.stringify(l.changes)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
