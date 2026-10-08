import type { ExecContext } from "@/lib/core/context";
import { nextNumber } from "@/lib/core/db";
import { emitEvent } from "@/lib/core/events";
import { ValidationError } from "./crm";

/**
 * Motor de inventario multialmacén.
 *  - Existencias por ubicación (StockQuant). Product.stock es solo un total en caché.
 *  - Toda variación ocurre a través de una Transferencia validada (trazabilidad completa).
 *  - Ubicaciones virtuales por organización: Proveedores, Clientes, Producción, Ajustes.
 *  - Entregas parciales generan backorders automáticamente.
 */
export type VirtualKind = "SUPPLIER" | "CUSTOMER" | "PRODUCTION" | "ADJUSTMENT";
const VIRTUAL_NAMES: Record<VirtualKind, string> = {
  SUPPLIER: "Socios / Proveedores", CUSTOMER: "Socios / Clientes", PRODUCTION: "Virtual / Producción", ADJUSTMENT: "Virtual / Ajustes de inventario",
};

const num = (v: unknown) => Number(v ?? 0);
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export async function virtualLocation(ctx: ExecContext, kind: VirtualKind) {
  const found = await ctx.db.location.findFirst({ where: { kind, warehouseId: null } });
  if (found) return found;
  return ctx.db.location.create({ data: { organizationId: ctx.orgId, kind, name: VIRTUAL_NAMES[kind] } });
}

/** Máximo de almacenes por organización (configurable en settings.maxWarehouses). */
export const DEFAULT_MAX_WAREHOUSES = 10;
export async function warehouseLimit(ctx: ExecContext) {
  const { prisma } = await import("@/lib/core/prisma");
  const o = await prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { settings: true } });
  const v = Number((o?.settings as { maxWarehouses?: number } | null)?.maxWarehouses);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_WAREHOUSES;
}

/** Crea un almacén con su ubicación de existencias y tipos de operación estándar. */
export async function createWarehouse(ctx: ExecContext, d: { code: string; name: string }) {
  const code = d.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code || !d.name.trim()) throw new ValidationError({ code: "Código y nombre son obligatorios" });
  if (code.length > 6) throw new ValidationError({ code: "El código admite máximo 6 caracteres" });
  const limit = await warehouseLimit(ctx);
  if ((await ctx.db.warehouse.count({ where: { active: true } })) >= limit) throw new ValidationError({ code: `Alcanzaste el máximo de ${limit} almacenes activos. Archiva uno para crear otro.` });
  if (await ctx.db.warehouse.findFirst({ where: { code } })) throw new ValidationError({ code: `Ya existe el almacén ${code}` });
  const [supplier, customer, production] = await Promise.all([virtualLocation(ctx, "SUPPLIER"), virtualLocation(ctx, "CUSTOMER"), virtualLocation(ctx, "PRODUCTION")]);
  const position = await ctx.db.warehouse.count();
  const wh = await ctx.db.warehouse.create({ data: { organizationId: ctx.orgId, code, name: d.name.trim(), position } });
  const stock = await ctx.db.location.create({ data: { organizationId: ctx.orgId, warehouseId: wh.id, kind: "INTERNAL", name: `${code} / Existencias` } });
  await ctx.db.warehouse.update({ where: { id: wh.id }, data: { stockLocationId: stock.id } });
  await ctx.db.operationType.createMany({
    data: [
      { organizationId: ctx.orgId, warehouseId: wh.id, kind: "RECEIPT", name: "Recepciones", prefix: `${code}/REC`, defaultSrcId: supplier.id, defaultDestId: stock.id },
      { organizationId: ctx.orgId, warehouseId: wh.id, kind: "INTERNAL", name: "Traslados internos", prefix: `${code}/INT`, defaultSrcId: stock.id, defaultDestId: stock.id },
      { organizationId: ctx.orgId, warehouseId: wh.id, kind: "DELIVERY", name: "Órdenes de entrega", prefix: `${code}/ENT`, defaultSrcId: stock.id, defaultDestId: customer.id },
      { organizationId: ctx.orgId, warehouseId: wh.id, kind: "MANUFACTURING", name: "Fabricación", prefix: `${code}/FAB`, defaultSrcId: stock.id, defaultDestId: production.id },
    ],
  });
  return { ...wh, stockLocationId: stock.id };
}

export async function defaultWarehouse(ctx: ExecContext) {
  const wh = await ctx.db.warehouse.findFirst({ where: { active: true }, orderBy: { position: "asc" } });
  if (!wh) throw new Error("La organización no tiene almacenes. Créalo en Inventario → Almacenes.");
  return wh;
}

