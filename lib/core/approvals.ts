import type { ExecContext, OrgContext } from "./context";
import { emitEvent } from "./events";
import { addActivity, notify, usersWithRole } from "./notify";
import { applyStatus } from "./workflow";
import { ENTITIES, getEntityOrNull } from "./entities";
import { runActions, type ActionSpec } from "./automations";

export async function requestApproval(
  ctx: ExecContext,
  a: { entityType: string; entityId: string; requiredRoleKey: string; reason: string; onApproveState?: string; onRejectState?: string; transitionId?: string },
) {
  const existing = await ctx.db.approval.findFirst({
    where: { entityType: a.entityType, entityId: a.entityId, status: "PENDING", requiredRoleKey: a.requiredRoleKey },
  });
  if (existing) return existing;
  const approval = await ctx.db.approval.create({
    data: { organizationId: ctx.orgId, ...a, requestedById: ctx.actorId },
  });
  await addActivity(ctx, a.entityType, a.entityId, `Aprobación solicitada a ${a.requiredRoleKey}: ${a.reason}`);
  await notify(ctx, await usersWithRole(ctx, a.requiredRoleKey), {
    title: "Aprobación requerida",
    body: a.reason,
    link: "/approvals",
  });
  await emitEvent(ctx, "ApprovalRequested", "approval", approval.id, { entityType: a.entityType, entityId: a.entityId, role: a.requiredRoleKey });
  return approval;
}

export function canDecide(ctx: OrgContext, requiredRoleKey: string) {
  return ctx.role.key === requiredRoleKey || ctx.can("approvals.override");
}

export async function decideApproval(ctx: OrgContext, approvalId: string, approve: boolean, comment?: string) {
  const approval = await ctx.db.approval.findUnique({ where: { id: approvalId } });
  if (!approval || approval.status !== "PENDING") throw new Error("Aprobación no disponible");
  if (!canDecide(ctx, approval.requiredRoleKey)) throw new Error(`Solo ${approval.requiredRoleKey} puede decidir esta aprobación`);

  await ctx.db.approval.update({
    where: { id: approval.id },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedById: ctx.user.id, decidedAt: new Date(), comment },
  });
  await addActivity(ctx, approval.entityType, approval.entityId,
    `${approve ? "Aprobado" : "Rechazado"} por ${ctx.user.name}${comment ? `: ${comment}` : ""}`);

  const nextState = approve ? approval.onApproveState : approval.onRejectState;
  if (nextState && getEntityOrNull(approval.entityType)?.setStatus) {
    await applyStatus(ctx, approval.entityType, approval.entityId, nextState, approve ? "Aprobación" : "Rechazo");
  }
  // Al aprobar, se ejecutan las acciones configuradas en la transición original (p.ej. crear recepción)
  if (approve && approval.transitionId) {
    const t = await ctx.db.workflowTransition.findUnique({ where: { id: approval.transitionId } });
    const actions = (t?.actions ?? []) as ActionSpec[];
    if (actions.length) {
      const facts = (await getEntityOrNull(approval.entityType)?.load(ctx.db, approval.entityId)) ?? {};
      await runActions(actions, { ctx, entityType: approval.entityType, entityId: approval.entityId, facts });
    }
  }
  if (approval.requestedById) {
    await notify(ctx, [approval.requestedById], {
      title: approve ? "Solicitud aprobada" : "Solicitud rechazada",
      body: approval.reason,
      link: getEntityOrNull(approval.entityType)?.path(approval.entityId),
    });
  }
  await emitEvent(ctx, "ApprovalDecided", "approval", approval.id, { approved: approve, entityType: approval.entityType, entityId: approval.entityId });
}
