import type { ExecContext } from "@/lib/core/context";
import { ValidationError } from "./crm";
import { clock, civil, nonNegative } from "./ops-shared";

/**
 * Planta: corridas de inyección por máquina, corridas de ensamble por estación,
 * moldes con montajes y control de tiempos estándar de operarios.
 * Máquinas y estaciones son centros de trabajo (WorkCenter.kind MACHINE | ASSEMBLY).
 */

// ── Fórmulas de la planilla diaria de inyección ──

export function goodPieces(r: { produced: number; damaged: number; nonConforming: number }) {
  return Math.max(r.produced - r.damaged - r.nonConforming, 0);
}
export function qualityPct(r: { produced: number; damaged: number; nonConforming: number }) {
  return r.produced > 0 ? (goodPieces(r) / r.produced) * 100 : 0;
}
/** Eficiencia teórica: piezas que debieron salir según ciclo y cavidades en el tiempo transcurrido (sin paradas). */
export function runEfficiency(r: { produced: number; startTime: Date; endTime: Date; cycle: number; cycleUnit: string; cavities: number }) {
  const seconds = Math.max((r.endTime.getTime() - r.startTime.getTime()) / 1000, 0);
  const cycleSeconds = r.cycleUnit === "minutes" ? r.cycle * 60 : r.cycle;
  const expected = cycleSeconds > 0 ? Math.floor(seconds / cycleSeconds) * Math.max(1, Math.floor(r.cavities)) : 0;
  return { durationMinutes: seconds / 60, expected, efficiency: expected > 0 ? (r.produced / expected) * 100 : null };
}

type F = (k: string) => string;

export async function createProductionRun(ctx: ExecContext, f: F) {
  const date = f("productionDate");
  const startTime = clock(date, f("startTime"));
  let endTime = clock(date, f("endTime"));
  if (endTime <= startTime) endTime = new Date(endTime.getTime() + 86400_000); // turno que pasa la medianoche
  const wc = await ctx.db.workCenter.findUniqueOrThrow({ where: { id: f("workCenterId") } });
  if (!f("operatorId")) throw new ValidationError({ operatorId: "Selecciona el operario" });
  const production = f("productionId") ? await ctx.db.productionOrder.findUniqueOrThrow({ where: { id: f("productionId") } }) : null;
  const orderNumber = f("orderNumber") || production?.number;
  if (!orderNumber) throw new ValidationError({ orderNumber: "Indica la orden de producción" });
  if (!f("productId") && !production && !f("manualProductName")) throw new ValidationError({ productId: "Selecciona o describe el producto" });
  if (!f("material")) throw new ValidationError({ material: "Indica el material" });
  const produced = nonNegative(f("produced"), "producidas", { integer: true, required: true })!;
  const damaged = nonNegative(f("damaged"), "dañadas", { integer: true }) ?? 0;
  const nonConforming = nonNegative(f("nonConforming"), "no conformes", { integer: true }) ?? 0;
  if (damaged + nonConforming > produced) throw new ValidationError({ damaged: "Dañadas + no conformes no pueden superar la producción" });
  const cavities = nonNegative(f("cavities"), "cavidades", { integer: true }) ?? 1;
  if (cavities < 1 || cavities > 500) throw new ValidationError({ cavities: "Cavidades entre 1 y 500" });
  // Temperatura por zonas si se diligencia alguna zona; si no, temperatura simple
  const zones = [1, 2, 3, 4, 5, 6].filter((i) => f(`zone${i}`) !== "").map((i) => ({ label: `Z${i}`, value: nonNegative(f(`zone${i}`), `zona ${i}`)! }));
  const temperatureType = zones.length ? "zones" : "simple";
  const temperature = zones.length
    ? zones.reduce((s, z) => s + z.value, 0) / zones.length
    : nonNegative(f("temperature"), "temperatura", { required: true })!;
  const run = await ctx.db.productionRun.create({
    data: {
      organizationId: ctx.orgId, workCenterId: wc.id, operatorId: f("operatorId"), productId: f("productId") || production?.productId || null,
      manualProductName: f("productId") ? null : f("manualProductName") || null, productionId: production?.id ?? null, moldId: f("moldId") || null,
      orderNumber, productionDate: civil(date), startTime, endTime,
      material: f("material"), pigment: f("pigment") || null, pigmentQuantity: nonNegative(f("pigmentQuantity"), "pigmento"), pigmentColor: f("pigmentColor") || null,
      injectionWeight: nonNegative(f("injectionWeight"), "peso de inyección", { required: true })!, pieceWeight: nonNegative(f("pieceWeight"), "peso por pieza", { required: true })!,
      cycle: nonNegative(f("cycle"), "ciclo", { required: true })!, cycleUnit: f("cycleUnit") === "minutes" ? "minutes" : "seconds", cavities,
      temperature, temperatureType, temperatureZones: zones,
      produced, damaged, nonConforming,
      couplingTest: f("couplingTest") || null, couplingStatus: ["completed", "na"].includes(f("couplingStatus")) ? f("couplingStatus") : null, couplingTime: f("couplingTime") || null,
      observations: f("observations") || null, downtimeMinutes: nonNegative(f("downtimeMinutes"), "tiempo detenido", { integer: true }) ?? 0,
      materialQuantityKg: nonNegative(f("materialQuantityKg"), "kilos de material"),
    },
  });
  return run;
}