export async function operationType(ctx: ExecContext, warehouseId: string, kind: string) {
  const op = await ctx.db.operationType.findFirst({ where: { warehouseId, kind } });
  if (!op) throw new Error(`El almacén no tiene tipo de operación ${kind}`);
  return op;
}

export async function qtyAt(ctx: ExecContext, productId: string, locationId: string) {
  const q = await ctx.db.stockQuant.findFirst({ where: { productId, locationId } });
  return num(q?.quantity);
}


/** Recalcula Product.stock (suma de ubicaciones internas) y devuelve totales previos/nuevos. */
export async function recomputeProductStock(ctx: ExecContext, productIds: string[]) {
  const internal = await ctx.db.location.findMany({ where: { kind: "INTERNAL" }, select: { id: true } });
  const out = new Map<string, { before: number; after: number; minStock: number; name: string }>();
  for (const id of [...new Set(productIds)]) {
    const p = await ctx.db.product.findUnique({ where: { id } });
    if (!p) continue;
    const agg = await ctx.db.stockQuant.aggregate({ where: { productId: id, locationId: { in: internal.map((l) => l.id) } }, _sum: { quantity: true } });
    const after = num(agg._sum.quantity);
    await ctx.db.product.update({ where: { id }, data: { stock: after } });
    out.set(id, { before: num(p.stock), after, minStock: num(p.minStock), name: p.name });
  }
  return out;
}

type NewLine = { productId: string; quantity: number; description?: string; sourceLineId?: string };

