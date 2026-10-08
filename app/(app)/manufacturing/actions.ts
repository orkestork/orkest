"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { buyShortages, createBom, createProduction, produce, workOrderAction } from "@/lib/apps/manufacturing";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveProduction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("manufacturing.write", "manufacturing");
    const mo = await createProduction(ctx, { productId: s(form, "productId"), quantity: Number(s(form, "quantity")), warehouseId: s(form, "warehouseId") || undefined, scheduledAt: s(form, "scheduledAt") || undefined, origin: s(form, "origin") || undefined });
    redirect(`/manufacturing/orders/${mo.id}`);
  });
}

export async function produceAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("manufacturing.write", "manufacturing");
    const id = s(form, "id");
    const r = await produce(ctx, id, s(form, "quantity") ? Number(s(form, "quantity")) : undefined);
    revalidatePath(`/manufacturing/orders/${id}`);
    return { ok: `Producidas ${r.produced} unidades. Componentes consumidos y terminado ingresado al inventario.` };
  });
}

export async function workOrderStep(form: FormData) {
  const ctx = await actionContext("manufacturing.write", "manufacturing");
  await workOrderAction(ctx, s(form, "id"), s(form, "op") === "finish" ? "finish" : "start");
  revalidatePath(`/manufacturing/orders/${s(form, "productionId")}`);
}

export async function saveBom(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("manufacturing.write", "manufacturing");
    const lines = (JSON.parse(s(form, "lines") || "[]") as { productId: string; quantity: number }[]).filter((l) => l.productId).map((l) => ({ componentId: l.productId, quantity: l.quantity }));
    const operations = [0, 1, 2, 3].map((i) => ({ workCenterId: s(form, `op_wc_${i}`), name: s(form, `op_name_${i}`), durationMinutes: Number(s(form, `op_min_${i}`) || 0) })).filter((o) => o.workCenterId && o.name && o.durationMinutes > 0);
    await createBom(ctx, { productId: s(form, "productId"), code: s(form, "code"), type: s(form, "type") || "NORMAL", quantity: Number(s(form, "quantity") || 1), lines, operations });
    redirect("/manufacturing/boms");
  });
}

export async function saveWorkCenter(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("manufacturing.write", "manufacturing");
    if (!s(form, "code") || !s(form, "name")) return { error: "Código y nombre son obligatorios" };
    await ctx.db.workCenter.create({ data: { organizationId: ctx.orgId, code: s(form, "code").toUpperCase(), name: s(form, "name"), costPerHour: Number(s(form, "costPerHour") || 0), capacity: Number(s(form, "capacity") || 1) } });
    revalidatePath("/manufacturing/workcenters");
    return { ok: "Centro de trabajo creado" };
  });
}

export async function buyShortagesAction(_: ActionResult): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("purchasing.write", "purchasing");
    const out = await buyShortages(ctx);
    revalidatePath("/manufacturing/planning");
    return { ok: out.length ? out.join(" · ") : "No hay faltantes" };
  });
}
