"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import {
  addCampaignDay, campaignScope, deleteCampaign, getCampaignDays, saveCampaign, saveCampaignDays, searchProducts, deleteCampaignDay,
  type CampaignInput, type DayInput,
} from "@/lib/apps/campaigns";
import { closeSellerDay, getCalendarSettings, saveCalendarSettings, type CalendarSettingsInput } from "@/lib/apps/commercial-calendar-data";
import type { CampaignDailyInput } from "@/lib/apps/campaign-calc";
import { getUsdRate } from "@/lib/apps/trm";
import { isDateKey, localNow } from "@/lib/apps/commercial-calendar";
import type { LookupItem } from "@/app/(app)/lookup-actions";

/** Resultado simple para acciones llamadas desde componentes cliente. */
export type Res<T = void> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(permission: string, fn: (ctx: Awaited<ReturnType<typeof actionContext>>, s: Awaited<ReturnType<typeof campaignScope>>) => Promise<T>): Promise<Res<T>> {
  try {
    const ctx = await actionContext(permission, "campaigns");
    const s = await campaignScope(ctx);
    return { ok: true, data: await fn(ctx, s) };
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.name?.startsWith("PrismaClient")) {
      console.error("[ORKEST] campañas:", err);
      return { ok: false, error: err.code === "P2002" ? "Ya existe un registro con esos datos" : "No se pudo completar la operación" };
    }
    return { ok: false, error: err.message || "Error" };
  }
}

const refresh = () => { revalidatePath("/campaigns"); revalidatePath("/campaigns/calendar"); };

export async function saveCampaignAction(input: CampaignInput, id?: string): Promise<Res> {
  const r = await run("campaigns.write", async (ctx, s) => { await saveCampaign(ctx, s, input, id); });
  if (r.ok) refresh();
  return r;
}

export async function deleteCampaignAction(id: string): Promise<Res> {
  const r = await run("campaigns.write", async (ctx, s) => { await deleteCampaign(ctx, s, id); });
  if (r.ok) refresh();
  return r;
}

export async function campaignDaysAction(id: string): Promise<Res<CampaignDailyInput[]>> {
  return run("campaigns.read", (ctx, s) => getCampaignDays(ctx, s, id));
}

export async function addCampaignDayAction(id: string, input: DayInput): Promise<Res<CampaignDailyInput>> {
  return run("campaigns.write", (ctx, s) => addCampaignDay(ctx, s, id, input));
}

/** Descarta un día recién agregado (botón Cancelar de la matriz). */
export async function discardCampaignDaysAction(ids: string[]): Promise<Res> {
  return run("campaigns.write", async (ctx, s) => { for (const id of ids) await deleteCampaignDay(ctx, s, id).catch(() => {}); });
}

export async function saveCampaignDaysAction(id: string, changes: { deleted: string[]; updated: Record<string, DayInput> }): Promise<Res> {
  const r = await run("campaigns.write", async (ctx, s) => { await saveCampaignDays(ctx, s, id, changes); });
  refresh();
  return r;
}

export async function lookupCampaignProducts(q: string): Promise<LookupItem[]> {
  const r = await run("campaigns.read", (ctx) => searchProducts(ctx, q));
  return r.ok ? r.data : [];
}

export async function closeDayAction(input: { sellerId: string; date: string; noSales: boolean }): Promise<Res> {
  const r = await run("campaigns.write", async (ctx, s) => { await closeSellerDay(ctx, s, input); });
  if (r.ok) refresh();
  return r;
}

export async function calendarSettingsAction(): Promise<Res<Awaited<ReturnType<typeof getCalendarSettings>>>> {
  return run("campaigns.manage", (ctx, s) => getCalendarSettings(ctx, s));
}

export async function saveCalendarSettingsAction(input: CalendarSettingsInput): Promise<Res> {
  const r = await run("campaigns.manage", async (ctx, s) => { await saveCalendarSettings(ctx, s, input); });
  if (r.ok) refresh();
  return r;
}

/** TRM (USD → moneda de la organización) de una fecha "YYYY-MM-DD", o de hoy. */
export async function rateAction(date?: string): Promise<Res<number>> {
  return run("campaigns.read", async (_ctx, s) => {
    const key = date && isDateKey(date) ? date : localNow(s.tz).key;
    return getUsdRate(s.currency, key);
  });
}