export async function createTransfer(ctx: ExecContext, d: {
  operationTypeId: string; srcLocationId?: string; destLocationId?: string; lines: NewLine[];
  origin?: string; sourceType?: string; sourceId?: string; partnerName?: string; scheduledAt?: Date;
}) {
  const op = await ctx.db.operationType.findUniqueOrThrow({ where: { id: d.operationTypeId } });
  const src = d.srcLocationId ?? op.defaultSrcId, dest = d.destLocationId ?? op.defaultDestId;
  if (!src || !dest) throw new ValidationError({ location: "Origen y destino son obligatorios" });
  if (src === dest) throw new ValidationError({ location: "Origen y destino no pueden ser iguales" });
  // Ubicaciones válidas: de esta organización (ctx.db), activas y de almacenes activos
  const locs = await ctx.db.location.findMany({ where: { id: { in: [src, dest] } }, include: { warehouse: true } });
  if (locs.length !== 2) throw new ValidationError({ location: "Ubicación no encontrada" });
  for (const l of locs) {
    if (!l.active || (l.warehouse && !l.warehouse.active)) throw new ValidationError({ location: `${l.name} pertenece a un almacén archivado o inactivo` });
  }
  // Cantidades: números finitos > 0, redondeadas a 3 decimales; líneas repetidas se consolidan
  const merged = new Map<string, NewLine>();
  for (const l of d.lines) {
    const q = round3(Number(l.quantity));
    if (!Number.isFinite(q) || q <= 0) continue;
    const key = `${l.productId}|${l.sourceLineId ?? ""}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, quantity: round3(prev.quantity + q) } : { ...l, quantity: q });
  }
  const lines = [...merged.values()];
  if (lines.length === 0) throw new ValidationError({ lines: "Agrega al menos un producto con cantidad mayor que cero" });
  const prods = await ctx.db.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } } });
  if (prods.length !== new Set(lines.map((l) => l.productId)).size) throw new ValidationError({ lines: "Producto no encontrado" });
  const notStockable = prods.filter((p) => p.kind !== "GOODS");
  if (notStockable.length) throw new ValidationError({ lines: `No se mueve inventario de servicios ni kits: ${notStockable.map((p) => p.name).join(", ")}` });
  const t = await ctx.db.transfer.create({
    data: {
      organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, op.prefix), operationTypeId: op.id,
      srcLocationId: src, destLocationId: dest, origin: d.origin, sourceType: d.sourceType, sourceId: d.sourceId,
      partnerName: d.partnerName, scheduledAt: d.scheduledAt ?? new Date(),
      lines: { create: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, description: l.description, sourceLineId: l.sourceLineId })) },
    },
  });
  await checkAvailability(ctx, t.id);
  return t;
}

/** ready si el origen tiene existencias suficientes (o es una ubicación virtual); si no, waiting. */
export async function checkAvailability(ctx: ExecContext, transferId: string) {
  const t = await ctx.db.transfer.findUniqueOrThrow({ where: { id: transferId }, include: { lines: true } });
  if (["done", "canceled"].includes(t.status)) return t.status;
  const src = await ctx.db.location.findUniqueOrThrow({ where: { id: t.srcLocationId } });
  let ready = true;
  if (src.kind === "INTERNAL") {
    for (const l of t.lines) if ((await qtyAt(ctx, l.productId, src.id)) < num(l.quantity) - num(l.doneQty)) ready = false;
  }
  const status = ready ? "ready" : "waiting";
  await ctx.db.transfer.update({ where: { id: t.id }, data: { status } });
  return status;
}

/**
 * Valida una transferencia. `done` permite cantidades parciales por línea:
 * lo no entregado queda en un backorder con el mismo origen.
 */
export async function validateTransfer(ctx: ExecContext, transferId: string, done?: Record<string, number>, opts: { allowNegative?: boolean } = {}) {
  const t = await ctx.db.transfer.findUniqueOrThrow({ where: { id: transferId }, include: { lines: true, operationType: true } });
  if (t.status === "done") throw new ValidationError({ status: "La transferencia ya fue validada" });
  if (t.status === "canceled") throw new ValidationError({ status: "La transferencia está cancelada" });
  const [src, dest] = await Promise.all([
    ctx.db.location.findUniqueOrThrow({ where: { id: t.srcLocationId } }),
    ctx.db.location.findUniqueOrThrow({ where: { id: t.destLocationId } }),
  ]);
  const products = new Map((await ctx.db.product.findMany({ where: { id: { in: t.lines.map((l) => l.productId) } } })).map((p) => [p.id, p]));

  const plan = t.lines.map((l) => {
    const pending = round3(num(l.quantity) - num(l.doneQty));
    const asked = done?.[l.id];
    if (asked !== undefined && (!Number.isFinite(Number(asked)) || Number(asked) < 0)) {
      throw new ValidationError({ quantity: `Cantidad inválida para ${products.get(l.productId)?.name ?? "el producto"}` });
    }
    const qty = asked !== undefined ? round3(Math.min(pending, Number(asked))) : pending;
    return { line: l, qty, remaining: round3(pending - qty) };
  });
  if (plan.every((p) => p.qty === 0)) throw new ValidationError({ quantity: "Indica al menos una cantidad a mover" });

  const type = t.operationType.kind === "RECEIPT" ? "IN" : t.operationType.kind === "DELIVERY" ? "OUT" : src.kind === "ADJUSTMENT" || dest.kind === "ADJUSTMENT" ? "ADJUST" : src.kind === "PRODUCTION" ? "PRODUCE" : dest.kind === "PRODUCTION" ? "CONSUME" : "INTERNAL";
  const need = new Map<string, number>();
  for (const p of plan) if (p.qty > 0) need.set(p.line.productId, round3((need.get(p.line.productId) ?? 0) + p.qty));

  // Movimiento atómico: reserva la transferencia, descuenta solo si alcanza (por producto), ingresa y registra.
  await ctx.db.$transaction(async (tx) => {
    const claimed = await tx.transfer.updateMany({ where: { id: t.id, status: { in: ["draft", "waiting", "ready"] } }, data: { status: "done", doneAt: new Date() } });
    if (claimed.count !== 1) throw new ValidationError({ status: "La transferencia ya fue validada o está siendo procesada por otra persona" });
    for (const [productId, qty] of need) {
      if (src.kind === "INTERNAL") {
        if (opts.allowNegative) {
          await tx.stockQuant.upsert({ where: { productId_locationId: { productId, locationId: src.id } }, create: { organizationId: ctx.orgId, productId, locationId: src.id, quantity: -qty }, update: { quantity: { decrement: qty } } });
        } else {
          const dec = await tx.stockQuant.updateMany({ where: { productId, locationId: src.id, quantity: { gte: qty } }, data: { quantity: { decrement: qty } } });
          if (dec.count !== 1) {
            const have = num((await tx.stockQuant.findFirst({ where: { productId, locationId: src.id } }))?.quantity);
            throw new ValidationError({ stock: `Stock insuficiente de ${products.get(productId)?.name} en ${src.name}: hay ${have}, se requieren ${qty}` });
          }
        }
      }
      if (dest.kind === "INTERNAL") {
        await tx.stockQuant.upsert({ where: { productId_locationId: { productId, locationId: dest.id } }, create: { organizationId: ctx.orgId, productId, locationId: dest.id, quantity: qty }, update: { quantity: { increment: qty } } });
      }
    }
    for (const p of plan.filter((x) => x.qty > 0)) {
      await tx.stockMovement.create({
        data: { organizationId: ctx.orgId, productId: p.line.productId, type, quantity: p.qty, fromLocationId: src.id, toLocationId: dest.id, transferId: t.id, reference: t.origin ? `${t.number} · ${t.origin}` : t.number, userId: ctx.actorId },
      });
    }
    // Cierra las líneas con lo movido (lo pendiente pasa a un backorder)
    for (const p of plan) await tx.transferLine.update({ where: { id: p.line.id }, data: { quantity: round3(num(p.line.doneQty) + p.qty), doneQty: round3(num(p.line.doneQty) + p.qty) } });
  });

  const pendingLines = plan.filter((p) => p.remaining > 0);
  let backorderId: string | null = null;
  if (pendingLines.length) {
    const bo = await createTransfer(ctx, {
      operationTypeId: t.operationTypeId, srcLocationId: t.srcLocationId, destLocationId: t.destLocationId,
      origin: t.origin ?? undefined, sourceType: t.sourceType ?? undefined, sourceId: t.sourceId ?? undefined, partnerName: t.partnerName ?? undefined,
      lines: pendingLines.map((p) => ({ productId: p.line.productId, quantity: p.remaining, description: p.line.description ?? undefined, sourceLineId: p.line.sourceLineId ?? undefined })),
    });
    backorderId = bo.id;
  }

  // Eventos: StockMoved / InventoryBelowMinimum por producto + TransferDone
  const totals = await recomputeProductStock(ctx, plan.map((p) => p.line.productId));
  for (const [productId, x] of totals) {
    await emitEvent(ctx, "StockMoved", "product", productId, { before: x.before, after: x.after, type, transfer: t.number });
    if (x.minStock > 0 && x.before >= x.minStock && x.after < x.minStock) {
      await emitEvent(ctx, "InventoryBelowMinimum", "product", productId, { stock: x.after, minStock: x.minStock });
    }
  }
  await emitEvent(ctx, "TransferDone", "transfer", t.id, { number: t.number, kind: t.operationType.kind, origin: t.origin, backorderId });
  if (t.operationType.kind === "RECEIPT") {
    for (const p of plan.filter((x) => x.qty > 0)) await emitEvent(ctx, "GoodsReceived", "product", p.line.productId, { quantity: p.qty, transfer: t.number });
  }

  // Ganchos del documento origen
  const moved = plan.filter((p) => p.qty > 0).map((p) => ({ sourceLineId: p.line.sourceLineId, productId: p.line.productId, qty: p.qty }));
  if (t.sourceType === "purchase_order" && t.sourceId) {
    const { onReceiptDone } = await import("./purchasing");
    await onReceiptDone(ctx, t.sourceId, moved);
  } else if (t.sourceType === "sales_order" && t.sourceId) {
    const { onDeliveryDone } = await import("./sales-orders");
    await onDeliveryDone(ctx, t.sourceId, moved);
  }

  // Reabastecimiento automático (reglas AUTO) tras cualquier salida
  const { runReplenishment } = await import("./replenishment");
  await runReplenishment(ctx, { productIds: [...totals.keys()] });

  // Transferencias en espera que ahora podrían estar listas
  if (dest.kind === "INTERNAL") {
    const waiting = await ctx.db.transfer.findMany({ where: { status: "waiting", srcLocationId: dest.id }, select: { id: true } });
    for (const w of waiting) await checkAvailability(ctx, w.id);
  }
  return { backorderId };
}

/** Crea y valida de inmediato; si la validación falla, la transferencia se cancela (no deja demanda fantasma). */
export async function moveNow(ctx: ExecContext, d: Parameters<typeof createTransfer>[1]) {
  const t = await createTransfer(ctx, d);
  try {
    await validateTransfer(ctx, t.id);
  } catch (e) {
    await ctx.db.transfer.update({ where: { id: t.id }, data: { status: "canceled" } });
    throw e;
  }
  return t;
}

export async function renameWarehouse(ctx: ExecContext, id: string, name: string) {
  if (!name.trim()) throw new ValidationError({ name: "El nombre es obligatorio" });
  await ctx.db.warehouse.update({ where: { id }, data: { name: name.trim() } });
}

/** Archiva un almacén solo si está vacío y sin transferencias abiertas. */
export async function archiveWarehouse(ctx: ExecContext, id: string) {
  const wh = await ctx.db.warehouse.findUniqueOrThrow({ where: { id } });
  const locs = (await ctx.db.location.findMany({ where: { warehouseId: id }, select: { id: true } })).map((l) => l.id);
  const stock = await ctx.db.stockQuant.aggregate({ where: { locationId: { in: locs }, quantity: { not: 0 } }, _count: true });
  if (stock._count) throw new ValidationError({ warehouse: `${wh.name} todavía tiene existencias. Trasládalas antes de archivarlo.` });
  const open = await ctx.db.transfer.count({ where: { status: { notIn: ["done", "canceled"] }, OR: [{ srcLocationId: { in: locs } }, { destLocationId: { in: locs } }] } });
  if (open) throw new ValidationError({ warehouse: `${wh.name} tiene ${open} transferencia(s) abiertas.` });
  if ((await ctx.db.warehouse.count({ where: { active: true } })) <= 1) throw new ValidationError({ warehouse: "Debe quedar al menos un almacén activo" });
  await ctx.db.warehouse.update({ where: { id }, data: { active: false } });
}

export async function restoreWarehouse(ctx: ExecContext, id: string) {
  const limit = await warehouseLimit(ctx);
  if ((await ctx.db.warehouse.count({ where: { active: true } })) >= limit) throw new ValidationError({ warehouse: `Ya tienes ${limit} almacenes activos` });
  await ctx.db.warehouse.update({ where: { id }, data: { active: true } });
}

/** Traslado de un producto entre dos almacenes (validado de inmediato o pendiente). */
export async function transferBetweenWarehouses(ctx: ExecContext, d: { productId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number; validate: boolean; note?: string }) {
  if (d.fromWarehouseId === d.toWarehouseId) throw new ValidationError({ warehouse: "El origen y el destino deben ser almacenes distintos" });
  if (!(d.quantity > 0)) throw new ValidationError({ quantity: "La cantidad debe ser mayor que cero" });
  const [from, to] = await Promise.all([
    ctx.db.warehouse.findUniqueOrThrow({ where: { id: d.fromWarehouseId } }),
    ctx.db.warehouse.findUniqueOrThrow({ where: { id: d.toWarehouseId } }),
  ]);
  if (!from.active || !to.active) throw new ValidationError({ warehouse: "Ambos almacenes deben estar activos" });
  const op = await operationType(ctx, to.id, "INTERNAL");
  const data = {
    operationTypeId: op.id, srcLocationId: from.stockLocationId!, destLocationId: to.stockLocationId!,
    lines: [{ productId: d.productId, quantity: d.quantity }], origin: d.note || `Traslado ${from.code} → ${to.code}`,
  };
  return d.validate ? moveNow(ctx, data) : createTransfer(ctx, data);
}

export async function cancelTransfer(ctx: ExecContext, transferId: string) {
  const t = await ctx.db.transfer.findUniqueOrThrow({ where: { id: transferId } });
  if (t.status === "done") throw new ValidationError({ status: "No se puede cancelar una transferencia validada" });
  await ctx.db.transfer.update({ where: { id: t.id }, data: { status: "canceled" } });
}

/** Ajuste de inventario: deja la existencia de una ubicación en `newQty`. */
export async function adjustStock(ctx: ExecContext, productId: string, locationId: string, newQty: number, reason = "Ajuste de inventario") {
  if (!Number.isFinite(newQty) || newQty < 0) throw new ValidationError({ quantity: "La existencia contada debe ser un número mayor o igual a cero" });
  const loc = await ctx.db.location.findUniqueOrThrow({ where: { id: locationId } });
  if (loc.kind !== "INTERNAL" || !loc.warehouseId) throw new ValidationError({ location: "Solo se ajustan ubicaciones internas" });
  const current = await qtyAt(ctx, productId, locationId);
  const delta = round3(newQty - current);
  if (delta === 0) return null;
  const adj = await virtualLocation(ctx, "ADJUSTMENT");
  const op = await operationType(ctx, loc.warehouseId, "INTERNAL");
  return moveNow(ctx, {
    operationTypeId: op.id, srcLocationId: delta > 0 ? adj.id : loc.id, destLocationId: delta > 0 ? loc.id : adj.id,
    lines: [{ productId, quantity: Math.abs(delta) }], origin: reason, sourceType: "adjustment",
  });
}

/** Atajo de compatibilidad: movimiento rápido en el almacén principal. */
export async function quickMove(ctx: ExecContext, productId: string, type: "IN" | "OUT" | "ADJUST", quantity: number, reference?: string) {
  const wh = await defaultWarehouse(ctx);
  if (type === "ADJUST") return adjustStock(ctx, productId, wh.stockLocationId!, quantity, reference ?? "Ajuste");
  const kind = type === "IN" ? "RECEIPT" : "DELIVERY";
  const op = await operationType(ctx, wh.id, kind);
  return moveNow(ctx, { operationTypeId: op.id, lines: [{ productId, quantity: Math.abs(quantity) }], origin: reference });
}
