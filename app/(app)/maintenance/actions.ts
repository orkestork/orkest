"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import {
  cancelMaintenanceOrder, completeMaintenanceOrder, createEquipment, createMaintenanceOrder, createPart, createQuote,
  movePart, setEquipmentStatus, setQuoteStatus, startMaintenanceOrder,
} from "@/lib/apps/maintenance";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const write = () => actionContext("maintenance.write", "maintenance");

export async function saveEquipment(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await createEquipment(ctx, { name: s(form, "name"), code: s(form, "code"), type: s(form, "type"), location: s(form, "location"), workCenterId: s(form, "workCenterId"), moldId: s(form, "moldId") });
    revalidatePath("/maintenance/equipment");
    return { ok: "Equipo creado" };
  });
}

export async function equipmentStatus(form: FormData) {
  const ctx = await write();
  await setEquipmentStatus(ctx, s(form, "id"), s(form, "status"));
  revalidatePath("/maintenance/equipment");
}

export async function saveOrder(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    const o = await createMaintenanceOrder(ctx, { equipmentId: s(form, "equipmentId"), type: s(form, "type"), priority: s(form, "priority"), description: s(form, "description"), assignedToId: s(form, "assignedToId") });
    redirect(`/maintenance/orders/${o.id}`);
  });
}

export async function orderStep(form: FormData) {
  const ctx = await write();
  const id = s(form, "id");
  if (s(form, "op") === "start") await startMaintenanceOrder(ctx, id);
  else if (s(form, "op") === "cancel") await cancelMaintenanceOrder(ctx, id);
  revalidatePath(`/maintenance/orders/${id}`);
}

export async function completeOrder(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    const id = s(form, "id");
    await completeMaintenanceOrder(ctx, id, {
      resolution: s(form, "resolution"), downtimeMinutes: s(form, "downtimeMinutes") ? Math.max(0, Math.round(Number(s(form, "downtimeMinutes")))) : null,
      signatureData: s(form, "signatureData"), signedByName: s(form, "signedByName"), executorSignatureData: s(form, "executorSignatureData"), executorName: s(form, "executorName"),
    });
    revalidatePath(`/maintenance/orders/${id}`);
    return { ok: "Orden completada y firmada" };
  });
}

export async function savePart(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await createPart(ctx, { name: s(form, "name"), code: s(form, "code"), category: s(form, "category"), stock: Number(s(form, "stock") || 0), minStock: Number(s(form, "minStock") || 0), unit: s(form, "unit") });
    revalidatePath("/maintenance/parts");
    return { ok: "Ítem creado" };
  });
}

export async function partMove(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    const qty = Number(s(form, "quantity"));
    await movePart(ctx, s(form, "productId"), s(form, "dir") === "out" ? -qty : qty, s(form, "note"));
    revalidatePath("/maintenance/parts");
    return { ok: "Movimiento registrado" };
  });
}

export async function saveQuote(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await createQuote(ctx, { supplierId: s(form, "supplierId"), supplier: s(form, "supplier"), description: s(form, "description"), amount: Number(s(form, "amount")), maintenanceOrderId: s(form, "maintenanceOrderId") });
    revalidatePath("/maintenance/quotes");
    if (s(form, "maintenanceOrderId")) revalidatePath(`/maintenance/orders/${s(form, "maintenanceOrderId")}`);
    return { ok: "Cotización registrada" };
  });
}

export async function quoteStatus(form: FormData) {
  const ctx = await write();
  await setQuoteStatus(ctx, s(form, "id"), s(form, "status"));
  revalidatePath("/maintenance/quotes");
}
