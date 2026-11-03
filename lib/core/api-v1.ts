import type { TenantDb } from "./db";
import { ENTITIES, plain } from "./entities";
import { hasPermission, isRestricted } from "./permissions";
import { apiError, type ApiContext } from "./api-auth";
import { createCustomer } from "@/lib/apps/crm";
import { createProduct } from "@/lib/apps/inventory";

/**
 * Recursos de la API REST v1. Cada recurso reutiliza la entidad registrada (app, permisos, carga)
 * y declara cómo listarse. Toda consulta pasa por tenantDb: nunca sale información de otra organización.
 */
type Resource = {
  entity: string;
  /** Delegado de Prisma en tenantDb */
  model: keyof TenantDb;
  /** Campos de búsqueda para ?q= */
  search?: string[];
  /** Alta por API (opcional) */
  create?: (ctx: ApiContext, body: unknown) => Promise<{ id: string }>;
  /** Campos que se ocultan cuando el rol/llave tiene "Ocultar costos" */
  costFields?: string[];
};

export const RESOURCES: Record<string, Resource> = {
  customers: { entity: "customer", model: "customer", search: ["name", "taxId", "email"], create: (ctx, b) => createCustomer(ctx, b) },
  contacts: { entity: "contact", model: "contact", search: ["name", "email"] },
  opportunities: { entity: "opportunity", model: "opportunity", search: ["title"] },
  quotes: { entity: "quote", model: "quote", search: ["number"] },
  "sales-orders": { entity: "sales_order", model: "salesOrder", search: ["number"] },
  invoices: { entity: "invoice", model: "invoice", search: ["number"] },
  products: { entity: "product", model: "product", search: ["sku", "name"], create: (ctx, b) => createProduct(ctx, b), costFields: ["cost"] },
  suppliers: { entity: "supplier", model: "supplier", search: ["name", "taxId"] },
  "purchase-orders": { entity: "purchase_order", model: "purchaseOrder", search: ["number"] },
  employees: { entity: "employee", model: "employee", search: ["name", "email"] },
  bills: { entity: "bill", model: "bill", search: ["number"] },
};

export function resourceFor(ctx: ApiContext, name: string, mode: "read" | "write") {
  const res = RESOURCES[name];
  const def = res && ENTITIES[res.entity];
  if (!res || !def) return { error: apiError(404, `Recurso desconocido: ${name}`) };
  if (!ctx.modules.has(def.module)) return { error: apiError(404, "Recurso no disponible para esta organización") };
  const perm = mode === "read" ? def.readPermission : def.writePermission;
  if (!hasPermission(ctx.permissions, perm)) return { error: apiError(403, `Permiso requerido: ${perm}`) };
  return { res, def };
}

/** Quita columnas internas y, si aplica, los costos. */
export function shape(ctx: ApiContext, res: Resource, row: unknown) {
  const r = plain(row) as Record<string, unknown>;
  delete r.organizationId;
  if (res.costFields && isRestricted(ctx.permissions, "deny:costs")) for (const f of res.costFields) delete r[f];
  return r;
}

type Delegate = { findMany: (a: object) => Promise<unknown[]>; count: (a: object) => Promise<number> };

export async function listResource(ctx: ApiContext, res: Resource, url: URL) {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25) || 25));
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const q = url.searchParams.get("q")?.trim();
  const where = q && res.search?.length ? { OR: res.search.map((f) => ({ [f]: { contains: q, mode: "insensitive" } })) } : {};
  const delegate = ctx.db[res.model] as unknown as Delegate;
  const [rows, total] = await Promise.all([
    delegate.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: (page - 1) * limit }),
    delegate.count({ where }),
  ]);
  return { data: rows.map((r) => shape(ctx, res, r)), page, limit, total, hasMore: page * limit < total };
}
