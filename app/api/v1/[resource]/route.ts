import { NextResponse } from "next/server";
import { apiContext, apiError } from "@/lib/core/api-auth";
import { listResource, resourceFor, shape } from "@/lib/core/api-v1";

/** GET /api/v1/{recurso}?q=&page=&limit= — lista paginada (máx. 100 por página). */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[resource]">) {
  const ctx = await apiContext(req);
  if (!ctx) return apiError(401, "No autenticado");
  const { resource } = await params;
  const r = resourceFor(ctx, resource, "read");
  if ("error" in r) return r.error;
  try {
    return NextResponse.json(await listResource(ctx, r.res, new URL(req.url)));
  } catch (e) {
    console.error("[api/v1] list", resource, e);
    return apiError(500, "No se pudo consultar el recurso");
  }
}

/** POST /api/v1/{recurso} — alta (solo recursos que la admiten: customers, products). */
export async function POST(req: Request, { params }: RouteContext<"/api/v1/[resource]">) {
  const ctx = await apiContext(req);
  if (!ctx) return apiError(401, "No autenticado");
  const { resource } = await params;
  const r = resourceFor(ctx, resource, "write");
  if ("error" in r) return r.error;
  if (!r.res.create) return apiError(405, `El recurso ${resource} no admite altas por API`);
  let body: unknown;
  try { body = await req.json(); } catch { return apiError(400, "El cuerpo debe ser JSON válido"); }
  try {
    const created = await r.res.create(ctx, body);
    const row = await r.def.load(ctx.db, created.id);
    return NextResponse.json({ data: row ? shape(ctx, r.res, row) : { id: created.id } }, { status: 201 });
  } catch (e) {
    const err = e as Error & { errors?: unknown; code?: string };
    if (err.errors) return apiError(422, "Datos inválidos", err.errors);
    if (err.code === "P2002") return apiError(409, "Ya existe un registro con esos datos");
    console.error("[api/v1] create", resource, e);
    return apiError(500, "No se pudo crear el registro");
  }
}
