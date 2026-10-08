import { z } from "zod";
import type { ExecContext } from "@/lib/core/context";
import { emitEvent } from "@/lib/core/events";
import { getFieldDefs, validateCustomFields } from "@/lib/core/custom-fields";
import { ValidationError } from "./crm";
import { quickMove } from "./stock";
import { addActivity } from "@/lib/core/notify";

export const ProductInput = z.object({
  sku: z.string().trim().min(1, "SKU obligatorio"),
  name: z.string().trim().min(2, "Nombre obligatorio"),
  category: z.string().trim().optional().transform((v) => v || null),
  unit: z.string().trim().default("UND").transform((v) => v || "UND"),
  price: z.coerce.number().min(0).default(0),
  cost: z.coerce.number().min(0).default(0),
  stock: z.coerce.number().default(0),
  minStock: z.coerce.number().min(0).default(0),
  kind: z.enum(["GOODS", "SERVICE", "COMBO"]).default("GOODS"),
  invoicePolicy: z.enum(["ORDER", "DELIVERY"]).default("ORDER"),
  canBeSold: z.boolean().default(true),
  canBePurchased: z.boolean().default(true),
  taxRate: z.coerce.number().min(0).max(100).default(19),
  defaultSupplierId: z.string().optional().nullable().transform((v) => v || null),
  customFields: z.record(z.string(), z.unknown()).default({}),
});

export async function createProduct(ctx: ExecContext, raw: unknown) {
  const parsed = ProductInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  if (await ctx.db.product.findFirst({ where: { sku: parsed.data.sku } })) throw new ValidationError({ sku: "El SKU ya existe" });
  const cf = validateCustomFields(await getFieldDefs(ctx.db, "product"), parsed.data.customFields);
  if (!cf.ok) throw new ValidationError(cf.errors);
  const { stock: initialStock, ...data } = parsed.data;
  const p = await ctx.db.product.create({ data: { ...data, stock: 0, customFields: cf.values as object, organizationId: ctx.orgId } });
  await emitEvent(ctx, "ProductCreated", "product", p.id, { sku: p.sku });
  // La existencia inicial entra como ajuste en el almacén principal (trazable)
  if (initialStock > 0 && p.kind === "GOODS" && (await ctx.db.warehouse.count()) > 0) {
    await quickMove(ctx, p.id, "ADJUST", initialStock, "Existencia inicial");
  }
  const fresh = await ctx.db.product.findUniqueOrThrow({ where: { id: p.id } });
  if (Number(fresh.minStock) > 0 && Number(fresh.stock) < Number(fresh.minStock) && initialStock <= 0) {
    await emitEvent(ctx, "InventoryBelowMinimum", "product", p.id, { stock: Number(fresh.stock), minStock: Number(fresh.minStock) });
  }
  return fresh;
}

/** Movimiento rápido en el almacén principal (compatibilidad con la pantalla simple). */
export async function moveStock(ctx: ExecContext, productId: string, type: "IN" | "OUT" | "ADJUST", quantity: number, reference?: string) {
  if (!Number.isFinite(quantity) || quantity === 0) throw new ValidationError({ quantity: "Cantidad inválida" });
  await quickMove(ctx, productId, type, quantity, reference);
  const p = await ctx.db.product.findUniqueOrThrow({ where: { id: productId } });
  return Number(p.stock);
}

/** Actualiza la ficha del producto y registra los cambios relevantes en el historial. */
export async function updateProduct(ctx: ExecContext, id: string, raw: unknown) {
  const parsed = ProductInput.omit({ stock: true }).safeParse(raw);
  if (!parsed.success) throw new ValidationError(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  const before = await ctx.db.product.findUniqueOrThrow({ where: { id } });
  if (parsed.data.sku !== before.sku && (await ctx.db.product.findFirst({ where: { sku: parsed.data.sku } }))) throw new ValidationError({ sku: "El SKU ya existe" });
  const cf = validateCustomFields(await getFieldDefs(ctx.db, "product"), parsed.data.customFields);
  if (!cf.ok) throw new ValidationError(cf.errors);
  const after = await ctx.db.product.update({ where: { id }, data: { ...parsed.data, customFields: cf.values as object } });
  const money = (v: unknown) => Number(v).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  const track: [string, unknown, unknown, (v: unknown) => string][] = [
    ["Precio de venta", before.price, after.price, money], ["Costo", before.cost, after.cost, money],
    ["Stock mínimo", before.minStock, after.minStock, (v) => Number(v).toLocaleString("es-CO")], ["Nombre", before.name, after.name, String],
  ];
  for (const [label, a, b, f] of track) if (String(a) !== String(b)) await addActivity(ctx, "product", id, `${label}: ${f(a)} → ${f(b)}`, "TRACKING");
  return after;
}

export async function setProductActive(ctx: ExecContext, id: string, active: boolean) {
  await ctx.db.product.update({ where: { id }, data: { active } });
  await addActivity(ctx, "product", id, active ? "Producto restaurado" : "Producto archivado", "SYSTEM");
}
