import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { tenantDb } from "./db";
import { hasPermission } from "./permissions";
import { getContext, type ExecContext } from "./context";

/**
 * API Platform (API-first). Autenticación por:
 *  - Authorization: Bearer ok_<prefix>_<secret>   (API key de la organización, con scopes)
 *  - Cookie de sesión (para el frontend propio)
 * Cada request resuelve organización + permisos + módulos antes de tocar datos.
 */
export type ApiContext = ExecContext & { permissions: string[]; modules: Set<string>; via: "api_key" | "session" };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function generateApiKey() {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(24).toString("hex");
  return { prefix, token: `ok_${prefix}_${secret}`, hash: sha256(secret) };
}

export async function apiContext(req: Request): Promise<ApiContext | null> {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer ok_([a-f0-9]+)_([a-f0-9]+)$/);
  if (m) {
    const key = await prisma.apiKey.findUnique({ where: { prefix: m[1] } });
    if (!key || key.revokedAt || key.keyHash !== sha256(m[2])) return null;
    const org = await prisma.organization.findUnique({ where: { id: key.organizationId } });
    if (!org || org.status === "SUSPENDED") return null;
    const mods = await prisma.organizationModule.findMany({ where: { organizationId: org.id, enabled: true } });
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    return { orgId: org.id, db: tenantDb(org.id), actorId: key.createdById, permissions: key.scopes, modules: new Set(mods.map((x) => x.moduleKey)), via: "api_key" };
  }
  const ctx = await getContext();
  if (!ctx) return null;
  return { orgId: ctx.orgId, db: ctx.db, actorId: ctx.user.id, permissions: ctx.permissions, modules: ctx.modules, via: "session" };
}

export const apiError = (status: number, message: string, details?: unknown) =>
  NextResponse.json({ error: { message, details } }, { status });

/** Envuelve un handler exigiendo app activa y permiso. */
export function withApi(moduleKey: string, permission: string, handler: (ctx: ApiContext, req: Request) => Promise<Response>) {
  return async (req: Request) => {
    const ctx = await apiContext(req);
    if (!ctx) return apiError(401, "No autenticado");
    if (!ctx.modules.has(moduleKey)) return apiError(404, "Recurso no disponible");
    if (!hasPermission(ctx.permissions, permission)) return apiError(403, `Permiso requerido: ${permission}`);
    try {
      return await handler(ctx, req);
    } catch (e) {
      const err = e as Error & { errors?: unknown };
      return apiError(err.errors ? 422 : 500, err.message, err.errors);
    }
  };
}
