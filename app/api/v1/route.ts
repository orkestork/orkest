import { NextResponse } from "next/server";
import { apiContext, apiError } from "@/lib/core/api-auth";
import { RESOURCES } from "@/lib/core/api-v1";
import { ENTITIES } from "@/lib/core/entities";
import { hasPermission } from "@/lib/core/permissions";

/** GET /api/v1 — identifica la organización y lista los recursos que esta llave puede usar. */
export async function GET(req: Request) {
  const ctx = await apiContext(req);
  if (!ctx) return apiError(401, "No autenticado. Usa Authorization: Bearer ok_<prefijo>_<secreto>");
  const resources = Object.entries(RESOURCES)
    .filter(([, r]) => ctx.modules.has(ENTITIES[r.entity].module) && hasPermission(ctx.permissions, ENTITIES[r.entity].readPermission))
    .map(([name, r]) => ({
      name, list: `/api/v1/${name}`, get: `/api/v1/${name}/{id}`,
      create: r.create && hasPermission(ctx.permissions, ENTITIES[r.entity].writePermission) ? `POST /api/v1/${name}` : undefined,
    }));
  return NextResponse.json({ api: "Workezt", version: "v1", organizationId: ctx.orgId, auth: ctx.via, resources });
}
