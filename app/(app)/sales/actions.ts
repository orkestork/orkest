"use server";

import { redirect } from "next/navigation";
import { actionContext } from "@/lib/core/context";
import { createQuote, updateQuote } from "@/lib/apps/sales";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";
import { customFieldsFromForm, getFieldDefs } from "@/lib/core/custom-fields";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const quotePayload = (form: FormData) => ({
  customerId: s(form, "customerId"), validUntil: s(form, "validUntil") || null, paymentTermId: s(form, "paymentTermId") || null,
  pricelistId: s(form, "pricelistId") || null, terms: s(form, "terms") || undefined, notes: s(form, "notes") || undefined,
  lines: JSON.parse(s(form, "lines") || "[]"),
});

export async function saveQuote(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("sales.quotes.write", "sales");
    const id = s(form, "id");
    // Campos de Studio de la cotización (se validan de nuevo al guardar)
    const defs = await getFieldDefs(ctx.db, "quote");
    const cf = customFieldsFromForm(defs, form);
    if (!cf.ok) return { error: Object.values(cf.errors).join(" · ") };
    const payload = { ...quotePayload(form), ...(defs.length ? { customFields: cf.values } : {}) };
    if (id) {
      const q = await ctx.db.quote.findUnique({ where: { id }, select: { ownerId: true } });
      if (!q || (ctx.restricted("scope:own:sales") && q.ownerId !== ctx.user.id)) return { error: "Cotización no encontrada" };
      await updateQuote(ctx, id, payload);
      revalidatePath(`/sales/quotes/${id}`);
      return { ok: "Cambios guardados" };
    }
    const q = await createQuote(ctx, payload);
    redirect(`/sales/quotes/${q.id}`);
  });
}
