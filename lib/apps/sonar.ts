import type { ExecContext } from "@/lib/core/context";
import { emitEvent } from "@/lib/core/events";
import { createKnowledge, link } from "./knowledge";

export const SONAR_KINDS = [
  { value: "FINDING", label: "Hallazgo" }, { value: "PROBLEM", label: "Problema" }, { value: "OPPORTUNITY", label: "Oportunidad" },
  { value: "DECISION", label: "Decisión" }, { value: "ACTION", label: "Acción" }, { value: "PROCESS", label: "Proceso" },
  { value: "KNOWLEDGE", label: "Conocimiento" }, { value: "RISK", label: "Riesgo" },
];

export async function addSonarItem(
  ctx: ExecContext,
  sessionId: string,
  d: { kind: string; title: string; description?: string; ownerId?: string | null },
) {
  const session = await ctx.db.sonarSession.findUniqueOrThrow({ where: { id: sessionId } });
  const item = await ctx.db.sonarItem.create({
    data: { organizationId: ctx.orgId, sessionId: session.id, kind: d.kind, title: d.title, description: d.description, ownerId: d.ownerId || null },
  });
  await emitEvent(ctx, "SonarItemCreated", "sonar_item", item.id, { kind: d.kind });
  return item;
}

/**
 * Convierte un hallazgo de Sonar en una capacidad estructurada:
 *  ACTION → Task · PROCESS/KNOWLEDGE → KnowledgeItem · RISK/PROBLEM/OPPORTUNITY → Insight de Radar
 */
export async function structureSonarItem(ctx: ExecContext, itemId: string) {
  const item = await ctx.db.sonarItem.findUniqueOrThrow({ where: { id: itemId } });
  if (item.linkedId) return item;
  let linkedType: string, linkedId: string;

  if (item.kind === "ACTION" || item.kind === "DECISION") {
    const t = await ctx.db.task.create({
      data: { organizationId: ctx.orgId, title: item.title, description: item.description, assigneeId: item.ownerId, sourceType: "sonar_item", sourceId: item.id },
    });
    linkedType = "task"; linkedId = t.id;
  } else if (item.kind === "PROCESS" || item.kind === "KNOWLEDGE" || item.kind === "FINDING") {
    const k = await createKnowledge(ctx, {
      type: item.kind === "PROCESS" ? "PROCESS" : "ARTICLE", title: item.title, body: item.description ?? "",
      ownerId: item.ownerId, criticality: "MEDIUM",
    });
    linkedType = "knowledge"; linkedId = k.id;
  } else {
    const fp = `sonar:${item.id}`;
    const ins = await ctx.db.insight.upsert({
      where: { organizationId_fingerprint: { organizationId: ctx.orgId, fingerprint: fp } },
      update: {},
      create: {
        organizationId: ctx.orgId, detectorKey: "sonar", fingerprint: fp,
        kind: item.kind === "OPPORTUNITY" ? "OPPORTUNITY" : "RISK", severity: item.kind === "RISK" ? "HIGH" : "MEDIUM",
        title: item.title, detail: item.description, recommendedAction: "Definir plan de acción a partir de la sesión Sonar",
        responsibleUserId: item.ownerId,
      },
    });
    linkedType = "insight"; linkedId = ins.id;
  }
  if (item.ownerId && linkedType === "knowledge") await link(ctx, "USER", item.ownerId, "KNOWS", "KNOWLEDGE", linkedId);
  return ctx.db.sonarItem.update({ where: { id: item.id }, data: { linkedType, linkedId, status: "structured" } });
}