export async function createAssemblyRun(ctx: ExecContext, f: F) {
  const date = f("productionDate");
  const startTime = clock(date, f("startTime"));
  const endTime = clock(date, f("endTime"));
  if (endTime <= startTime) throw new ValidationError({ endTime: "La hora final debe ser posterior a la de inicio" });
  const wc = await ctx.db.workCenter.findUniqueOrThrow({ where: { id: f("workCenterId") } });
  await ctx.db.product.findUniqueOrThrow({ where: { id: f("productId") } });
  if (!f("leaderId")) throw new ValidationError({ leaderId: "Selecciona el líder" });
  const assembled = nonNegative(f("assembled"), "ensambladas", { integer: true, required: true })!;
  const defective = nonNegative(f("defective"), "defectuosas", { integer: true }) ?? 0;
  const nonConforming = nonNegative(f("nonConforming"), "no conformes", { integer: true }) ?? 0;
  if (defective + nonConforming > assembled) throw new ValidationError({ defective: "Defectuosas + no conformes no pueden superar lo ensamblado" });
  const workerCount = nonNegative(f("workerCount"), "personas", { integer: true, required: true })!;
  if (workerCount < 1) throw new ValidationError({ workerCount: "Al menos una persona" });
  const laborHours = nonNegative(f("laborHours"), "horas hombre") ?? Math.round(((endTime.getTime() - startTime.getTime()) / 3600_000) * workerCount * 100) / 100;
  const production = f("productionId") ? await ctx.db.productionOrder.findUniqueOrThrow({ where: { id: f("productionId") } }) : null;
  if (!production && !f("orderNumber")) throw new ValidationError({ orderNumber: "Indica la orden de producción" });
  return ctx.db.assemblyRun.create({
    data: {
      organizationId: ctx.orgId, workCenterId: wc.id, leaderId: f("leaderId"), productId: f("productId"), productionId: production?.id ?? null,
      orderNumber: production?.number ?? f("orderNumber"), productionDate: civil(date), startTime, endTime,
      assembled, defective, nonConforming, reworked: nonNegative(f("reworked"), "reprocesadas", { integer: true }) ?? 0,
      workerCount, laborHours, defectReason: f("defectReason") || null, observations: f("observations") || null,
    },
  });
}

export async function assemblyKpis(ctx: ExecContext, range: { gte: Date; lte: Date }) {
  const runs = await ctx.db.assemblyRun.findMany({ where: { productionDate: range }, select: { assembled: true, defective: true, nonConforming: true, laborHours: true } });
  const assembled = runs.reduce((s, r) => s + r.assembled, 0);
  const defective = runs.reduce((s, r) => s + r.defective + r.nonConforming, 0);
  const hours = runs.reduce((s, r) => s + r.laborHours, 0);
  const good = Math.max(assembled - defective, 0);
  return {
    corridas: runs.length, unidadesEnsambladas: assembled, unidadesBuenas: good, unidadesDefectuosas: defective,
    calidadPct: assembled ? Math.round((good / assembled) * 1000) / 10 : 0, unidadesPorHoraHombre: hours ? Math.round((good / hours) * 10) / 10 : 0,
  };
}

