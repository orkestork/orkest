import { prisma } from "./prisma";

/**
 * Modelos con columna `organizationId`. Toda operación sobre ellos realizada con
 * `tenantDb(orgId)` queda restringida automáticamente a esa organización:
 *  - lecturas/updates/deletes: se agrega `organizationId` al `where`
 *  - creates/upserts: se fuerza `organizationId` en `data`
 * Así ningún módulo puede leer ni escribir datos de otra empresa por descuido.
 */
export const TENANT_MODELS = new Set([
  "Membership", "Role", "OrganizationModule", "OrganizationFeatureFlag",
  "AuditLog", "DomainEvent", "Notification", "Activity", "FileObject", "Task", "Approval",
  "CustomFieldDefinition", "Workflow", "Automation", "AutomationRun", "Dashboard", "SavedView",
  "DocumentTemplate", "ApiKey", "WebhookEndpoint", "WebhookDelivery", "Integration", "ImportJob",
  "Customer", "Contact", "Opportunity", "Quote", "Invoice", "Product", "StockMovement",
  "Supplier", "Nonconformity", "Employee", "OrgUnit", "KnowledgeItem", "GraphEdge",
  "SonarSession", "SonarItem", "Insight",
  // Fase 1-4
  "Warehouse", "Location", "StockQuant", "OperationType", "Transfer", "ReorderRule",
  "Requisition", "PurchaseOrder", "WorkCenter", "Bom", "ProductionOrder",
  "PaymentTerm", "Pricelist", "SalesOrder", "Bill", "Journal", "Tax", "Payment",
  "CustomEntity", "CustomRecord", "Sequence",
]);

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "count", "aggregate", "groupBy", "update", "updateMany", "updateManyAndReturn",
  "delete", "deleteMany",
]);

type AnyArgs = Record<string, unknown> & { where?: object; data?: unknown; create?: object };

export function tenantDb(organizationId: string) {
  if (!organizationId) throw new Error("tenantDb requiere organizationId");
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = { ...(args as AnyArgs) };
          if (WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), organizationId };
          } else if (operation === "create") {
            a.data = { ...(a.data as object), organizationId };
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            a.data = rows.map((r) => ({ ...(r as object), organizationId }));
          } else if (operation === "upsert") {
            a.where = { ...(a.where ?? {}), organizationId };
            a.create = { ...(a.create ?? {}), organizationId };
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;

import type { Prisma } from "@/lib/generated/prisma/client";
/** Convierte estructuras tipadas (condiciones, acciones…) a JSON de Prisma. */
export const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Consecutivo atómico por organización: nextNumber(ctx.db, ctx.orgId, "OC") → "OC-00001" */
export async function nextNumber(db: TenantDb, organizationId: string, prefix: string, pad = 5) {
  const seq = await db.sequence.upsert({
    where: { organizationId_key: { organizationId, key: prefix } },
    create: { organizationId, key: prefix, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${String(seq.value).padStart(pad, "0")}`;
}
