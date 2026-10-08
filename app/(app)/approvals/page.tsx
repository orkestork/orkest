import Link from "@/components/plink";
import { requireContext } from "@/lib/core/context";
import { canDecide } from "@/lib/core/approvals";
import { ENTITIES } from "@/lib/core/entities";
import { orgUsers } from "@/lib/core/members";
import { ActionForm } from "@/components/action-form";
import { Badge, btn, Card, PageHeader } from "@/components/ui";
import { ago, dateTime } from "@/lib/ui/format";
import { decideApprovalAction } from "../entity-actions";

export const metadata = { title: "Aprobaciones" };

export default async function Approvals() {
  const ctx = await requireContext();
  const [pending, history, users] = await Promise.all([
    ctx.db.approval.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    ctx.db.approval.findMany({ where: { status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 15 }),
    orgUsers(ctx),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const visible = (a: { entityType: string }) => { const e = ENTITIES[a.entityType]; return !e || (ctx.hasModule(e.module) && ctx.can(e.readPermission)); };
  const link = (a: { entityType: string; entityId: string }) => ENTITIES[a.entityType]?.path(a.entityId) ?? "#";

  return (
    <>
      <PageHeader title="Aprobaciones" subtitle={`Tu rol: ${ctx.role.name} (${ctx.role.key}). Solo puedes decidir las que exigen tu rol.`} />
      <div className="space-y-3">
        {pending.filter(visible).map((a) => (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium"><Link href={link(a)} className="hover:underline">{a.reason}</Link></p>
                <p className="text-xs text-slate-500">Requiere: <Badge tone="amber">{a.requiredRoleKey}</Badge> · solicitado por {a.requestedById ? userMap.get(a.requestedById) : "ORKEST"} · {ago(a.createdAt)}</p>
              </div>
              {canDecide(ctx, a.requiredRoleKey) ? (
                <ActionForm action={decideApprovalAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="approvalId" value={a.id} />
                  <input name="comment" placeholder="Comentario (opcional)" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                  <button name="decision" value="reject" className={btn.danger}>Rechazar</button>
                  <button name="decision" value="approve" className={btn.primary}>Aprobar</button>
                </ActionForm>
              ) : <Badge>Esperando a {a.requiredRoleKey}</Badge>}
            </div>
          </Card>
        ))}
        {pending.filter(visible).length === 0 && <p className="py-6 text-center text-sm text-slate-400">No hay aprobaciones pendientes.</p>}
      </div>
      <h2 className="mb-3 mt-10 text-sm font-semibold text-slate-700">Historial</h2>
      <Card padded={false}>
        <ul className="divide-y divide-slate-100 text-sm">
          {history.filter(visible).map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5">
              <Link href={link(a)} className="hover:underline">{a.reason}</Link>
              <span className="text-xs text-slate-500"><Badge tone={a.status === "APPROVED" ? "emerald" : "rose"}>{a.status === "APPROVED" ? "Aprobada" : "Rechazada"}</Badge> {a.decidedById && userMap.get(a.decidedById)} · {dateTime(a.decidedAt)}</span>
            </li>
          ))}
          {history.length === 0 && <li className="px-5 py-4 text-slate-400">Sin historial.</li>}
        </ul>
      </Card>
    </>
  );
}
