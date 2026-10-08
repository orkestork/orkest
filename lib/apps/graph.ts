import { prisma } from "@/lib/core/prisma";
import type { ExecContext } from "@/lib/core/context";

/** Resuelve nombres de nodos del grafo (USER, KNOWLEDGE, DEPARTMENT, SYSTEM). */
export async function graphNodes(ctx: ExecContext) {
  const [users, knowledge, units] = await Promise.all([
    ctx.db.membership.findMany({ include: { user: true } }),
    ctx.db.knowledgeItem.findMany({ select: { id: true, title: true, type: true, criticality: true } }),
    ctx.db.orgUnit.findMany(),
  ]);
  const nodes = new Map<string, { type: string; id: string; label: string; sub?: string }>();
  users.forEach((m) => nodes.set(`USER:${m.userId}`, { type: "USER", id: m.userId, label: m.user.name, sub: "Persona" }));
  knowledge.forEach((k) => nodes.set(`KNOWLEDGE:${k.id}`, { type: "KNOWLEDGE", id: k.id, label: k.title, sub: k.type === "PROCESS" ? "Proceso" : "Conocimiento" }));
  units.forEach((u) => nodes.set(`${u.kind}:${u.id}`, { type: u.kind, id: u.id, label: u.name, sub: u.kind === "SYSTEM" ? "Sistema" : "Departamento" }));
  return nodes;
}

export async function userName(id: string) {
  return (await prisma.user.findUnique({ where: { id }, select: { name: true } }))?.name;
}
