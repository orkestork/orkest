import type { ExecContext } from "@/lib/core/context";
import { nextNumber } from "@/lib/core/db";
import { addActivity } from "@/lib/core/notify";
import { ValidationError } from "./crm";
import { civil, LABELS, oneOf } from "./ops-shared";

/**
 * Logística: conductores, vehículos (vencimientos de documentos y revisión pre-operacional),
 * rutas de entrega con paradas (pedidos de venta o entregas manuales a clientes del CRM),
 * costos de transporte y novedades.
 */

export type ChecklistItem = { key: string; category: string; label: string };
// Formato de revisión diaria pre-operacional (moto vs. vehículo de 4 ruedas)
export const CHECKLIST_MOTO: ChecklistItem[] = [
  { key: "frenos_funcionamiento", category: "Frenos y llantas", label: "Funcionamiento adecuado de frenos" },
  { key: "llantas_presion", category: "Frenos y llantas", label: "Presión, estado general de llantas" },
  { key: "luces", category: "Frenos y llantas", label: "Luces delanteras/traseras" },
  { key: "direccion_manillar", category: "Dirección y espejos", label: "Dirección/manillar y espejos" },
  { key: "niveles_fluidos", category: "Dirección y espejos", label: "Niveles de fluidos" },
  { key: "cadena_transmision", category: "Dirección y espejos", label: "Cadena/transmisión" },
  { key: "suspension", category: "Suspensión", label: "Suspensión delantera y trasera" },
  { key: "casco", category: "Protección conductor", label: "Casco de seguridad" },
  { key: "elementos_prevencion", category: "Protección conductor", label: "Elementos de prevención" },
  { key: "carga_asegurada", category: "Carga", label: "Carga asegurada" },
];
export const CHECKLIST_VEHICULO: ChecklistItem[] = [
  { key: "frenos_liquido", category: "Frenos", label: "Nivel y líquido de frenos" },
  { key: "frenos_pastillas", category: "Frenos", label: "Grosor de pastillas / bandas" },
  { key: "llantas_presion", category: "Llantas y ruedas", label: "Presión de aire" },
  { key: "llantas_labrado", category: "Llantas y ruedas", label: "Profundidad de labrado" },
  { key: "llantas_rines", category: "Llantas y ruedas", label: "Estado de rines" },
  { key: "aceite", category: "Fluidos y motor", label: "Nivel y estado de aceite" },
  { key: "fugas_carter", category: "Fluidos y motor", label: "Fugas en cárter o empaques" },
  { key: "refrigerante", category: "Fluidos y motor", label: "Nivel de refrigerante" },
  { key: "luces_altas_bajas", category: "Sistema eléctrico", label: "Luces altas/bajas y direccionales" },
  { key: "luz_freno", category: "Sistema eléctrico", label: "Luz de freno" },
  { key: "pito", category: "Sistema eléctrico", label: "Pito / bocina" },
  { key: "bateria", category: "Sistema eléctrico", label: "Batería (bornes y sulfatación)" },
  { key: "fugas_barras", category: "Suspensión y dirección", label: "Fugas de aceite en barras" },
  { key: "copa_direccion", category: "Suspensión y dirección", label: "Juego en la copa de dirección" },
  { key: "amortiguacion", category: "Suspensión y dirección", label: "Amortiguación trasera" },
  { key: "acelerador", category: "Comandos y cables", label: "Juego libre del acelerador" },
  { key: "embrague", category: "Comandos y cables", label: "Recorrido del embrague" },
  { key: "guayas", category: "Comandos y cables", label: "Estado general de guayas" },
  { key: "botiquin", category: "Equipo de carretera", label: "Botiquín y linterna" },
  { key: "herramientas", category: "Equipo de carretera", label: "Herramientas" },
  { key: "kit_carretera", category: "Equipo de carretera", label: "Kit de carretera / señales" },
  { key: "extintor", category: "Equipo de carretera", label: "Extintor" },
  { key: "espejos", category: "Espejos y otros", label: "Espejos laterales y retrovisor" },
  { key: "filtros", category: "Espejos y otros", label: "Filtros (aire / combustible)" },
];
export const checklistFor = (type: string) => (type === "MOTO" ? CHECKLIST_MOTO : CHECKLIST_VEHICULO);

export const VEHICLE_DOCS = [
  { key: "soatDue", label: "SOAT" },
  { key: "technicalReviewDue", label: "Revisión técnico-mecánica" },
  { key: "policyDue", label: "Póliza" },
  { key: "operationCardDue", label: "Tarjeta de operación" },
  { key: "extinguisherDue", label: "Extintor" },
] as const;

/** Documento vencido o por vencer en 30 días. */
export function docState(due: Date | null) {
  if (!due) return null;
  const days = Math.ceil((due.getTime() - Date.now()) / 86400_000);
  return days < 0 ? { tone: "rose", label: "Vencido" } : days <= 30 ? { tone: "amber", label: `Vence en ${days} d` } : { tone: "emerald", label: "Vigente" };
}

