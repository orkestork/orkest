"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { getFieldDefs, customFieldsFromForm } from "@/lib/core/custom-fields";
import { createCustomer, updateCustomer, createOpportunity, ValidationError } from "@/lib/apps/crm";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

function customerPayload(form: FormData, cf: Record<string, unknown>) {
  return {
    name: form.get("name"), taxId: form.get("taxId"), email: form.get("email"), phone: form.get("phone"),
    city: form.get("city"), ownerId: form.get("ownerId"), customFields: cf,
    pricelistId: form.get("pricelistId") ?? undefined, paymentTermId: form.get("paymentTermId") ?? undefined,
  };
}

export async function saveCustomer(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("crm.customers.write", "crm");
    const cf = customFieldsFromForm(await getFieldDefs(ctx.db, "customer"), form);
    if (!cf.ok) throw new ValidationError(cf.errors);
    const id = String(form.get("id") ?? "");
    const c = id ? await updateCustomer(ctx, id, customerPayload(form, cf.values)) : await createCustomer(ctx, customerPayload(form, cf.values));
    redirect(`/crm/customers/${c.id}`);
  });
}

export async function saveOpportunity(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("crm.opportunities.write", "crm");
    await createOpportunity(ctx, { title: form.get("title"), customerId: form.get("customerId"), amount: form.get("amount"), ownerId: form.get("ownerId") });
    revalidatePath("/crm/opportunities");
    return { ok: "Oportunidad creada" };
  });
}
