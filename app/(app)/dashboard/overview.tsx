import Link from "@/components/plink";
import type { OrgContext } from "@/lib/core/context";
import { ENTITIES } from "@/lib/core/entities";
import { visibleInsightWhere } from "@/lib/radar/visibility";
import { Badge, Card, SEVERITY_LABEL, SEVERITY_TONE } from "@/components/ui";
import { ago, date } from "@/lib/ui/format";

/** Tablero "Mi día": Radar, aprobaciones y tareas del usuario. */
export async function Overview({ ctx }: { ctx: OrgContext }) {
  const showInsights = ctx.hasModule("radar") && ctx.can("radar.read");
  const [insights, approvals, tasks] = await Promise.all([
    showInsights ? ctx.db.insight.findMany({ where: { ...visibleInsightWhere(ctx), status: "OPEN" }, orderBy: { detectedAt: "desc" }, take: 10 }) : [],
    ctx.db.approval.findMany({ where: { status: "PENDING", ...(ctx.can("approvals.override") ? {} : { requiredRoleKey: ctx.role.key }) }, take: 6, orderBy: { createdAt: "desc" } }),
    ctx.db.task.findMany({ where: { assigneeId: ctx.user.id, status: "OPEN" }, orderBy: { dueDate: "asc" }, take: 8 }),
  ]);
  const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  insights.sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {showInsights && (
        <Card title="Radar · lo que requiere atención" className="xl:col-span-2" padded={false} actions={<Link href="/radar" className="text-xs text-slate-500 hover:text-slate-900">Ver todo</Link>}>
          {insights.length === 0 ? <p className="p-5 text-sm text-slate-400">Sin alertas abiertas.</p> : (
            <ul className="divide-y divide-slate-100">
              {insights.map((i) => (
                <li key={i.id} className="flex gap-3 px-5 py-3">
                  <Badge tone={SEVERITY_TONE[i.severity]}>{SEVERITY_LABEL[i.severity]}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{i.entityType && i.entityId && ENTITIES[i.entityType] ? <Link href={ENTITIES[i.entityType].path(i.entityId)} className="hover:underline">{i.title}</Link> : i.title}</p>
                    <p className="text-xs text-slate-500">→ {i.recommendedAction}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-400">{ago(i.detectedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <div className="space-y-6">
        <Card title="Aprobaciones pendientes" padded={false} actions={<Link href="/approvals" className="text-xs text-slate-500 hover:text-slate-900">Abrir</Link>}>
          {approvals.length === 0 ? <p className="p-5 text-sm text-slate-400">Nada pendiente.</p> : (
            <ul className="divide-y divide-slate-100">{approvals.map((a) => <li key={a.id} className="px-5 py-3 text-sm"><p>{a.reason}</p><p className="text-xs text-slate-400">{a.requiredRoleKey} · {ago(a.createdAt)}</p></li>)}</ul>
          )}
        </Card>
        <Card title="Mis tareas" padded={false} actions={<Link href="/tasks" className="text-xs text-slate-500 hover:text-slate-900">Todas</Link>}>
          {tasks.length === 0 ? <p className="p-5 text-sm text-slate-400">Sin tareas abiertas.</p> : (
            <ul className="divide-y divide-slate-100">{tasks.map((t) => <li key={t.id} className="px-5 py-3 text-sm"><p>{t.title}</p><p className="text-xs text-slate-400">Vence {date(t.dueDate)}</p></li>)}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
