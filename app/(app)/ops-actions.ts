"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { getFieldDefs, customFieldsFromForm } from "@/lib/core/custom-fields";
import { createProduct, moveStock } from "@/lib/apps/inventory";
import { registerPayment } from "@/lib/apps/finance";
import { createNonconformity } from "@/lib/apps/quality";
import { ValidationError } from "@/lib/apps/crm";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

export async function saveProduct(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("products.write", "products");
    const cf = customFieldsFromForm(await getFieldDefs(ctx.db, "product"), form);
    if (!cf.ok) throw new ValidationError(cf.errors);
    const f = Object.fromEntries(["sku", "name", "category", "unit", "price", "cost", "stock", "minStock", "kind", "invoicePolicy", "taxRate", "defaultSupplierId"].map((k) => [k, form.get(k) || undefined]));
    await createProduct(ctx, { ...f, customFields: cf.values });
    revalidatePath("/products");
    return { ok: "Producto creado" };
  });
}

export async function stockMovement(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("inventory.write", "inventory");
    const after = await moveStock(ctx, String(form.get("productId")), String(form.get("type")) as "IN" | "OUT" | "ADJUST", Number(form.get("quantity")), String(form.get("reference") ?? "") || undefined);
    revalidatePath("/inventory");
    return { ok: `Movimiento registrado. Existencia: ${after}` };
  });
}

export async function savePayment(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("invoicing.write", "invoicing");
    await registerPayment(ctx, String(form.get("invoiceId")), Number(form.get("amount")));
    revalidatePath("/invoicing");
    return { ok: "Pago registrado" };
  });
}

export async function saveNonconformity(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("quality.write", "quality");
    await createNonconformity(ctx, {
      title: String(form.get("title") ?? ""), description: String(form.get("description") ?? "") || undefined,
      supplierId: String(form.get("supplierId") ?? "") || null, productId: String(form.get("productId") ?? "") || null,
      severity: String(form.get("severity") ?? "MEDIUM"),
    });
    revalidatePath("/quality");
    return { ok: "No conformidad registrada" };
  });
}

export async function saveSupplier(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("purchasing.write", "purchasing");
    const name = String(form.get("name") ?? "").trim();
    if (name.length < 2) return { error: "Nombre obligatorio" };
    const cf = customFieldsFromForm(await getFieldDefs(ctx.db, "supplier"), form);
    if (!cf.ok) throw new ValidationError(cf.errors);
    await ctx.db.supplier.create({ data: { organizationId: ctx.orgId, name, taxId: String(form.get("taxId") ?? "") || null, email: String(form.get("email") ?? "") || null, customFields: cf.values as object } });
    revalidatePath("/purchasing/suppliers");
    return { ok: "Proveedor creado" };
  });
}
