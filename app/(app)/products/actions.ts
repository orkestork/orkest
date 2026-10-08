"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { getFieldDefs, customFieldsFromForm } from "@/lib/core/custom-fields";
import { createProduct, setProductActive, updateProduct } from "@/lib/apps/inventory";
import { ValidationError } from "@/lib/apps/crm";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveProductForm(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("products.write", "products");
    const cf = customFieldsFromForm(await getFieldDefs(ctx.db, "product"), form);
    if (!cf.ok) throw new ValidationError(cf.errors);
    const payload = {
      sku: s(form, "sku"), name: s(form, "name"), category: s(form, "category") || undefined, unit: s(form, "unit") || "UND",
      price: s(form, "price") || 0, cost: s(form, "cost") || 0, minStock: s(form, "minStock") || 0, taxRate: s(form, "taxRate") || 19,
      kind: s(form, "kind") || "GOODS", invoicePolicy: s(form, "invoicePolicy") || "ORDER", defaultSupplierId: s(form, "defaultSupplierId") || null,
      canBeSold: form.get("canBeSold") === "on", canBePurchased: form.get("canBePurchased") === "on", customFields: cf.values,
    };
    const id = s(form, "id");
    // Un rol con costos ocultos no ve el campo: se conserva el costo actual
    if (ctx.restricted("deny:costs")) payload.cost = id ? String((await ctx.db.product.findUniqueOrThrow({ where: { id } })).cost) : 0;
    if (id) {
      await updateProduct(ctx, id, payload);
      revalidatePath(`/products/${id}`);
      return { ok: "Producto guardado" };
    }
    const p = await createProduct(ctx, { ...payload, stock: s(form, "stock") || 0 });
    redirect(`/products/${p.id}`);
  });
}

export async function toggleArchive(form: FormData) {
  const ctx = await actionContext("products.write", "products");
  await setProductActive(ctx, s(form, "id"), s(form, "active") === "1");
  revalidatePath(`/products/${s(form, "id")}`);
}
