import type { ExecContext } from "@/lib/core/context";
import { nextNumber } from "@/lib/core/db";
import { addActivity } from "@/lib/core/notify";
import { ValidationError } from "./crm";
import { quickMove } from "./stock";
import { LABELS, oneOf } from "./ops-shared";

/**
 * Mantenimiento: equipos (máquinas, moldes, herramientas, infraestructura), órdenes
 * preventivas/correctivas con firma de ejecución y de recibido, repuestos y cotizaciones.
 * Los repuestos y herramientas son productos del catálogo: sus existencias viven en Inventario.
 */
const OPEN = ["PENDING", "IN_PROGRESS"];
export const PART_CATEGORIES = { Repuesto: "Repuesto", Herramienta: "Herramienta" } as const;

export async function createEquipment(ctx: ExecContext, d: { name: string; code: string; type: string; location?: string; workCenterId?: string; moldId?: string }) {
  if (!d.name.trim() || !d.code.trim()) throw new ValidationError({ name: "Nombre y código son obligatorios" });
  return ctx.db.equipment.create({
    data: {
      organizationId: ctx.orgId, name: d.name.trim(), code: d.code.trim().toUpperCase(), type: oneOf(d.type, LABELS.equipmentType, "tipo"),
      location: d.location?.trim() || null, workCenterId: d.workCenterId || null, moldId: d.moldId || null,
    },
  });
}

export async function setEquipmentStatus(ctx: ExecContext, id: string, status: string) {
  return ctx.db.equipment.update({ where: { id }, data: { status: oneOf(status, LABELS.equipmentStatus, "estado") } });
}

export async function createMaintenanceOrder(ctx: ExecContext, d: { equipmentId: string; type: string; priority: string; description: string; assignedToId?: string }) {
  if (!d.description.trim()) throw new ValidationError({ description: "Describe el trabajo o la falla" });
  const eq = await ctx.db.equipment.findUniqueOrThrow({ where: { id: d.equipmentId } });
  const order = await ctx.db.maintenanceOrder.create({
    data: {
      organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "MT", 4), equipmentId: eq.id,
      type: oneOf(d.type, LABELS.maintenanceType, "tipo"), priority: oneOf(d.priority, LABELS.priority, "prioridad"),
      description: d.description.trim(), assignedToId: d.assignedToId || null, reportedById: ctx.actorId ?? "",
    },
  });
  if (d.type === "CORRECTIVE" && eq.status === "OPERATIVE") await ctx.db.equipment.update({ where: { id: eq.id }, data: { status: "DOWN" } });
  await addActivity(ctx, "maintenance_order", order.id, `Orden ${order.number} creada para ${eq.name}`);
  return order;
}

/** Transición atómica: solo cambia si la orden sigue en el estado esperado. */
async function transition(ctx: ExecContext, id: string, from: string[], data: Record<string, unknown>) {
  const changed = await ctx.db.maintenanceOrder.updateMany({ where: { id, status: { in: from } }, data });
  if (changed.count !== 1) throw new ValidationError({ status: "La orden ya cambió de estado; recarga la página" });
  return ctx.db.maintenanceOrder.findUniqueOrThrow({ where: { id } });
}

async function releaseEquipment(ctx: ExecContext, equipmentId: string) {
  const stillOpen = await ctx.db.maintenanceOrder.count({ where: { equipmentId, status: { in: OPEN } } });
  if (stillOpen > 0) return;
  const eq = await ctx.db.equipment.update({ where: { id: equipmentId }, data: { status: "OPERATIVE" } });
  // Un molde reparado vuelve a quedar disponible en Producción
  if (eq.moldId) await ctx.db.mold.updateMany({ where: { id: eq.moldId, status: "MAINTENANCE" }, data: { status: "AVAILABLE" } });
}

export async function startMaintenanceOrder(ctx: ExecContext, id: string) {
  const o = await transition(ctx, id, ["PENDING"], { status: "IN_PROGRESS", startedAt: new Date() });
  await ctx.db.equipment.update({ where: { id: o.equipmentId }, data: { status: "MAINTENANCE" } });
  await addActivity(ctx, "maintenance_order", id, "Trabajo iniciado");
  return o;
}

export async function completeMaintenanceOrder(ctx: ExecContext, id: string, d: { resolution: string; downtimeMinutes?: number | null; signatureData: string; signedByName: string; executorSignatureData: string; executorName: string }) {
  const errors: Record<string, string> = {};
  if (!d.resolution.trim()) errors.resolution = "Describe el trabajo realizado";
  if (!d.executorSignatureData.startsWith("data:image/png") || !d.executorName.trim()) errors.executor = "Falta la firma y el nombre de quien ejecutó";
  if (!d.signatureData.startsWith("data:image/png") || !d.signedByName.trim()) errors.signature = "Falta la firma y el nombre de quien recibe";
  if (d.signatureData.length > 200_000 || d.executorSignatureData.length > 200_000) errors.size = "Firma demasiado grande";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const current = await ctx.db.maintenanceOrder.findUniqueOrThrow({ where: { id } });
  const completedAt = new Date();
  const auto = current.startedAt ? Math.round((completedAt.getTime() - current.startedAt.getTime()) / 60000) : null;
  const o = await transition(ctx, id, ["IN_PROGRESS"], {
    status: "DONE", completedAt, signedAt: completedAt, resolution: d.resolution.trim(),
    signatureData: d.signatureData, signedByName: d.signedByName.trim(), executorSignatureData: d.executorSignatureData, executorName: d.executorName.trim(),
    downtimeMinutes: d.downtimeMinutes ?? auto,
  });
  await releaseEquipment(ctx, o.equipmentId);
  await addActivity(ctx, "maintenance_order", id, `Completada · recibió ${d.signedByName.trim()}`);
  return o;
}