export async function injectionKpis(ctx: ExecContext, range: { gte: Date; lte: Date }) {
  const runs = await ctx.db.productionRun.findMany({ where: { productionDate: range }, select: { produced: true, damaged: true, nonConforming: true, downtimeMinutes: true } });
  const produced = runs.reduce((s, r) => s + r.produced, 0);
  const good = runs.reduce((s, r) => s + goodPieces(r), 0);
  return { corridasInyeccion: runs.length, piezasProducidas: produced, piezasBuenas: good, calidadInyeccionPct: produced ? Math.round((good / produced) * 1000) / 10 : 0, paradasMin: runs.reduce((s, r) => s + r.downtimeMinutes, 0) };
}

// ── Moldes ──

export async function createMold(ctx: ExecContext, d: { code: string; name: string }) {
  if (!d.code.trim() || !d.name.trim()) throw new ValidationError({ code: "Código y nombre son obligatorios" });
  return ctx.db.mold.create({ data: { organizationId: ctx.orgId, code: d.code.trim().toUpperCase(), name: d.name.trim() } });
}

/** Un montaje abierto por máquina: montar exige que la máquina esté libre y el molde disponible. */
export async function mountMold(ctx: ExecContext, d: { workCenterId: string; moldId: string; notes?: string }) {
  await ctx.db.workCenter.findUniqueOrThrow({ where: { id: d.workCenterId } });
  const busy = await ctx.db.moldChange.findFirst({ where: { workCenterId: d.workCenterId, finishedAt: null } });
  if (busy) throw new ValidationError({ workCenterId: "La máquina ya tiene un molde montado; desmóntalo primero" });
  const taken = await ctx.db.mold.updateMany({ where: { id: d.moldId, status: "AVAILABLE" }, data: { status: "IN_USE" } });
  if (taken.count !== 1) throw new ValidationError({ moldId: "El molde no está disponible" });
  return ctx.db.moldChange.create({ data: { organizationId: ctx.orgId, workCenterId: d.workCenterId, moldId: d.moldId, startedAt: new Date(), changedById: ctx.actorId ?? "", notes: d.notes?.trim() || null } });
}

export async function unmountMold(ctx: ExecContext, changeId: string, notes?: string) {
  const ch = await ctx.db.moldChange.findUniqueOrThrow({ where: { id: changeId } });
  const done = await ctx.db.moldChange.updateMany({ where: { id: ch.id, finishedAt: null }, data: { finishedAt: new Date(), notes: notes?.trim() || ch.notes } });
  if (done.count !== 1) throw new ValidationError({ change: "Este montaje ya fue cerrado" });
  await ctx.db.mold.updateMany({ where: { id: ch.moldId, status: "IN_USE" }, data: { status: "AVAILABLE" } });
}

/** Cambio directo de estado: un molde montado no se toca, y "en uso" solo se logra montándolo. */
export async function setMoldStatus(ctx: ExecContext, moldId: string, status: "AVAILABLE" | "MAINTENANCE") {
  const open = await ctx.db.moldChange.findFirst({ where: { moldId, finishedAt: null } });
  const mold = await ctx.db.mold.findUniqueOrThrow({ where: { id: moldId } });
  if (open || mold.status === "IN_USE") throw new ValidationError({ status: "El molde está montado; desmóntalo primero" });
  return ctx.db.mold.update({ where: { id: moldId }, data: { status } });
}

export async function moldKpis(ctx: ExecContext, range: { gte: Date; lte: Date }) {
  const [changes, open, inUse, total] = await Promise.all([
    ctx.db.moldChange.findMany({ where: { startedAt: range, finishedAt: { not: null } }, select: { startedAt: true, finishedAt: true } }),
    ctx.db.moldChange.count({ where: { finishedAt: null } }),
    ctx.db.mold.count({ where: { status: "IN_USE" } }),
    ctx.db.mold.count(),
  ]);
  const mins = changes.map((c) => Math.round((c.finishedAt!.getTime() - c.startedAt.getTime()) / 60000));
  const sum = mins.reduce((a, b) => a + b, 0);
  return { cambiosCompletados: mins.length, tiempoPromedioCambioMin: mins.length ? Math.round(sum / mins.length) : 0, tiempoTotalCambioMin: sum, cambiosAbiertos: open, moldesEnUso: inUse, moldesTotal: total };
}

