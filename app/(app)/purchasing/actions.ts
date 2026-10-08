"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { getFieldDefs, customFieldsFromForm } from "@/lib/core/custom-fields";
import { createPurchaseOrder, createReceipt, createRequisition, rfqFromRequisition } from "@/lib/apps/purchasing";
import { billFromPurchaseOrder } from "@/lib/apps/invoicing";
import { ValidationError } from "@/lib/apps/crm";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const lines = (f: FormData) => JSON.parse(s(f, "lines") || "[]") as Record<string, unknown>[];

export async function saveRequisition(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("purchasing.requisitions.write", "purchasing");
    const cf = customFieldsFromForm(await getFieldDefs(ctx.db, "requisition"), form);
    if (!cf.ok) throw new ValidationError(cf.errors);
    const r = await createRequisition(ctx, {
      area: s(form, "area"), neededBy: s(form, "neededBy") || undefined, suggestedSupplier: s(form, "suggestedSupplier"),
      warehouseId: s(form, "warehouseId") || undefined, notes: s(form, "notes"), lines: lines(form), customFields: cf.values,
    });
    redirect(`/purchasing/requisitions/${r.id}`);
  });
}

export async function requisitionToRfq(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("purchasing.write", "purchasing");
    const po = await rfqFromRequisition(ctx, s(form, "id"), s(form, "supplierId"));
    redirect(`/purchasing/orders/${po.id}`);
  });
}

export async function savePurchaseOrder(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("purchasing.write", "purchasing");
    const cf = customFieldsFromForm(await getFieldDefs(ctx.db, "purchase_order"), form);
    if (!cf.ok) throw new ValidationError(cf.errors);
    const po = await createPurchaseOrder(ctx, {
      supplierId: s(form, "supplierId"), warehouseId: s(form, "warehouseId"), expectedAt: s(form, "expectedAt") || null,
      notes: s(form, "notes"), lines: lines(form), customFields: cf.values,
    });
    redirect(`/purchasing/orders/${po.id}`);
  });
}

export async function poAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const id = s(form, "id");
    if (s(form, "op") === "bill") {
      const ctx = await actionContext("invoicing.write", "invoicing");
      const b = await billFromPurchaseOrder(ctx, id, s(form, "supplierRef") || undefined);
      revalidatePath(`/purchasing/orders/${id}`);
      return { ok: `Factura de proveedor ${b.number} registrada` };
    }
    const ctx = await actionContext("purchasing.write", "purchasing");
    const t = await createReceipt(ctx, id);
    revalidatePath(`/purchasing/orders/${id}`);
    return { ok: t ? `Recepción ${t.number} lista` : "No hay cantidades pendientes por recibir" };
  });
}
