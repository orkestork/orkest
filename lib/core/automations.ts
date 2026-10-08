import type { ExecContext } from "./context";
import { evaluate, type ConditionGroup } from "./conditions";
import { addActivity, interpolate, notify, usersWithRole } from "./notify";
import { getEntity, getEntityOrNull } from "./entities";
import { requestApproval } from "./approvals";
import { applyStatus } from "./workflow";

/**
 * Motor de reglas de negocio y automatizaciones:
 *   WHEN <evento>  IF <condiciones>  THEN <acciones>
 * Las automatizaciones se cargan SIEMPRE con el cliente de la organización del evento,
 * por lo que es imposible ejecutar reglas de una empresa sobre datos de otra.
 */

export type ActionSpec =
  | { type: "NOTIFY"; to: "owner" | "actor" | { role: string } | { user: string }; title: string; body?: string }
  | { type: "CREATE_APPROVAL"; role: string; reason: string; onApproveState?: string; onRejectState?: string }
  | { type: "SET_STATUS"; status: string }
  | { type: "CREATE_TASK"; title: string; assignTo: "owner" | { role: string }; dueInDays?: number }
  | { type: "ADD_ACTIVITY"; content: string }
  | { type: "SET_FIELD"; field: string; value: string }
  | { type: "CREATE_INSIGHT"; severity: string; title: string; recommendedAction?: string }
  | { type: "CREATE_INVOICE"; dueDays?: number }
  | { type: "CONSUME_STOCK" }
  | { type: "CREATE_SALES_ORDER" }
  | { type: "CREATE_RECEIPT" };

export const ACTION_TYPES: { type: ActionSpec["type"]; label: string }[] = [
  { type: "NOTIFY", label: "Notificar" },
  { type: "CREATE_APPROVAL", label: "Crear aprobación" },
  { type: "SET_STATUS", label: "Cambiar estado" },
  { type: "CREATE_TASK", label: "Crear tarea" },
  { type: "ADD_ACTIVITY", label: "Registrar actividad" },
  { type: "SET_FIELD", label: "Asignar campo personalizado" },
  { type: "CREATE_INSIGHT", label: "Generar insight en Radar" },
  { type: "CREATE_SALES_ORDER", label: "Convertir en pedido de venta (cotización)" },
  { type: "CREATE_RECEIPT", label: "Generar recepción (orden de compra)" },
  { type: "CREATE_INVOICE", label: "Emitir factura (pedido o cotización)" },
  { type: "CONSUME_STOCK", label: "Descontar inventario (cotización)" },
];

export type Facts = Record<string, unknown> & { event?: Record<string, unknown> };

type RunInput = { ctx: ExecContext; entityType: string; entityId: string; facts: Facts };

async function resolveUsers(ctx: ExecContext, to: unknown, facts: Facts): Promise<string[]> {
  if (to === "owner") return [String(facts.ownerId ?? "")].filter(Boolean);
  if (to === "actor") return ctx.actorId ? [ctx.actorId] : [];
  if (to && typeof to === "object" && "role" in to) return usersWithRole(ctx, String((to as { role: string }).role));
  if (to && typeof to === "object" && "user" in to) return [String((to as { user: string }).user)];
  return [];
}

