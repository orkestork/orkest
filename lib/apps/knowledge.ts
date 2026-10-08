import type { ExecContext } from "@/lib/core/context";
import { emitEvent } from "@/lib/core/events";
import { ValidationError } from "./crm";

export const KNOWLEDGE_TYPES = [
  { value: "ARTICLE", label: "Artículo" }, { value: "PROCEDURE", label: "Procedimiento" },
  { value: "PROCESS", label: "Proceso" }, { value: "POLICY", label: "Política" }, { value: "MANUAL", label: "Manual" },
];
export const CRITICALITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const RELATIONS = [
  { value: "DEPENDS_ON", label: "depende de" }, { value: "OWNS", label: "es dueño de" }, { value: "KNOWS", label: "conoce" },
  { value: "BACKUP_FOR", label: "es respaldo de" }, { value: "USES", label: "usa" }, { value: "BELONGS_TO", label: "pertenece a" },
  { value: "DOCUMENTS", label: "documenta" },
];

export async function createKnowledge(
  ctx: ExecContext,
  d: { type: string; title: string; body: string; ownerId?: string | null; criticality: string; departmentId?: string | null },
) {
  if (!d.title?.trim()) throw new ValidationError({ title: "Título obligatorio" });
  const item = await ctx.db.knowledgeItem.create({
    data: { organizationId: ctx.orgId, ...d, ownerId: d.ownerId || null, departmentId: d.departmentId || null,
      versions: { create: { version: 1, title: d.title, body: d.body, createdById: ctx.actorId } } },
  });
  if (item.ownerId) await link(ctx, "USER", item.ownerId, "OWNS", "KNOWLEDGE", item.id);
  return item;
}

export async function updateKnowledge(ctx: ExecContext, id: string, d: { title: string; body: string }) {
  const item = await ctx.db.knowledgeItem.findUniqueOrThrow({ where: { id } });
  const version = item.version + 1;
  await ctx.db.knowledgeItem.update({
    where: { id },
    data: { title: d.title, body: d.body, version, status: "draft", approvedAt: null, approvedById: null,
      versions: { create: { version, title: d.title, body: d.body, createdById: ctx.actorId } } },
  });
}

export async function publishKnowledge(ctx: ExecContext, id: string) {
  await ctx.db.knowledgeItem.update({ where: { id }, data: { status: "published", approvedById: ctx.actorId, approvedAt: new Date() } });
  await emitEvent(ctx, "KnowledgePublished", "knowledge", id);
}

export async function link(ctx: ExecContext, fromType: string, fromId: string, relation: string, toType: string, toId: string) {
  await ctx.db.graphEdge.upsert({
    where: { organizationId_fromType_fromId_relation_toType_toId: { organizationId: ctx.orgId, fromType, fromId, relation, toType, toId } },
    update: {},
    create: { organizationId: ctx.orgId, fromType, fromId, relation, toType, toId },
  });
}
