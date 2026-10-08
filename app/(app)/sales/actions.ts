"use server";

import { redirect } from "next/navigation";
import { actionContext } from "@/lib/core/context";
import { createQuote, updateQuote } from "@/lib/apps/sales";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

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
    if (id) {
      await updateQuote(ctx, id, quotePayload(form));
      revalidatePath(`/sales/quotes/${id}`);
      return { ok: "Cambios guardados" };
    }
    const q = await createQuote(ctx, quotePayload(form));
    redirect(`/sales/quotes/${q.id}`);
  });
}
