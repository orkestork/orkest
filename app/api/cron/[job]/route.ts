import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processPendingEvents } from "@/lib/core/events";
import { deliverPendingWebhooks } from "@/lib/core/webhooks";

/**
 * Tareas programadas. Vercel Cron llama con "Authorization: Bearer $CRON_SECRET".
 *  - /api/cron/events   reintenta eventos de dominio pendientes o fallidos
 *  - /api/cron/webhooks entrega los webhooks en cola
 * Sin CRON_SECRET configurado, las tareas quedan cerradas.
 */
const JOBS: Record<string, () => Promise<number>> = {
  events: () => processPendingEvents(200),
  webhooks: () => deliverPendingWebhooks(undefined, 200),
};

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request, { params }: RouteContext<"/api/cron/[job]">) {
  if (!authorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { job } = await params;
  const run = JOBS[job];
  if (!run) return NextResponse.json({ error: "Tarea desconocida" }, { status: 404 });
  const started = Date.now();
  const processed = await run();
  return NextResponse.json({ job, processed, ms: Date.now() - started });
}
