import { Prisma } from "@/lib/generated/prisma/client";
import type { FieldKind } from "./list-query";

/**
 * Condición sobre un campo de Studio (JSON customFields), con la semántica de Odoo:
 * "no es" / "no contiene" / "es falso" incluyen los registros donde el campo no está establecido.
 * (Solo servidor: usa el runtime de Prisma.)
 */
export function customJsonCondition(key: string, kind: FieldKind, op: string, raw: string): Record<string, unknown> | undefined {
  const path = [key];
  const unset = { OR: [{ customFields: { path, equals: Prisma.AnyNull } }, { customFields: { path, equals: "" } }] };
  const val = kind === "number" ? Number(raw) : raw;
  switch (op) {
    case "eq": return { customFields: { path, equals: val } };
    case "ne": return { OR: [unset, { NOT: { customFields: { path, equals: val } } }] };
    case "contains": return { customFields: { path, string_contains: raw } };
    case "ncontains": return { OR: [unset, { NOT: { customFields: { path, string_contains: raw } } }] };
    case "true": return { customFields: { path, equals: true } };
    case "false": return { OR: [{ customFields: { path, equals: Prisma.AnyNull } }, { customFields: { path, equals: false } }] };
    case "set": return { NOT: unset };
    case "unset": return unset;
    case "gt": case "gte": case "lt": case "lte": return Number.isFinite(Number(raw)) ? { customFields: { path, [op]: Number(raw) } } : undefined;
  }
  return undefined;
}
