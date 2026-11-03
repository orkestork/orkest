"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { createAssemblyRun, createMold, createProductionRun, createStandardOperation, createTimeEntry, mountMold, setMoldStatus, unmountMold } from "@/lib/apps/plant";
import { openMoldRepair } from "@/lib/apps/maintenance";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const getter = (f: FormData) => (k: string) => s(f, k);
const write = () => actionContext("manufacturing.write", "manufacturing");

export async function saveInjectionRun(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    const r = await createProductionRun(ctx, getter(form));
    revalidatePath("/manufacturing/runs");
    return { ok: `Corrida registrada · OP ${r.orderNumber} · ${r.produced} piezas` };
  });
}

export async function saveAssemblyRun(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    const r = await createAssemblyRun(ctx, getter(form));
    revalidatePath("/manufacturing/assembly");
    return { ok: `Corrida de ensamble registrada · ${r.assembled} unidades` };
  });
}

export async function saveTimeEntry(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await createTimeEntry(ctx, getter(form));
    revalidatePath("/manufacturing/assembly");
    return { ok: "Tiempo registrado" };
  });
}

export async function deleteTimeEntry(form: FormData) {
  const ctx = await write();
  await ctx.db.productionTimeEntry.delete({ where: { id: s(form, "id") } });
  revalidatePath("/manufacturing/assembly");
}

export async function saveStandardOperation(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await createStandardOperation(ctx, { code: s(form, "code"), name: s(form, "name"), family: s(form, "family"), standardSeconds: Number(s(form, "standardSeconds")) });
    revalidatePath("/manufacturing/assembly");
    return { ok: "Operación estándar creada" };
  });
}

export async function toggleStandardOperation(form: FormData) {
  const ctx = await write();
  await ctx.db.standardOperation.update({ where: { id: s(form, "id") }, data: { active: s(form, "active") === "1" } });
  revalidatePath("/manufacturing/assembly");
}

export async function saveMold(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await createMold(ctx, { code: s(form, "code"), name: s(form, "name") });
    revalidatePath("/manufacturing/molds");
    return { ok: "Molde creado" };
  });
}

export async function mountMoldAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await mountMold(ctx, { workCenterId: s(form, "workCenterId"), moldId: s(form, "moldId"), notes: s(form, "notes") });
    revalidatePath("/manufacturing/molds");
    return { ok: "Molde montado" };
  });
}

export async function moldStep(form: FormData) {
  const ctx = await write();
  const op = s(form, "op");
  if (op === "unmount") await unmountMold(ctx, s(form, "changeId"));
  else if (op === "available") await setMoldStatus(ctx, s(form, "moldId"), "AVAILABLE");
  else if (op === "repair") {
    await setMoldStatus(ctx, s(form, "moldId"), "MAINTENANCE");
    // Con Mantenimiento activo, el molde abre su orden correctiva automáticamente
    if (ctx.hasModule("maintenance")) await openMoldRepair(ctx, s(form, "moldId"));
  }
  revalidatePath("/manufacturing/molds");
}