export async function saveVehicle(ctx: ExecContext, d: { id?: string; plate: string; type: string; docs: Record<string, string> }) {
  const plate = d.plate.trim().toUpperCase();
  if (!plate) throw new ValidationError({ plate: "Placa obligatoria" });
  const docs = Object.fromEntries(VEHICLE_DOCS.map((x) => [x.key, d.docs[x.key] ? civil(d.docs[x.key]) : null]));
  const data = { plate, type: oneOf(d.type, LABELS.vehicleType, "tipo"), ...docs };
  return d.id ? ctx.db.vehicle.update({ where: { id: d.id }, data }) : ctx.db.vehicle.create({ data: { organizationId: ctx.orgId, ...data } });
}

export async function saveChecklist(ctx: ExecContext, d: { vehicleId: string; driverId: string; date: string; items: Record<string, string>; initials?: string; notes?: string }) {
  const v = await ctx.db.vehicle.findUniqueOrThrow({ where: { id: d.vehicleId } });
  await ctx.db.driver.findUniqueOrThrow({ where: { id: d.driverId } });
  const items = Object.fromEntries(checklistFor(v.type).map((i) => [i.key, ["B", "M", "NA"].includes(d.items[i.key]) ? d.items[i.key] : "NA"]));
  const date = civil(d.date);
  const existing = await ctx.db.vehicleChecklistEntry.findFirst({ where: { vehicleId: v.id, date } });
  const data = { driverId: d.driverId, items, initials: d.initials?.trim() || null, notes: d.notes?.trim() || null, createdById: ctx.actorId ?? "" };
  return existing
    ? ctx.db.vehicleChecklistEntry.update({ where: { id: existing.id }, data })
    : ctx.db.vehicleChecklistEntry.create({ data: { organizationId: ctx.orgId, vehicleId: v.id, date, ...data } });
}

/** Pedidos de venta confirmados sin entrega completa y sin ruta asignada. */
export async function assignableOrders(ctx: ExecContext) {
  const routed = await ctx.db.deliveryRoute.findMany({ where: { status: { not: "DONE" } }, select: { stops: { select: { salesOrderId: true } } } });
  const taken = new Set(routed.flatMap((r) => r.stops.map((s) => s.salesOrderId)).filter(Boolean) as string[]);
  const orders = await ctx.db.salesOrder.findMany({
    where: { status: "confirmed", deliveryStatus: { not: "full" } }, include: { customer: true }, orderBy: { createdAt: "asc" }, take: 300,
  });
  return orders.filter((o) => !taken.has(o.id));
}

export async function createRoute(ctx: ExecContext, d: { date: string; vehicleId: string; driverId: string; notes?: string; salesOrderIds: string[] }) {
  await ctx.db.vehicle.findUniqueOrThrow({ where: { id: d.vehicleId } });
  await ctx.db.driver.findUniqueOrThrow({ where: { id: d.driverId } });
  const orders = d.salesOrderIds.length ? await ctx.db.salesOrder.findMany({ where: { id: { in: d.salesOrderIds } }, include: { customer: true } }) : [];
  const route = await ctx.db.deliveryRoute.create({
    data: {
      organizationId: ctx.orgId, number: await nextNumber(ctx.db, ctx.orgId, "RUT", 4), date: civil(d.date), vehicleId: d.vehicleId, driverId: d.driverId,
      notes: d.notes?.trim() || null, createdById: ctx.actorId ?? "",
      stops: { create: orders.map((o, i) => ({ salesOrderId: o.id, customerId: o.customerId, name: `${o.number} · ${o.customer.name}`, phone: o.customer.phone, address: o.customer.address ?? "", city: o.customer.city ?? "", position: i })) },
    },
  });
  await addActivity(ctx, "delivery_route", route.id, `Ruta ${route.number} creada con ${orders.length} pedidos`);
  return route;
}

/** Valida que la ruta pertenece a la organización antes de tocar sus paradas. */
const ownRoute = (ctx: ExecContext, routeId: string) => ctx.db.deliveryRoute.findUniqueOrThrow({ where: { id: routeId }, include: { stops: true } });

export async function addStop(ctx: ExecContext, routeId: string, d: { salesOrderId?: string; customerId?: string; address?: string; city?: string; notes?: string }) {
  const route = await ownRoute(ctx, routeId);
  if (route.status === "DONE") throw new ValidationError({ status: "La ruta ya está finalizada" });
  const position = route.stops.length;
  if (d.salesOrderId) {
    const o = await ctx.db.salesOrder.findUniqueOrThrow({ where: { id: d.salesOrderId }, include: { customer: true } });
    return ctx.db.deliveryStop.create({ data: { routeId, salesOrderId: o.id, customerId: o.customerId, name: `${o.number} · ${o.customer.name}`, phone: o.customer.phone, address: d.address?.trim() || o.customer.address || "", city: d.city?.trim() || o.customer.city || "", position, notes: d.notes?.trim() || null } });
  }
  const c = await ctx.db.customer.findUniqueOrThrow({ where: { id: d.customerId ?? "" } });
  const address = d.address?.trim() || c.address || "";
  if (!address) throw new ValidationError({ address: "El cliente no tiene dirección; escríbela" });
  if (!c.address && d.address?.trim()) await ctx.db.customer.update({ where: { id: c.id }, data: { address: d.address.trim(), city: c.city ?? (d.city?.trim() || null) } });
  return ctx.db.deliveryStop.create({ data: { routeId, customerId: c.id, name: c.name, phone: c.phone, address, city: d.city?.trim() || c.city || "", position, notes: d.notes?.trim() || null } });
}

