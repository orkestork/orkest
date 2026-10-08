"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { creditNote, registerPayment } from "@/lib/apps/invoicing";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function payAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("invoicing.write", "invoicing");
    const r = await registerPayment(ctx, {
      invoiceId: s(form, "invoiceId") || undefined, billId: s(form, "billId") || undefined, amount: Number(s(form, "amount")),
      journalId: s(form, "journalId") || undefined, date: s(form, "date") || undefined, reference: s(form, "reference") || undefined,
    });
    revalidatePath("/invoicing", "layout");
    return { ok: `Pago registrado. Saldo pendiente: ${r.balance.toLocaleString("es-CO")}` };
  });
}

export async function creditNoteAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("invoicing.write", "invoicing");
    const nc = await creditNote(ctx, s(form, "invoiceId"), s(form, "amount") ? Number(s(form, "amount")) : undefined, s(form, "reason") || undefined);
    revalidatePath("/invoicing", "layout");
    return { ok: `Nota crédito ${nc.number} emitida` };
  });
}

export async function saveConfig(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("invoicing.write", "invoicing");
    const kind = s(form, "kind");
    if (kind === "tax") {
      await ctx.db.tax.create({ data: { organizationId: ctx.orgId, name: s(form, "name"), rate: Number(s(form, "rate")), scope: s(form, "scope") } });
    } else if (kind === "term") {
      const lines = s(form, "lines").split(",").map((p) => p.trim()).filter(Boolean).map((p) => { const [percent, days] = p.split("@").map(Number); return { percent, days }; });
      if (!lines.length || lines.some((l) => !Number.isFinite(l.percent) || !Number.isFinite(l.days))) return { error: "Formato de cuotas: 30@0, 70@60" };
      if (Math.round(lines.reduce((x, l) => x + l.percent, 0)) !== 100) return { error: "Los porcentajes deben sumar 100" };
      await ctx.db.paymentTerm.create({ data: { organizationId: ctx.orgId, name: s(form, "name"), lines } });
    } else if (kind === "journal") {
      await ctx.db.journal.create({ data: { organizationId: ctx.orgId, code: s(form, "code").toUpperCase(), name: s(form, "name"), type: s(form, "type") } });
    }
    revalidatePath("/invoicing/config");
    return { ok: "Guardado" };
  });
}
