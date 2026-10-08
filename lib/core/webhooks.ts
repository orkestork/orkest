import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import type { ExecContext } from "./context";
import { webhookName } from "./event-catalog";

/**
 * Webhook Platform
 *  - Suscripción por organización con patrones: "quote.created", "invoice.*", "*"
 *  - Firma HMAC-SHA256:  X-Orkest-Signature: t=<unix>,v1=<hex(hmac(secret, t + "." + body))>
 *  - Idempotencia:       X-Orkest-Idempotency-Key = <eventId>:<endpointId> (única por entrega)
 *  - Reintentos con backoff exponencial; tras MAX_ATTEMPTS la entrega queda DEAD.
 */
const MAX_ATTEMPTS = 6;
const BACKOFF_SECONDS = [0, 30, 120, 600, 3600, 6 * 3600];

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("hex")}`;

export function matchesEvent(patterns: string[], name: string) {
  return patterns.some((p) => p === "*" || p === name || (p.endsWith(".*") && name.startsWith(p.slice(0, -1))));
}

export function sign(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { header: `t=${timestamp},v1=${v1}`, timestamp, v1 };
}

/** Para receptores: verifica firma y antigüedad (5 min). */
export function verifySignature(secret: string, body: string, header: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  return sign(secret, body, t).v1 === parts.v1;
}

export async function enqueueWebhooks(
  ctx: ExecContext,
  event: { id: string; type: string; entityType: string; entityId: string; payload: unknown; createdAt: Date },
) {
  const name = webhookName(event.type);
  const endpoints = await ctx.db.webhookEndpoint.findMany({ where: { active: true } });
  const targets = endpoints.filter((e) => matchesEvent(e.events, name));
  for (const ep of targets) {
    const idempotencyKey = `${event.id}:${ep.id}`;
    await prisma.webhookDelivery.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        organizationId: ctx.orgId, endpointId: ep.id, eventId: event.id, eventName: name, idempotencyKey,
        payload: {
          id: event.id, event: name, created_at: event.createdAt.toISOString(),
          organization_id: ctx.orgId,
          data: { entity_type: event.entityType, entity_id: event.entityId, ...(event.payload as object) },
        },
      },
    });
  }
}

export async function deliverPendingWebhooks(orgId?: string, limit = 50) {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() }, ...(orgId ? { organizationId: orgId } : {}) },
    include: { endpoint: true },
    take: limit,
    orderBy: { nextAttemptAt: "asc" },
  });
  for (const d of due) await attemptDelivery(d.id);
  return due.length;
}

export async function attemptDelivery(deliveryId: string) {
  const d = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true } });
  if (!d || d.status === "SUCCESS") return;
  const body = JSON.stringify(d.payload);
  const attempts = d.attempts + 1;
  let responseCode: number | null = null;
  let lastError: string | null = null;
  try {
    const res = await fetch(d.endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "ORKEST-Webhooks/1.0",
        "x-orkest-event": d.eventName,
        "x-orkest-delivery": d.id,
        "x-orkest-idempotency-key": d.idempotencyKey,
        "x-orkest-signature": sign(d.endpoint.secret, body).header,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    responseCode = res.status;
    if (!res.ok) lastError = `HTTP ${res.status}`;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
  }
  const ok = !lastError;
  await prisma.webhookDelivery.update({
    where: { id: d.id },
    data: {
      attempts, responseCode, lastError,
      status: ok ? "SUCCESS" : attempts >= MAX_ATTEMPTS ? "DEAD" : "PENDING",
      deliveredAt: ok ? new Date() : null,
      nextAttemptAt: new Date(Date.now() + (BACKOFF_SECONDS[attempts] ?? 21600) * 1000),
    },
  });
}
