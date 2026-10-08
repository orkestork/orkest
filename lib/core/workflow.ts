import type { ExecContext, OrgContext } from "./context";
import type { TenantDb } from "./db";
import { evaluate, type ConditionGroup } from "./conditions";
import { getEntity } from "./entities";
import { addActivity } from "./notify";
import { emitEvent } from "./events";
import { requestApproval } from "./approvals";
import { runActions, type ActionSpec } from "./automations";

/**
 * Workflow Engine: STATES · TRANSITIONS · CONDITIONS · ACTIONS · APPROVALS
 * Los workflows viven en BD por organización (configurables desde Studio).
 * Ningún componente decide qué transición es válida: lo decide este motor.
 */
export type TransitionApproval = { when?: ConditionGroup; role: string; pendingState: string; reason?: string };

export async function getWorkflow(db: TenantDb, entityType: string) {
  return db.workflow.findFirst({
    where: { entityType, isDefault: true },
    include: {
      states: { orderBy: { position: "asc" } },
      transitions: { orderBy: { position: "asc" } },
    },
  });
}

export type LoadedWorkflow = NonNullable<Awaited<ReturnType<typeof getWorkflow>>>;

export function initialState(wf: LoadedWorkflow | null, fallback: string) {
  return wf?.states.find((s) => s.isInitial)?.key ?? fallback;
}

const statusChangedEvent = (entityType: string) =>
  `${entityType.charAt(0).toUpperCase()}${entityType.slice(1)}StatusChanged`;

/** Cambia el estado de una entidad y publica los eventos asociados. */
export async function applyStatus(ctx: ExecContext, entityType: string, entityId: string, status: string, source: string) {
  const def = getEntity(entityType);
  if (!def.setStatus) throw new Error(`${def.label} no tiene estados`);
  const current = await def.load(ctx.db, entityId);
  if (!current) throw new Error(`${def.label} no encontrado`);
  const from = String(current.status ?? "");
  if (from === status) return;

  await def.setStatus(ctx.db, entityId, status);
  const wf = await getWorkflow(ctx.db, entityType);
  const label = (k: string) => wf?.states.find((x) => x.key === k)?.label ?? k;
  await addActivity(ctx, entityType, entityId, `Estado: ${label(from)} → ${label(status)} · ${source}`, "TRACKING");
  await emitEvent(ctx, statusChangedEvent(entityType), entityType, entityId, { from, to: status });
  const specific = def.statusEvents?.[status];
  if (specific) await emitEvent(ctx, specific, entityType, entityId, { from, to: status });
}

export type AvailableTransition = {
  id: string; label: string; toKey: string; requiresApproval: boolean; approvalRole?: string;
};

export async function availableTransitions(ctx: OrgContext, entityType: string, entity: Record<string, unknown>) {
  const wf = await getWorkflow(ctx.db, entityType);
  if (!wf) return { workflow: null, transitions: [] as AvailableTransition[] };
  const transitions = wf.transitions
    .filter((t) => t.fromKey === entity.status || t.fromKey === "*")
    .filter((t) => !t.permission || ctx.can(t.permission))
    .filter((t) => evaluate(t.guard as ConditionGroup | null, entity))
    .map((t) => {
      const ap = t.approval as TransitionApproval | null;
      const requiresApproval = !!ap && evaluate(ap.when, entity);
      return { id: t.id, label: t.label, toKey: t.toKey, requiresApproval, approvalRole: requiresApproval ? ap!.role : undefined };
    });
  return { workflow: wf, transitions };
}

export async function executeTransition(ctx: OrgContext, entityType: string, entityId: string, transitionId: string) {
  const def = getEntity(entityType);
  const entity = await def.load(ctx.db, entityId);
  if (!entity) throw new Error(`${def.label} no encontrado`);

  const wf = await getWorkflow(ctx.db, entityType);
  const t = wf?.transitions.find((x) => x.id === transitionId);
  if (!wf || !t) throw new Error("Transición no existe");
  if (t.fromKey !== "*" && t.fromKey !== entity.status) throw new Error("La transición no aplica al estado actual");
  if (t.permission && !ctx.can(t.permission)) throw new Error(`Permiso requerido: ${t.permission}`);
  // Alcance "solo sus registros" en ventas
  if ((entityType === "quote" || entityType === "sales_order") && ctx.restricted("scope:own:sales") && entity.ownerId !== ctx.user.id) throw new Error(`${def.label} no encontrado`);
  if (!evaluate(t.guard as ConditionGroup | null, entity)) throw new Error("No se cumplen las condiciones de la transición");

  const ap = t.approval as TransitionApproval | null;
  if (ap && evaluate(ap.when, entity)) {
    await applyStatus(ctx, entityType, entityId, ap.pendingState, `Solicitud: ${t.label}`);
    await requestApproval(ctx, {
      entityType, entityId, requiredRoleKey: ap.role,
      reason: ap.reason ?? `${def.label} ${def.title(entity)} requiere aprobación para "${t.label}"`,
      onApproveState: t.toKey, onRejectState: String(entity.status), transitionId: t.id,
    });
    return { pendingApproval: true };
  }

  await applyStatus(ctx, entityType, entityId, t.toKey, t.label);
  const actions = (t.actions ?? []) as ActionSpec[];
  if (actions.length) {
    const fresh = (await def.load(ctx.db, entityId)) ?? entity;
    await runActions(actions, { ctx, entityType, entityId, facts: fresh });
  }
  return { pendingApproval: false };
}
