"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";
import {
  copyBudgetFromPrevious, createExpense, createIncome, FIN_CATEGORIES, payRecurring, saveBudget, saveRecurring,
} from "@/lib/apps/finance";

const write = () => actionContext("finance.write", "finance");
const s = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const done = (ok: string): ActionResult => {
  revalidatePath("/finance", "layout");
  return { ok };
};

export async function addExpense(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await createExpense(ctx, {
      spentOn: s(form, "spentOn"), category: s(form, "category"), amount: s(form, "amount"),
      vendor: s(form, "vendor"), description: s(form, "description"), customerId: s(form, "customerId"),
    });
    return done("Gasto registrado");
  });
}

export async function deleteExpense(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await ctx.db.finExpense.delete({ where: { id: s(form, "id") } });
    return done("Gasto eliminado");
  });
}

export async function addRecurring(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await saveRecurring(ctx, {
      name: s(form, "name"), category: s(form, "category"), amount: s(form, "amount"), frequency: s(form, "frequency"),
      dueDay: s(form, "dueDay"), startOn: s(form, "startOn"), endOn: s(form, "endOn") || undefined,
      vendor: s(form, "vendor"), notes: s(form, "notes"),
    });
    return done("Gasto fijo guardado");
  });
}

export async function toggleRecurring(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    const r = await ctx.db.finRecurringCost.findUniqueOrThrow({ where: { id: s(form, "id") }, select: { active: true } });
    await ctx.db.finRecurringCost.update({ where: { id: s(form, "id") }, data: { active: !r.active } });
    return done(r.active ? "Gasto fijo pausado" : "Gasto fijo reactivado");
  });
}

export async function deleteRecurring(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    const id = s(form, "id");
    // Los pagos ya registrados se conservan como gastos sueltos
    await ctx.db.finExpense.updateMany({ where: { recurringId: id }, data: { recurringId: null } });
    await ctx.db.finRecurringCost.delete({ where: { id } });
    return done("Gasto fijo eliminado");
  });
}

export async function markRecurringPaid(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await payRecurring(ctx, s(form, "id"), s(form, "month"));
    return done("Pago registrado");
  });
}

export async function addIncome(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await createIncome(ctx, {
      receivedOn: s(form, "receivedOn"), description: s(form, "description"), amount: s(form, "amount"),
      status: s(form, "status") || "received", customerId: s(form, "customerId"),
    });
    return done("Ingreso registrado");
  });
}

export async function markIncomeReceived(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await ctx.db.finIncome.update({ where: { id: s(form, "id") }, data: { status: "received" } });
    return done("Ingreso marcado como recibido");
  });
}

export async function deleteIncome(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await ctx.db.finIncome.delete({ where: { id: s(form, "id") } });
    return done("Ingreso eliminado");
  });
}

export async function updateBudget(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    await saveBudget(ctx, s(form, "month"), Object.fromEntries(FIN_CATEGORIES.map((c) => [c.id, s(form, `b:${c.id}`)])));
    return done("Presupuesto guardado");
  });
}

export async function copyBudget(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await write();
    const n = await copyBudgetFromPrevious(ctx, s(form, "month"));
    return done(n ? `Se copiaron ${n} categorías del mes anterior` : "Todas las categorías ya tenían presupuesto");
  });
}
