"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { adjustStock, archiveWarehouse, cancelTransfer, checkAvailability, createTransfer, createWarehouse, operationType, renameWarehouse, restoreWarehouse, transferBetweenWarehouses, validateTransfer } from "@/lib/apps/stock";
import { runReplenishment } from "@/lib/apps/replenishment";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveWarehouse(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("inventory.write", "inventory");
    const wh = await createWarehouse(ctx, { code: s(form, "code"), name: s(form, "name") });
    revalidatePath("/inventory", "layout");
    return { ok: `Almacén ${wh.code} creado con sus ubicaciones y tipos de operación` };
  });
}

export async function saveTransfer(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("inventory.write", "inventory");
    const lines = (JSON.parse(s(form, "lines") || "[]") as { productId: string; quantity: number }[]).filter((l) => l.productId);
    let t;
    if (s(form, "mode") === "warehouses") {
      const from = await ctx.db.warehouse.findUniqueOrThrow({ where: { id: s(form, "fromWarehouseId") } });
      const to = await ctx.db.warehouse.findUniqueOrThrow({ where: { id: s(form, "toWarehouseId") } });
      if (from.id === to.id) return { error: "El origen y el destino deben ser almacenes distintos" };
      const op = await operationType(ctx, to.id, "INTERNAL");
      t = await createTransfer(ctx, { operationTypeId: op.id, srcLocationId: from.stockLocationId!, destLocationId: to.stockLocationId!, origin: s(form, "origin") || `Traslado ${from.code} → ${to.code}`, lines });
    } else {
      t = await createTransfer(ctx, {
        operationTypeId: s(form, "operationTypeId"), srcLocationId: s(form, "srcLocationId") || undefined, destLocationId: s(form, "destLocationId") || undefined,
        origin: s(form, "origin") || undefined, partnerName: s(form, "partnerName") || undefined, lines,
      });
    }
    redirect(`/inventory/transfers/${t.id}`);
  });
}

export async function validateTransferAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("inventory.write", "inventory");
    const id = s(form, "id");
    const done: Record<string, number> = {};
    for (const [k, v] of form.entries()) if (k.startsWith("done_")) done[k.slice(5)] = Number(v);
    const r = await validateTransfer(ctx, id, done);
    revalidatePath(`/inventory/transfers/${id}`);
    if (r.backorderId) redirect(`/inventory/transfers/${r.backorderId}`);
    return { ok: "Transferencia validada" };
  });
}

export async function transferAction(form: FormData) {
  const ctx = await actionContext("inventory.write", "inventory");
  const id = s(form, "id");
  if (s(form, "op") === "cancel") await cancelTransfer(ctx, id);
  else await checkAvailability(ctx, id);
  revalidatePath(`/inventory/transfers/${id}`);
}

export async function adjustAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("inventory.write", "inventory");
    const t = await adjustStock(ctx, s(form, "productId"), s(form, "locationId"), Number(s(form, "quantity")), s(form, "reason") || "Ajuste de inventario");
    revalidatePath("/inventory");
    return { ok: t ? `Ajuste ${t.number} registrado` : "Sin cambios: la existencia ya era esa" };
  });
}

export async function saveRule(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("inventory.write", "inventory");
    const min = Number(s(form, "minQty")), max = Number(s(form, "maxQty"));
    if (!(max >= min) || min < 0) return { error: "El máximo debe ser ≥ mínimo" };
    const action = s(form, "action");
    if (action === "TRANSFER" && !s(form, "sourceLocationId")) return { error: "Indica la bodega de origen" };
    if (s(form, "sourceLocationId") && s(form, "sourceLocationId") === s(form, "locationId")) return { error: "Origen y destino no pueden ser iguales" };
    const data = {
      productId: s(form, "productId"), locationId: s(form, "locationId"), minQty: min, maxQty: max, multiple: Number(s(form, "multiple") || 1),
      trigger: s(form, "trigger") || "AUTO", action, sourceLocationId: s(form, "sourceLocationId") || null, supplierId: s(form, "supplierId") || null,
    };
    await ctx.db.reorderRule.upsert({
      where: { productId_locationId: { productId: data.productId, locationId: data.locationId } },
      create: { organizationId: ctx.orgId, ...data }, update: data,
    });
    revalidatePath("/inventory/replenishment");
    return { ok: "Regla guardada" };
  });
}

export async function runRules(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("inventory.write", "inventory");
    const ids = form.getAll("ruleId").map(String);
    const res = await runReplenishment(ctx, { manual: true, ...(ids.length ? { ruleIds: ids } : {}) });
    revalidatePath("/inventory/replenishment");
    if (!res.length) return { ok: "Nada que reabastecer: todos los pronósticos están sobre el mínimo" };
    return { ok: res.map((r) => `${r.product}: ${r.skipped ? `omitido (${r.skipped})` : `${r.qty} → ${r.document}`}`).join(" · ") };
  });
}

export async function deleteRule(form: FormData) {
  const ctx = await actionContext("inventory.write", "inventory");
  await ctx.db.reorderRule.deleteMany({ where: { id: s(form, "id") } });
  revalidatePath("/inventory/replenishment");
}

export async function quickTransferAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("inventory.write", "inventory");
    const validate = s(form, "validate") !== "no";
    const t = await transferBetweenWarehouses(ctx, {
      productId: s(form, "productId"), fromWarehouseId: s(form, "fromWarehouseId"), toWarehouseId: s(form, "toWarehouseId"),
      quantity: Number(s(form, "quantity")), validate, note: s(form, "note") || undefined,
    });
    revalidatePath("/inventory", "layout");
    return { ok: validate ? `Traslado ${t.number} realizado` : `Traslado ${t.number} creado como pendiente` };
  });
}

export async function warehouseAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("inventory.write", "inventory");
    const id = s(form, "id"), op = s(form, "op");
    if (op === "rename") await renameWarehouse(ctx, id, s(form, "name"));
    else if (op === "archive") await archiveWarehouse(ctx, id);
    else if (op === "restore") await restoreWarehouse(ctx, id);
    revalidatePath("/inventory", "layout");
    return { ok: op === "rename" ? "Nombre actualizado" : op === "archive" ? "Almacén archivado" : "Almacén restaurado" };
  });
}