export async function runAction(action: ActionSpec, input: RunInput): Promise<string> {
  const { ctx, entityType, entityId, facts } = input;
  const link = getEntityOrNull(entityType)?.path(entityId);
  switch (action.type) {
    case "NOTIFY": {
      const users = await resolveUsers(ctx, action.to, facts);
      const n = await notify(ctx, users, { title: interpolate(action.title, facts), body: action.body && interpolate(action.body, facts), link });
      return `Notificados ${n} usuario(s)`;
    }
    case "CREATE_APPROVAL": {
      await requestApproval(ctx, {
        entityType, entityId, requiredRoleKey: action.role, reason: interpolate(action.reason, facts),
        onApproveState: action.onApproveState, onRejectState: action.onRejectState,
      });
      return `Aprobación solicitada a ${action.role}`;
    }
    case "SET_STATUS": {
      await applyStatus(ctx, entityType, entityId, action.status, "Automatización");
      return `Estado → ${action.status}`;
    }
    case "CREATE_TASK": {
      const [assigneeId] = await resolveUsers(ctx, action.assignTo, facts);
      await ctx.db.task.create({
        data: {
          organizationId: ctx.orgId, title: interpolate(action.title, facts), assigneeId,
          dueDate: action.dueInDays ? new Date(Date.now() + action.dueInDays * 86400000) : null,
          sourceType: entityType, sourceId: entityId,
        },
      });
      return "Tarea creada";
    }
    case "ADD_ACTIVITY": {
      await addActivity(ctx, entityType, entityId, interpolate(action.content, facts));
      return "Actividad registrada";
    }
    case "SET_FIELD": {
      const def = getEntity(entityType);
      if (!def.customizable) return "Entidad sin campos personalizados";
      const current = (facts.customFields ?? {}) as Record<string, unknown>;
      const model = entityModel(ctx, entityType);
      await model.update({ where: { id: entityId }, data: { customFields: { ...current, [action.field]: interpolate(action.value, facts) } } });
      return `Campo ${action.field} asignado`;
    }
    case "CREATE_INSIGHT": {
      const title = interpolate(action.title, facts);
      await ctx.db.insight.upsert({
        where: { organizationId_fingerprint: { organizationId: ctx.orgId, fingerprint: `automation:${entityType}:${entityId}:${title}` } },
        update: { status: "OPEN" },
        create: {
          organizationId: ctx.orgId, detectorKey: "automation", kind: "PENDING_ACTION", severity: action.severity,
          title, entityType, entityId, recommendedAction: action.recommendedAction,
          responsibleUserId: (facts.ownerId as string) ?? null,
          fingerprint: `automation:${entityType}:${entityId}:${title}`,
        },
      });
      return "Insight generado";
    }
    case "CREATE_INVOICE": {
      if (entityType === "sales_order") {
        const { invoiceFromSalesOrder } = await import("@/lib/apps/invoicing");
        return `Factura ${(await invoiceFromSalesOrder(ctx, entityId)).number} emitida`;
      }
      if (entityType !== "quote") return "Solo aplica a pedidos o cotizaciones";
      const { invoiceFromQuote } = await import("@/lib/apps/sales");
      const inv = await invoiceFromQuote(ctx, entityId, action.dueDays ?? 30);
      return `Factura ${inv.number} emitida`;
    }
    case "CREATE_SALES_ORDER": {
      if (entityType !== "quote") return "Solo aplica a cotizaciones";
      const { salesOrderFromQuote } = await import("@/lib/apps/sales-orders");
      return `Pedido ${(await salesOrderFromQuote(ctx, entityId)).number} creado`;
    }
    case "CREATE_RECEIPT": {
      if (entityType !== "purchase_order") return "Solo aplica a órdenes de compra";
      const { createReceipt } = await import("@/lib/apps/purchasing");
      const t = await createReceipt(ctx, entityId);
      return t ? `Recepción ${t.number} generada` : "Nada por recibir";
    }
    case "CONSUME_STOCK": {
      if (entityType !== "quote") return "Solo aplica a cotizaciones";
      const { quickMove } = await import("@/lib/apps/stock");
      const lines = await ctx.db.quote.findUniqueOrThrow({ where: { id: entityId }, include: { lines: true } });
      let n = 0;
      for (const l of lines.lines) {
        if (!l.productId) continue;
        await quickMove(ctx, l.productId, "OUT", Number(l.quantity), `Pedido ${lines.number}`);
        n++;
      }
      return `Inventario descontado en ${n} producto(s)`;
    }
  }
}

/** Acceso genérico al delegate de Prisma de una entidad personalizable. */
function entityModel(ctx: ExecContext, entityType: string) {
  const map: Record<string, unknown> = {
    customer: ctx.db.customer, contact: ctx.db.contact, opportunity: ctx.db.opportunity, quote: ctx.db.quote,
    product: ctx.db.product, supplier: ctx.db.supplier, nonconformity: ctx.db.nonconformity, employee: ctx.db.employee,
  };
  const m = map[entityType];
  if (!m) throw new Error(`Sin modelo para ${entityType}`);
  return m as { update(args: { where: { id: string }; data: { customFields: object } }): Promise<unknown> };
}

export async function runActions(actions: ActionSpec[], input: RunInput): Promise<string[]> {
  const out: string[] = [];
  for (const a of actions) out.push(await runAction(a, input));
  return out;
}

/** Ejecuta las automatizaciones de la organización suscritas a un evento. */
export async function runAutomationsForEvent(
  ctx: ExecContext,
  event: { id: string; type: string; entityType: string; entityId: string; payload: Record<string, unknown> },
) {
  const automations = await ctx.db.automation.findMany({
    where: { trigger: event.type, enabled: true },
    orderBy: { priority: "asc" },
  });
  if (automations.length === 0) return;

  const def = getEntityOrNull(event.entityType);
  const entity = def ? await def.load(ctx.db, event.entityId) : null;
  const facts: Facts = { ...(entity ?? {}), event: event.payload };

  for (const auto of automations) {
    const matched = evaluate(auto.conditions as ConditionGroup, facts);
    let result: string[] = [];
    let error: string | undefined;
    if (matched) {
      try {
        result = await runActions(auto.actions as ActionSpec[], { ctx, entityType: event.entityType, entityId: event.entityId, facts });
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    await ctx.db.automationRun.create({
      data: { organizationId: ctx.orgId, automationId: auto.id, eventId: event.id, matched, result, error },
    });
    if (matched) {
      await ctx.db.automation.update({ where: { id: auto.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } });
    }
  }
}
