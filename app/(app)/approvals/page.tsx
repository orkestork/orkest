import Link from "@/components/plink";
import { requireContext } from "@/lib/core/context";
import { canDecide } from "@/lib/core/approvals";
import { ENTITIES } from "@/lib/core/entities";
import { orgPeople } from "@/lib/core/members";
import { ActionForm } from "@/components/action-form";
import { Badge, btn, Card, PageHeader } from "@/components/ui";
import { ago, dateTime, money } from "@/lib/ui/format";
import { decideApprovalAction } from "../entity-actions";

export const metadata = { title: "Aprobaciones" };

export default async function Approvals() {
  const ctx = await requireContext();
  const [pending, history, users, roles] = await Promise.all([
    ctx.db.approval.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    ctx.db.approval.findMany({ where: { status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 15 }),
    orgPeople(ctx), ctx.db.role.findMany({ select: { key: true, name: true } }),
  ]);
  const roleName = (k: string) => roles.find((r) => r.key === k)?.name ?? k;
  // Documento de cada aprobación pendiente: número, contraparte, monto y líneas, para decidir sin abrirlo
  type Doc = { title: string; party?: string; total?: number; currency?: string; lines: { description: string; quantity: number; total: number }[]; notes?: string };
  const docs = new Map<string, Doc | null>(await Promise.all(pending.map(async (a) => {
    const def = ENTITIES[a.entityType];
    const r = def ? await def.load(ctx.db, a.entityId).catch(() => null) : null;
    if (!def || !r) return [a.id, null] as const;
    const party = (r.supplier as { name?: string } | undefined)?.name ?? (r.customer as { name?: string } | undefined)?.name ?? (typeof r.area === "string" ? `Área: ${r.area}` : undefined);
    const lines = Array.isArray(r.lines) ? (r.lines as Record<string, unknown>[]).filter((l) => !l.kind || l.kind === "PRODUCT").map((l) => ({ description: String(l.description ?? ""), quantity: Number(l.quantity ?? 0), total: Number(l.total ?? l.subtotal ?? 0) })) : [];
    return [a.id, { title: def.title(r), party, total: r.total !== undefined ? Number(r.total) : undefined, currency: typeof r.currency === "string" ? r.currency : undefined, lines, notes: typeof r.notes === "string" ? r.notes : undefined }] as const;
  })));
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const visible = (a: { entityType: string }) => { const e = ENTITIES[a.entityType]; return !e || (ctx.hasModule(e.module) && ctx.can(e.readPermission)); };
  const link = (a: { entityType: string; entityId: string }) => ENTITIES[a.entityType]?.path(a.entityId) ?? "#";

  return (
    <>
      <PageHeader title="Aprobaciones" subtitle={`Operaciones que esperan visto bueno antes de continuar. Tu rol: ${ctx.role.name}${ctx.can("approvals.override") ? " — puedes decidir todas" : " — solo decides las de tu rol"}.`} />
      <div className="space-y-3">
        {pending.filter(visible).map((a) => (
          <Card key={a.id}>
            {(() => { const d = docs.get(a.id); return (
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link href={link(a)} className="font-display text-xl uppercase tracking-tight text-[var(--ork-purple)] hover:underline">{d?.title ?? a.reason}</Link>
                  {d?.total !== undefined && <span className="text-lg font-semibold tabular-nums">{money(d.total, d.currency)}</span>}
                  {d?.party && <span className="text-sm text-slate-600">{d.party}</span>}
                </div>
                <p className="mt-1 text-sm text-slate-700">{a.reason}</p>
                <p className="mt-1 text-xs text-slate-500">Debe aprobar: <Badge tone="amber">{roleName(a.requiredRoleKey)}</Badge> · solicitado por <b>{a.requestedById ? userMap.get(a.requestedById) ?? "—" : "ORKEST"}</b> · {ago(a.createdAt)}</p>
                {d && d.lines.length > 0 && (
                  <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                    {d.lines.slice(0, 5).map((l, i) => (
                      <li key={i} className="flex justify-between gap-3 px-3 py-1.5"><span className="truncate">{l.description}</span><span className="shrink-0 tabular-nums text-slate-600">{l.quantity.toLocaleString("es-CO")} · {money(l.total, d.currency)}</span></li>
                    ))}
                    {d.lines.length > 5 && <li className="px-3 py-1.5 text-xs text-slate-500">y {d.lines.length - 5} línea(s) más…</li>}
                  </ul>
                )}
                {d?.notes && <p className="mt-2 text-xs italic text-slate-500">Nota: {d.notes}</p>}
              </div>
              {canDecide(ctx, a.requiredRoleKey) ? (
                <ActionForm action={decideApprovalAction} className="flex flex-col gap-2 lg:w-64">
                  <input type="hidden" name="approvalId" value={a.id} />
                  <textarea name="comment" rows={2} placeholder="Comentario (opcional)" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                  <div className="flex gap-2">
                    <button name="decision" value="reject" className={`${btn.danger} flex-1`}>Rechazar</button>
                    <button name="decision" value="approve" className={`${btn.primary} flex-1`}>Aprobar</button>
                  </div>
                  <Link href={link(a)} className="text-center text-xs text-[var(--ork-violet)] hover:underline">Abrir documento completo →</Link>
                </ActionForm>
              ) : <Badge>Esperando a {roleName(a.requiredRoleKey)}</Badge>}
            </div>
            ); })()}
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
