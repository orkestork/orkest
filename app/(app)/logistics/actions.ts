"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import {
  addStop, checklistFor, createCost, createIncident, createRoute, deleteRoute, removeStop, saveChecklist, saveVehicle,
  setRouteStatus, setStopStatus, VEHICLE_DOCS,
} from "@/lib/apps/logistics";
import { ValidationError } from "@/lib/apps/crm";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const write = () => actionContext("logistics.write", "logistics");

export async function saveRoute(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    const r = await createRoute(ctx, { date: s(form, "date"), vehicleId: s(form, "vehicleId"), driverId: s(form, "driverId"), notes: s(form, "notes"), salesOrderIds: form.getAll("salesOrderIds").map(String) });
    redirect(`/logistics/routes/${r.id}`);
  });
}

export async function routeStatus(form: FormData) {
  const ctx = await write();
  await setRouteStatus(ctx, s(form, "id"), s(form, "status"));
  revalidatePath(`/logistics/routes/${s(form, "id")}`);
}

export async function removeRoute(form: FormData) {
  const ctx = await write();
  await deleteRoute(ctx, s(form, "id"));
  redirect("/logistics");
}

export async function saveStop(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    const target = s(form, "target");
    const [kind, id] = target.split(":");
    if (!id) return { error: "Selecciona un pedido o un cliente" };
    await addStop(ctx, s(form, "routeId"), { salesOrderId: kind === "so" ? id : undefined, customerId: kind === "c" ? id : undefined, address: s(form, "address"), city: s(form, "city"), notes: s(form, "notes") });
    revalidatePath(`/logistics/routes/${s(form, "routeId")}`);
    return { ok: "Parada agregada" };
  });
}

export async function stopAction(form: FormData) {
  const ctx = await write();
  const routeId = s(form, "routeId");
  if (s(form, "op") === "remove") await removeStop(ctx, routeId, s(form, "stopId"));
  else await setStopStatus(ctx, routeId, s(form, "stopId"), s(form, "status"));
  revalidatePath(`/logistics/routes/${routeId}`);
}

export async function saveDriver(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    if (!s(form, "fullName")) return { error: "Nombre obligatorio" };
    await ctx.db.driver.create({ data: { organizationId: ctx.orgId, fullName: s(form, "fullName"), phone: s(form, "phone") || null } });
    revalidatePath("/logistics/drivers");
    return { ok: "Conductor creado" };
  });
}

export async function toggleDriver(form: FormData) {
  const ctx = await write();
  await ctx.db.driver.update({ where: { id: s(form, "id") }, data: { active: s(form, "active") === "1" } });
  revalidatePath("/logistics/drivers");
}

export async function saveVehicleAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    const v = await saveVehicle(ctx, { id: s(form, "id") || undefined, plate: s(form, "plate"), type: s(form, "type"), docs: Object.fromEntries(VEHICLE_DOCS.map((d) => [d.key, s(form, d.key)])) });
    revalidatePath("/logistics/vehicles");
    revalidatePath(`/logistics/vehicles/${v.id}`);
    return { ok: "Vehículo guardado" };
  });
}

export async function toggleVehicle(form: FormData) {
  const ctx = await write();
  await ctx.db.vehicle.update({ where: { id: s(form, "id") }, data: { active: s(form, "active") === "1" } });
  revalidatePath("/logistics/vehicles");
}

export async function saveChecklistAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    const v = await ctx.db.vehicle.findUniqueOrThrow({ where: { id: s(form, "vehicleId") } });
    if (!s(form, "driverId")) throw new ValidationError({ driverId: "Selecciona el conductor" });
    const items = Object.fromEntries(checklistFor(v.type).map((i) => [i.key, s(form, `item:${i.key}`)]));
    await saveChecklist(ctx, { vehicleId: v.id, driverId: s(form, "driverId"), date: s(form, "date"), items, initials: s(form, "initials"), notes: s(form, "notes") });
    revalidatePath(`/logistics/vehicles/${v.id}`);
    return { ok: "Revisión guardada" };
  });
}

export async function saveCost(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await createCost(ctx, { vehicleId: s(form, "vehicleId"), date: s(form, "date"), category: s(form, "category"), amount: Number(s(form, "amount")), notes: s(form, "notes") });
    revalidatePath("/logistics/costs");
    return { ok: "Costo registrado" };
  });
}

export async function deleteCost(form: FormData) {
  const ctx = await write();
  await ctx.db.transportCost.delete({ where: { id: s(form, "id") } });
  revalidatePath("/logistics/costs");
}

export async function saveIncident(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await createIncident(ctx, { vehicleId: s(form, "vehicleId"), driverId: s(form, "driverId"), date: s(form, "date"), type: s(form, "type"), description: s(form, "description"), correctiveAction: s(form, "correctiveAction") });
    revalidatePath("/logistics/incidents");
    return { ok: "Novedad registrada" };
  });
}

export async function resolveIncident(form: FormData) {
  const ctx = await write();
  await ctx.db.transportIncident.update({ where: { id: s(form, "id") }, data: { status: "RESOLVED", correctiveAction: s(form, "correctiveAction") || undefined } });
  revalidatePath("/logistics/incidents");
}