// ── Control de tiempos (operaciones estándar) ──

export type EntryLike = { operatorId: string; startTime: Date; endTime: Date; standardSeconds: number; quantity: number; sharedBy: number };

const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60000;
export const standardMinutesOf = (e: Pick<EntryLike, "standardSeconds" | "quantity" | "sharedBy">) => ((e.standardSeconds / 60) * e.quantity) / Math.max(1, e.sharedBy);
/** Varios registros del mismo operario con el mismo inicio–fin son un solo bloque de tiempo. */
const blockKey = (e: EntryLike) => `${e.operatorId}|${e.startTime.getTime()}|${e.endTime.getTime()}`;

/** Eficiencia = minutos estándar ganados / minutos de bloques directos (puede pasar de 100 %). */
export function summarizeEntries(entries: EntryLike[]) {
  const blocks = new Map<string, { minutes: number; standard: number; direct: boolean }>();
  for (const e of entries) {
    const b = blocks.get(blockKey(e)) ?? { minutes: minutesBetween(e.startTime, e.endTime), standard: 0, direct: false };
    b.standard += standardMinutesOf(e);
    if (e.standardSeconds > 0) b.direct = true;
    blocks.set(blockKey(e), b);
  }
  let registered = 0, direct = 0, standard = 0;
  for (const b of blocks.values()) {
    registered += b.minutes;
    if (!b.direct) continue;
    direct += b.minutes;
    standard += b.standard;
  }
  return { registeredMinutes: registered, directMinutes: direct, standardMinutes: standard, efficiency: direct > 0 ? standard / direct : null, blocks: blocks.size };
}

export async function createStandardOperation(ctx: ExecContext, d: { code: string; name: string; family: string; standardSeconds: number }) {
  if (!d.code.trim() || !d.name.trim() || !d.family.trim()) throw new ValidationError({ code: "Código, nombre y familia son obligatorios" });
  if (!(d.standardSeconds >= 0)) throw new ValidationError({ standardSeconds: "Segundos estándar inválidos" });
  return ctx.db.standardOperation.create({ data: { organizationId: ctx.orgId, code: d.code.trim().toUpperCase(), name: d.name.trim(), family: d.family.trim().toUpperCase(), standardSeconds: d.standardSeconds } });
}

export async function createTimeEntry(ctx: ExecContext, f: F) {
  const date = f("workDate");
  const startTime = clock(date, f("startTime"));
  const endTime = clock(date, f("endTime"));
  if (endTime <= startTime) throw new ValidationError({ endTime: "La hora final debe ser posterior a la de inicio" });
  const operatorId = f("operatorId") || ctx.actorId!;
  const op = await ctx.db.standardOperation.findUniqueOrThrow({ where: { id: f("operationId") } });
  if (!op.active) throw new ValidationError({ operationId: "La operación está inactiva" });
  // Mismo inicio–fin = mismo bloque (válido); se rechazan los cruces parciales con otros bloques del operario
  const sameDay = await ctx.db.productionTimeEntry.findMany({ where: { operatorId, workDate: civil(date) }, select: { startTime: true, endTime: true } });
  const overlaps = sameDay.some((x) => {
    if (x.startTime.getTime() === startTime.getTime() && x.endTime.getTime() === endTime.getTime()) return false;
    return x.startTime < endTime && startTime < x.endTime;
  });
  if (overlaps) throw new ValidationError({ startTime: "El horario se cruza con otro registro del operario" });
  const production = f("productionId") ? await ctx.db.productionOrder.findUniqueOrThrow({ where: { id: f("productionId") } }) : null;
  return ctx.db.productionTimeEntry.create({
    data: {
      organizationId: ctx.orgId, operatorId, createdById: ctx.actorId, workDate: civil(date), startTime, endTime,
      section: f("section") === "EMPAQUE" ? "EMPAQUE" : "ENSAMBLE", productionId: production?.id ?? null, operationId: op.id,
      standardSeconds: op.standardSeconds, quantity: nonNegative(f("quantity"), "cantidad", { integer: true, required: true })!,
      sharedBy: Math.max(1, nonNegative(f("sharedBy"), "personas", { integer: true }) ?? 1), observations: f("observations") || null,
    },
  });
}
