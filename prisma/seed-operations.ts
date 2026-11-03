import type { ExecContext } from "@/lib/core/context";
import { completeMaintenanceOrder, createEquipment, createMaintenanceOrder, createPart, createQuote, startMaintenanceOrder } from "@/lib/apps/maintenance";
import { addStop, checklistFor, createCost, createIncident, createRoute, saveChecklist, saveVehicle, setRouteStatus, setStopStatus } from "@/lib/apps/logistics";
import { createAssemblyRun, createMold, createProductionRun, createStandardOperation, createTimeEntry, mountMold } from "@/lib/apps/plant";
import { addDaysKey, todayKey } from "@/lib/apps/ops-shared";

/** Firma de demostración (PNG 1×1) para las órdenes de mantenimiento cerradas. */
const SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Datos demo de planta, mantenimiento y logística (configuración y registros, sin código por cliente). */
export async function seedOperations(ctx: ExecContext, d: { productionId: string; productionNumber: string; productId: string; operatorId: string; logisticsId: string; salesOrderIds: string[]; customerId: string }) {
  const today = todayKey();
  const day = (n: number) => addDaysKey(today, n);
  const f = (o: Record<string, string | number>) => (k: string) => (o[k] === undefined ? "" : String(o[k]));

  // Máquina, estación de ensamble y molde (troquel)
  const press = await ctx.db.workCenter.create({ data: { organizationId: ctx.orgId, code: "PH-01", name: "Prensa hidráulica 200 t", kind: "MACHINE", brand: "Lien Chieh", model: "LC-200", location: "Nave 1", costPerHour: 95_000 } });
  const asm = await ctx.db.workCenter.create({ data: { organizationId: ctx.orgId, code: "ENS-1", name: "Ensamble final", kind: "ASSEMBLY", location: "Nave 2", costPerHour: 55_000, capacity: 3 } });
  const mold = await createMold(ctx, { code: "TRQ-TAPA-100", name: "Troquel tapa ACP-100" });
  await createMold(ctx, { code: "TRQ-BRIDA-2", name: "Troquel brida 2\"" });
  await mountMold(ctx, { workCenterId: press.id, moldId: mold.id, notes: "Montaje para corrida de tapas" });

  for (const [i, n] of [[-2, 180], [-1, 210], [0, 95]] as const) {
    await createProductionRun(ctx, f({
      workCenterId: press.id, operatorId: d.operatorId, productionId: d.productionId, productId: d.productId, moldId: mold.id, productionDate: day(i),
      startTime: "07:00", endTime: i === 0 ? "11:00" : "15:00", material: "Lámina inox 316 cal. 12", injectionWeight: 2400, pieceWeight: 2350,
      cycle: 90, cycleUnit: "seconds", cavities: 1, temperature: 0, produced: n, damaged: i === -1 ? 4 : 1, nonConforming: i === -2 ? 3 : 0,
      downtimeMinutes: i === -1 ? 25 : 0, observations: i === -1 ? "Cambio de matriz por desgaste" : "",
    }));
  }

  // Tiempos estándar y registros de ensamble
  const ops = [];
  for (const o of [
    { code: "ENS-VAL", name: "Instalar válvula de alivio", family: "ACP", standardSeconds: 240 },
    { code: "ENS-MAN", name: "Instalar manómetro", family: "ACP", standardSeconds: 120 },
    { code: "EMP-KIT", name: "Empacar y rotular", family: "ACP", standardSeconds: 180 },
    { code: "IND-ASEO", name: "Aseo y orden del puesto", family: "INDIRECTA", standardSeconds: 0 },
  ]) ops.push(await createStandardOperation(ctx, o));
  for (const [i, start, end, op, q] of [[-1, "07:00", "09:00", 0, 26], [-1, "09:00", "10:00", 1, 28], [-1, "10:00", "10:30", 3, 1], [0, "07:00", "09:00", 0, 30], [0, "09:00", "11:00", 2, 36]] as const) {
    await createTimeEntry(ctx, f({ operatorId: d.operatorId, workDate: day(i), startTime: start, endTime: end, section: op === 2 ? "EMPAQUE" : "ENSAMBLE", productionId: d.productionId, operationId: ops[op].id, quantity: q, sharedBy: 1 }));
  }
  await createAssemblyRun(ctx, f({ workCenterId: asm.id, leaderId: d.operatorId, productId: d.productId, productionId: d.productionId, productionDate: day(-1), startTime: "07:00", endTime: "15:00", assembled: 24, defective: 1, nonConforming: 0, reworked: 2, workerCount: 3, defectReason: "Fuga en rosca de manómetro" }));

  // Mantenimiento: equipos, órdenes en distintos estados, repuestos y cotización
  const eqPress = await createEquipment(ctx, { name: "Prensa hidráulica 200 t", code: "EQ-PH01", type: "MACHINE", workCenterId: press.id, location: "Nave 1" });
  const eqWeld = await createEquipment(ctx, { name: "Soldadora MIG Lincoln 350", code: "EQ-MIG01", type: "MACHINE", location: "Nave 1" });
  await createEquipment(ctx, { name: "Compresor de aire 10 HP", code: "EQ-COMP", type: "INFRA", location: "Cuarto de máquinas" });
  const done = await createMaintenanceOrder(ctx, { equipmentId: eqPress.id, type: "PREVENTIVE", priority: "MEDIUM", description: "Cambio de aceite hidráulico y filtros (plan trimestral)" });
  await startMaintenanceOrder(ctx, done.id);
  await completeMaintenanceOrder(ctx, done.id, { resolution: "Se cambiaron 60 L de aceite ISO 68 y dos filtros. Sin fugas.", downtimeMinutes: 150, signatureData: SIG, signedByName: "Jefe de planta", executorSignatureData: SIG, executorName: "Técnico de mantenimiento" });
  const running = await createMaintenanceOrder(ctx, { equipmentId: eqWeld.id, type: "CORRECTIVE", priority: "HIGH", description: "La antorcha se recalienta y el alambre se atasca en el alimentador" });
  await startMaintenanceOrder(ctx, running.id);
  await createMaintenanceOrder(ctx, { equipmentId: eqPress.id, type: "PREVENTIVE", priority: "LOW", description: "Inspección de mangueras y sellos" });
  await createPart(ctx, { name: "Boquilla de contacto MIG 0.9 mm", code: "REP-BOQ-09", category: "Repuesto", stock: 6, minStock: 10 });
  await createPart(ctx, { name: "Filtro hidráulico de retorno", code: "REP-FIL-HID", category: "Repuesto", stock: 4, minStock: 2 });
  await createPart(ctx, { name: "Torquímetro 1/2\"", code: "HER-TORQ", category: "Herramienta", stock: 1, minStock: 1 });
  await createQuote(ctx, { supplier: "Soldaduras y Equipos SAS", description: "Alimentador de alambre de reemplazo", amount: 2_350_000, maintenanceOrderId: running.id });

  // Logística: vehículos, conductores, ruta con pedidos, revisión, costos y novedades
  const L: ExecContext = { ...ctx, actorId: d.logisticsId };
  const truck = await saveVehicle(L, { plate: "WMK421", type: "CAMION", docs: { soatDue: day(140), technicalReviewDue: day(18), policyDue: day(200), operationCardDue: "", extinguisherDue: day(-3) } });
  await saveVehicle(L, { plate: "XYZ12F", type: "MOTO", docs: { soatDue: day(60), technicalReviewDue: day(90), policyDue: "", operationCardDue: "", extinguisherDue: "" } });
  const driver = await L.db.driver.create({ data: { organizationId: L.orgId, fullName: "Hernán Castillo", phone: "3104567890" } });
  await L.db.driver.create({ data: { organizationId: L.orgId, fullName: "Yesid Moreno", phone: "3157778899" } });
  await L.db.customer.update({ where: { id: d.customerId }, data: { address: "Cra 68 # 17-40, Zona Industrial Montevideo" } });
  const route = await createRoute(L, { date: today, vehicleId: truck.id, driverId: driver.id, notes: "Salida 7:30 a. m. desde PT", salesOrderIds: d.salesOrderIds });
  await addStop(L, route.id, { customerId: d.customerId, address: "Cl 13 # 32-55, Puente Aranda", city: "Bogotá", notes: "Recoger equipo para garantía" });
  await setRouteStatus(L, route.id, "IN_PROGRESS");
  const firstStop = await L.db.deliveryStop.findFirst({ where: { routeId: route.id }, orderBy: { position: "asc" } });
  if (firstStop) await setStopStatus(L, route.id, firstStop.id, "DELIVERED");
  const allGood = Object.fromEntries(checklistFor("CAMION").map((i) => [i.key, "B"]));
  await saveChecklist(L, { vehicleId: truck.id, driverId: driver.id, date: today, items: { ...allGood, llantas_labrado: "M" }, initials: "HC", notes: "Labrado trasero al límite" });
  await saveChecklist(L, { vehicleId: truck.id, driverId: driver.id, date: day(-1), items: allGood, initials: "HC" });
  await createCost(L, { vehicleId: truck.id, date: day(-1), category: "COMBUSTIBLE", amount: 380_000, notes: "Tanqueo ACPM" });
  await createCost(L, { vehicleId: truck.id, date: today, category: "PEAJES", amount: 46_500 });
  await createIncident(L, { vehicleId: truck.id, driverId: driver.id, date: today, type: "Retraso", description: "Cierre vial en la Av. Boyacá; entrega 1 h tarde", correctiveAction: "" });
}
