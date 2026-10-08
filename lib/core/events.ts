import { after } from "next/server";
import { prisma } from "./prisma";
import { tenantDb } from "./db";
import type { ExecContext } from "./context";
import { runAutomationsForEvent } from "./automations";
import { enqueueWebhooks, deliverPendingWebhooks } from "./webhooks";
import { runRadarForEvent } from "@/lib/radar/engine";

/** Profundidad máxima de eventos encadenados por automatizaciones. */
const MAX_DEPTH = 3;

/**
 * Publica un evento de dominio (outbox) y lo procesa:
 *  1. Auditoría   2. Automatizaciones / reglas   3. Radar   4. Webhooks
 * Si el procesamiento falla, el evento queda FAILED y `/api/cron/events` lo reintenta.
 */
export async function emitEvent(
  ctx: ExecContext,
  type: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown> = {},
) {
  const depth = ctx.depth ?? 0;
  const event = await ctx.db.domainEvent.create({
    data: { organizationId: ctx.orgId, type, entityType, entityId, actorId: ctx.actorId, payload: { ...payload, _depth: depth } },
  });
  await processEvent(event.id);
  try {
    after(() => deliverPendingWebhooks(ctx.orgId));
  } catch {
    // Fuera de un request (seed, cron): la entrega la hace /api/cron/webhooks.
  }
  return event;
}

export async function processEvent(eventId: string) {
  const event = await prisma.domainEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status === "PROCESSED") return;
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const depth = Number(payload._depth ?? 0);
  const ctx: ExecContext = { orgId: event.organizationId, db: tenantDb(event.organizationId), actorId: event.actorId, depth: depth + 1 };

  try {
    await ctx.db.auditLog.create({
      data: { organizationId: ctx.orgId, actorId: event.actorId, action: event.type, entityType: event.entityType, entityId: event.entityId, changes: payload as object },
    });
    if (depth < MAX_DEPTH) {
      await runAutomationsForEvent(ctx, { ...event, payload });
    }
    await runRadarForEvent(ctx, event.type);
    await enqueueWebhooks(ctx, event);
    await prisma.domainEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date(), error: null } });
  } catch (e) {
    await prisma.domainEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", error: e instanceof Error ? e.message : String(e) },
    });
  }
}

/** Reprocesa eventos pendientes o fallidos (cron / worker). */
export async function processPendingEvents(limit = 100) {
  const pending = await prisma.domainEvent.findMany({
    where: { status: { in: ["PENDING", "FAILED"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  for (const e of pending) await processEvent(e.id);
  return pending.length;
}
