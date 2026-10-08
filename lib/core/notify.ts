import type { ExecContext } from "./context";

/** Usuarios activos de la organización con un rol dado. */
export async function usersWithRole(ctx: ExecContext, roleKey: string): Promise<string[]> {
  const ms = await ctx.db.membership.findMany({ where: { status: "ACTIVE", role: { key: roleKey } }, select: { userId: true } });
  return ms.map((m) => m.userId);
}

export async function notify(ctx: ExecContext, userIds: string[], n: { title: string; body?: string; link?: string }) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return 0;
  await ctx.db.notification.createMany({
    data: unique.map((userId) => ({ userId, title: n.title, body: n.body, link: n.link, organizationId: ctx.orgId })),
  });
  return unique.length;
}

export async function audit(ctx: ExecContext, action: string, entityType: string, entityId: string | null, changes: object = {}) {
  await ctx.db.auditLog.create({
    data: { organizationId: ctx.orgId, actorId: ctx.actorId, action, entityType, entityId, changes },
  });
}

export async function addActivity(ctx: ExecContext, entityType: string, entityId: string, content: string, type = "SYSTEM") {
  await ctx.db.activity.create({
    data: { organizationId: ctx.orgId, entityType, entityId, content, type, userId: ctx.actorId },
  });
}

/** Interpolación simple de plantillas: "Cotización {{number}} por {{total}}". */
export function interpolate(tpl: string, facts: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const v = path.split(".").reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Record<string, unknown>)[k] : undefined), facts);
    if (typeof v === "number") return v.toLocaleString("es-CO");
    return v === undefined || v === null ? "" : String(v);
  });
}