export async function cancelMaintenanceOrder(ctx: ExecContext, id: string) {
  const o = await transition(ctx, id, OPEN, { status: "CANCELLED" });
  await releaseEquipment(ctx, o.equipmentId);
  return o;
}

/** Molde enviado a mantenimiento desde Moldes: asegura su equipo y abre una correctiva (una sola abierta). */
export async function openMoldRepair(ctx: ExecContext, moldId: string) {
  const mold = await ctx.db.mold.findUniqueOrThrow({ where: { id: moldId } });
  const eq = (await ctx.db.equipment.findFirst({ where: { moldId } }))
    ?? await ctx.db.equipment.create({ data: { organizationId: ctx.orgId, name: `Molde ${mold.name}`, code: `MOL-${mold.code}`.toUpperCase(), type: "MOLD", moldId } });
  const open = await ctx.db.maintenanceOrder.count({ where: { equipmentId: eq.id, status: { in: OPEN } } });
  if (open > 0) return null;
  return createMaintenanceOrder(ctx, { equipmentId: eq.id, type: "CORRECTIVE", priority: "MEDIUM", description: `Reparación de molde ${mold.code} - ${mold.name} (enviado desde Moldes)` });
}

// ── Repuestos y herramientas (productos del catálogo) ──

export async function createPart(ctx: ExecContext, d: { name: string; code: string; category: string; stock: number; minStock: number; unit?: string }) {
  if (!d.name.trim() || !d.code.trim()) throw new ValidationError({ name: "Nombre y código son obligatorios" });
  const category = oneOf(d.category, PART_CATEGORIES, "categoría");
  const p = await ctx.db.product.create({
    data: {
      organizationId: ctx.orgId, sku: d.code.trim().toUpperCase(), name: d.name.trim(), category, unit: d.unit?.trim() || "UND",
      minStock: Math.max(0, Math.round(d.minStock)), kind: "GOODS", canBeSold: false, canBePurchased: true,
    },
  });
  if (d.stock > 0) await quickMove(ctx, p.id, "ADJUST", Math.round(d.stock), "Existencia inicial de repuesto");
  return p;
}

/** Entrada (+) o salida (−) de unidades en el almacén principal. */
export async function movePart(ctx: ExecContext, productId: string, delta: number, note?: string) {
  if (!Number.isInteger(delta) || delta === 0) throw new ValidationError({ delta: "Indica una cantidad entera distinta de cero" });
  const p = await ctx.db.product.findUniqueOrThrow({ where: { id: productId } });
  if (Number(p.stock) + delta < 0) throw new ValidationError({ delta: "No hay existencias suficientes" });
  return quickMove(ctx, p.id, delta > 0 ? "IN" : "OUT", Math.abs(delta), note || (delta > 0 ? "Entrada de repuesto" : "Consumo en mantenimiento"));
}

export async function createQuote(ctx: ExecContext, d: { supplierId?: string; supplier?: string; description: string; amount: number; maintenanceOrderId?: string }) {
  const sup = d.supplierId ? await ctx.db.supplier.findUniqueOrThrow({ where: { id: d.supplierId } }) : null;
  const name = sup?.name ?? d.supplier?.trim();
  if (!name || !d.description.trim()) throw new ValidationError({ supplier: "Proveedor y descripción son obligatorios" });
  if (!(d.amount >= 0)) throw new ValidationError({ amount: "Monto inválido" });
  if (d.maintenanceOrderId) await ctx.db.maintenanceOrder.findUniqueOrThrow({ where: { id: d.maintenanceOrderId } });
  return ctx.db.maintenanceQuote.create({ data: { organizationId: ctx.orgId, supplierId: sup?.id ?? null, supplier: name, description: d.description.trim(), amount: Math.round(d.amount), maintenanceOrderId: d.maintenanceOrderId || null } });
}

export async function setQuoteStatus(ctx: ExecContext, id: string, status: string) {
  return ctx.db.maintenanceQuote.update({ where: { id }, data: { status: oneOf(status, LABELS.quoteStatus, "estado") } });
}

export async function maintenanceKpis(ctx: ExecContext, range: { gte: Date; lte: Date }) {
  const [openOrders, byType, done, equipmentDown, parts] = await Promise.all([
    ctx.db.maintenanceOrder.count({ where: { status: { in: OPEN } } }),
    ctx.db.maintenanceOrder.groupBy({ by: ["type"], where: { reportedAt: range }, _count: { _all: true } }),
    ctx.db.maintenanceOrder.aggregate({ where: { status: "DONE", completedAt: range }, _count: { _all: true }, _sum: { downtimeMinutes: true } }),
    ctx.db.equipment.count({ where: { status: { in: ["DOWN", "MAINTENANCE"] } } }),
    ctx.db.product.findMany({ where: { category: { in: Object.keys(PART_CATEGORIES) }, active: true }, select: { stock: true, minStock: true } }),
  ]);
  return {
    ordenesAbiertas: openOrders,
    preventivas: byType.find((t) => t.type === "PREVENTIVE")?._count._all ?? 0,
    correctivas: byType.find((t) => t.type === "CORRECTIVE")?._count._all ?? 0,
    completadas: done._count._all,
    tiempoMuertoMin: done._sum.downtimeMinutes ?? 0,
    equiposFueraServicio: equipmentDown,
    itemsBajoMinimo: parts.filter((p) => Number(p.stock) <= Number(p.minStock)).length,
  };
}