export async function setStopStatus(ctx: ExecContext, routeId: string, stopId: string, status: string) {
  await ownRoute(ctx, routeId);
  const r = await ctx.db.deliveryStop.updateMany({ where: { id: stopId, routeId }, data: { status: oneOf(status, LABELS.stopStatus, "estado") } });
  if (r.count !== 1) throw new ValidationError({ stop: "Parada no encontrada" });
}

export async function removeStop(ctx: ExecContext, routeId: string, stopId: string) {
  await ownRoute(ctx, routeId);
  await ctx.db.deliveryStop.deleteMany({ where: { id: stopId, routeId } });
}

export async function setRouteStatus(ctx: ExecContext, routeId: string, status: string) {
  const s = oneOf(status, LABELS.routeStatus, "estado");
  await ctx.db.deliveryRoute.update({ where: { id: routeId }, data: { status: s } });
  await addActivity(ctx, "delivery_route", routeId, `Estado: ${LABELS.routeStatus[s][0]}`);
}

export async function deleteRoute(ctx: ExecContext, routeId: string) {
  const r = await ownRoute(ctx, routeId);
  if (r.status !== "PLANNED") throw new ValidationError({ status: "Solo se eliminan rutas planeadas" });
  await ctx.db.deliveryRoute.delete({ where: { id: routeId } });
}

/** Enlace de Google Maps con la ruta completa (sin API key): origen = primera parada. */
export function mapsUrl(stops: { address: string; city: string }[]) {
  const pts = stops.filter((s) => s.address).map((s) => `${s.address}, ${s.city}`.trim());
  if (!pts.length) return null;
  const enc = (s: string) => encodeURIComponent(s);
  if (pts.length === 1) return `https://www.google.com/maps/search/?api=1&query=${enc(pts[0])}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${enc(pts[0])}&destination=${enc(pts[pts.length - 1])}${pts.length > 2 ? `&waypoints=${enc(pts.slice(1, -1).join("|"))}` : ""}&travelmode=driving`;
}

export async function createCost(ctx: ExecContext, d: { vehicleId: string; date: string; category: string; amount: number; notes?: string }) {
  await ctx.db.vehicle.findUniqueOrThrow({ where: { id: d.vehicleId } });
  if (!(d.amount > 0)) throw new ValidationError({ amount: "Monto inválido" });
  return ctx.db.transportCost.create({ data: { organizationId: ctx.orgId, vehicleId: d.vehicleId, date: civil(d.date), category: oneOf(d.category, LABELS.costCategory, "categoría"), amount: Math.round(d.amount), notes: d.notes?.trim() || null, createdById: ctx.actorId ?? "" } });
}

export async function createIncident(ctx: ExecContext, d: { vehicleId?: string; driverId?: string; date: string; type: string; description: string; correctiveAction?: string }) {
  if (!d.type.trim() || !d.description.trim()) throw new ValidationError({ type: "Tipo y descripción son obligatorios" });
  if (d.vehicleId) await ctx.db.vehicle.findUniqueOrThrow({ where: { id: d.vehicleId } });
  if (d.driverId) await ctx.db.driver.findUniqueOrThrow({ where: { id: d.driverId } });
  return ctx.db.transportIncident.create({ data: { organizationId: ctx.orgId, vehicleId: d.vehicleId || null, driverId: d.driverId || null, date: civil(d.date), type: d.type.trim(), description: d.description.trim(), correctiveAction: d.correctiveAction?.trim() || null, createdById: ctx.actorId ?? "" } });
}

export async function logisticsKpis(ctx: ExecContext, range: { gte: Date; lte: Date }) {
  const [routes, costs, openIncidents] = await Promise.all([
    ctx.db.deliveryRoute.findMany({ where: { date: range }, select: { status: true, stops: { select: { status: true } } } }),
    ctx.db.transportCost.aggregate({ where: { date: range }, _sum: { amount: true } }),
    ctx.db.transportIncident.count({ where: { status: "OPEN" } }),
  ]);
  const stops = routes.flatMap((r) => r.stops);
  return {
    rutasTotal: routes.length, rutasFinalizadas: routes.filter((r) => r.status === "DONE").length,
    paradasEnRuta: stops.length, paradasEntregadas: stops.filter((s) => s.status === "DELIVERED").length,
    costoTotal: Number(costs._sum.amount ?? 0), novedadesAbiertas: openIncidents,
  };
}
