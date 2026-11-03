import type { ExecContext, OrgContext } from "@/lib/core/context";
import { prisma } from "@/lib/core/prisma";
import { hasPermission } from "@/lib/core/permissions";
import { emitEvent } from "@/lib/core/events";
import { getUsdRates } from "./trm";
import { dateToKey, isDateKey, keyToDate, localKey } from "./commercial-calendar";
import type { CampaignDailyInput } from "./campaign-calc";

/**
 * Campañas de pauta por vendedor. La inversión se registra en USD y la venta en la moneda de la
 * organización; la TRM de cada fecha las hace comparables. Alcance: con `scope:own:campaigns`
 * el usuario solo ve y gestiona sus campañas (y queda como vendedor en el calendario comercial).
 */
export type CampaignScope = { userId: string; own: boolean; manage: boolean; tz: string; currency: string };

export async function campaignScope(ctx: OrgContext): Promise<CampaignScope> {
  const org = await prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { timezone: true, currency: true } });
  return {
    userId: ctx.user.id,
    own: ctx.restricted("scope:own:campaigns"),
    manage: ctx.can("campaigns.manage"),
    tz: org?.timezone || "America/Bogota",
    currency: org?.currency || ctx.org.currency || "COP",
  };
}

const sellerWhere = (s: CampaignScope) => (s.own ? { sellerId: s.userId } : {});
export const canManageCampaign = (s: CampaignScope, sellerId: string) => !s.own || sellerId === s.userId;

/** Personas que pueden figurar como vendedor de una campaña: miembros activos con permiso de edición. */
export async function campaignSellers(ctx: ExecContext, s: CampaignScope) {
  const ms = await ctx.db.membership.findMany({ where: { status: "ACTIVE" }, include: { user: { select: { id: true, name: true } }, role: { select: { permissions: true } } } });
  return ms
    .filter((m) => hasPermission(m.role.permissions, "campaigns.write") && (!s.own || m.userId === s.userId))
    .map((m) => ({ id: m.user.id, name: m.user.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

async function userNames(ids: string[]) {
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

export type CampaignListItem = {
  id: string; name: string; platform: string; investment: number; sales: number; leads: number; targetMultiple: number;
  status: string; startDate: string; endDate: string | null; notes: string | null; trm: number;
  daily: { sales: number; investmentUsd: number; mensajes: number; transacciones: number; days: number; firstDate: string | null; lastDate: string | null };
  dailyRows: { fecha: string; ventaDelDia: number; presupuestoPublicidad: number; mensajes: number; transacciones: number }[];
  seller: { id: string; name: string };
  product: { id: string; name: string; sku: string } | null;
  canEdit: boolean;
};

/** Campañas con los totales y filas de su matriz diaria (para recalcular por rango en la UI). */
export async function listCampaigns(ctx: ExecContext, s: CampaignScope): Promise<CampaignListItem[]> {
  const campaigns = await ctx.db.campaign.findMany({ where: sellerWhere(s), orderBy: { createdAt: "desc" }, take: 2000 });
  const ids = campaigns.map((c) => c.id);
  const [rows, names, products] = await Promise.all([
    ctx.db.campaignDaily.findMany({
      where: { campaignId: { in: ids } }, orderBy: { fecha: "asc" },
      select: { campaignId: true, fecha: true, ventaDelDia: true, presupuestoPublicidad: true, mensajes: true, transacciones: true },
    }),
    userNames(campaigns.map((c) => c.sellerId)),
    ctx.db.product.findMany({ where: { id: { in: campaigns.map((c) => c.productId).filter((x): x is string => !!x) } }, select: { id: true, name: true, sku: true } }),
  ]);
  const productOf = new Map(products.map((p) => [p.id, p]));
  const byCampaign = new Map<string, CampaignListItem["dailyRows"]>();
  for (const r of rows) {
    const list = byCampaign.get(r.campaignId) ?? [];
    list.push({ fecha: dateToKey(r.fecha), ventaDelDia: r.ventaDelDia, presupuestoPublicidad: r.presupuestoPublicidad, mensajes: r.mensajes, transacciones: r.transacciones });
    byCampaign.set(r.campaignId, list);
  }
  // La inversión manual se convierte con la TRM de la fecha de inicio de la campaña.
  const startKeys = campaigns.map((c) => localKey(c.startDate.getTime(), s.tz));
  const rates = await getUsdRates(s.currency, startKeys);

  return campaigns.map((c, i) => {
    const dailyRows = byCampaign.get(c.id) ?? [];
    const daily = dailyRows.reduce(
      (a, r) => ({
        sales: a.sales + r.ventaDelDia, investmentUsd: a.investmentUsd + r.presupuestoPublicidad,
        mensajes: a.mensajes + r.mensajes, transacciones: a.transacciones + r.transacciones, days: a.days + 1,
        firstDate: a.firstDate ?? r.fecha, lastDate: r.fecha,
      }),
      { sales: 0, investmentUsd: 0, mensajes: 0, transacciones: 0, days: 0, firstDate: null as string | null, lastDate: null as string | null },
    );
    const p = c.productId ? productOf.get(c.productId) : undefined;
    return {
      id: c.id, name: c.name, platform: c.platform, investment: c.investment, sales: c.sales, leads: c.leads,
      targetMultiple: c.targetMultiple, status: c.status, startDate: startKeys[i], endDate: c.endDate ? localKey(c.endDate.getTime(), s.tz) : null,
      notes: c.notes, trm: rates[startKeys[i]], daily, dailyRows,
      seller: { id: c.sellerId, name: names.get(c.sellerId) ?? "—" },
      product: p ? { id: p.id, name: p.name, sku: p.sku } : null,
      canEdit: canManageCampaign(s, c.sellerId),
    };
  });
}

// ─── Crear / editar / eliminar ───

export type CampaignInput = {
  name: string; sellerId?: string; productId?: string | null; investment?: number; sales?: number; leads?: number;
  targetMultiple?: number; platform?: string; notes?: string | null; status?: string; startDate?: string; endDate?: string | null;
};

const nonNeg = (v: unknown, fallback = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

async function loadOwned(ctx: ExecContext, s: CampaignScope, id: string) {
  const c = await ctx.db.campaign.findFirst({ where: { id } });
  if (!c) throw new Error("Campaña no encontrada");
  if (!canManageCampaign(s, c.sellerId)) throw new Error("Solo puedes gestionar tus campañas");
  return c;
}

export async function saveCampaign(ctx: ExecContext, s: CampaignScope, input: CampaignInput, id?: string) {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Nombre requerido");
  if (name.length > 160) throw new Error("El nombre es muy largo");
  if (input.startDate && !isDateKey(input.startDate)) throw new Error("Fecha de inicio inválida");
  if (input.endDate && !isDateKey(input.endDate)) throw new Error("Fecha final inválida");
  if (input.startDate && input.endDate && input.endDate < input.startDate) throw new Error("La fecha final no puede ser anterior a la inicial");
  const status = input.status === "PAUSED" ? "PAUSED" : "ACTIVE";

  const existing = id ? await loadOwned(ctx, s, id) : null;
  // Con alcance propio no se puede asignar a otro vendedor.
  let sellerId = s.own ? s.userId : input.sellerId || existing?.sellerId || s.userId;
  if (sellerId !== existing?.sellerId && sellerId !== s.userId) {
    const ok = await ctx.db.membership.findFirst({ where: { userId: sellerId, status: "ACTIVE" } });
    if (!ok) throw new Error("El vendedor no pertenece a la organización");
  }
  if (existing && !sellerId) sellerId = existing.sellerId;
  if (input.productId) {
    const p = await ctx.db.product.findFirst({ where: { id: input.productId }, select: { id: true } });
    if (!p) throw new Error("Producto no encontrado");
  }
  // Las fechas de inicio/fin se guardan al mediodía UTC del día elegido: estable en cualquier zona.
  const data = {
    name, sellerId,
    productId: input.productId || null,
    investment: nonNeg(input.investment), sales: nonNeg(input.sales), leads: Math.round(nonNeg(input.leads)),
    targetMultiple: nonNeg(input.targetMultiple, 10) || 10,
    platform: String(input.platform || "Meta Ads").slice(0, 60),
    notes: input.notes ? String(input.notes).slice(0, 2000) : null,
    status,
    ...(input.startDate ? { startDate: new Date(`${input.startDate}T12:00:00Z`) } : {}),
    endDate: input.endDate ? new Date(`${input.endDate}T12:00:00Z`) : null,
  };
  if (existing) return ctx.db.campaign.update({ where: { id: existing.id }, data });
  const created = await ctx.db.campaign.create({ data: { ...data, organizationId: ctx.orgId } });
  await emitEvent(ctx, "CampaignCreated", "campaign", created.id, { name, platform: data.platform, sellerId });
  return created;
}

export async function deleteCampaign(ctx: ExecContext, s: CampaignScope, id: string) {
  const c = await loadOwned(ctx, s, id);
  await ctx.db.campaignDaily.deleteMany({ where: { campaignId: c.id } });
  await ctx.db.campaign.delete({ where: { id: c.id } });
}

// ─── Matriz diaria ───

const MAX_NUM = 999_999_999;
const clampNum = (v: unknown) => Math.min(MAX_NUM, nonNeg(v));

export async function getCampaignDays(ctx: ExecContext, s: CampaignScope, campaignId: string): Promise<CampaignDailyInput[]> {
  const c = await ctx.db.campaign.findFirst({ where: { id: campaignId, ...sellerWhere(s) }, select: { id: true } });
  if (!c) throw new Error("Campaña no encontrada");
  const rows = await ctx.db.campaignDaily.findMany({ where: { campaignId }, orderBy: { fecha: "asc" } });
  const keys = rows.map((r) => dateToKey(r.fecha));
  const rates = await getUsdRates(s.currency, keys);
  return rows.map((r, i) => ({
    id: r.id, fecha: keys[i], mensajes: r.mensajes, transacciones: r.transacciones,
    presupuestoPublicidad: r.presupuestoPublicidad, ventaDelDia: r.ventaDelDia, trm: rates[keys[i]],
  }));
}

// Log append-only del calendario comercial: cuándo se registró cada venta y quién lo hizo.
async function logSalesEvent(ctx: ExecContext, sellerId: string, campaignId: string, fecha: Date, value: number) {
  if (!ctx.actorId) return;
  await ctx.db.sellerReportEvent.create({ data: { organizationId: ctx.orgId, sellerId, date: fecha, campaignId, kind: "SALES", value, actorId: ctx.actorId } });
}

export type DayInput = { fecha?: string; mensajes?: number; transacciones?: number; presupuestoPublicidad?: number; ventaDelDia?: number };

export async function addCampaignDay(ctx: ExecContext, s: CampaignScope, campaignId: string, input: DayInput): Promise<CampaignDailyInput> {
  const c = await loadOwned(ctx, s, campaignId);
  if (!input.fecha || !isDateKey(input.fecha)) throw new Error("Fecha inválida");
  const fecha = keyToDate(input.fecha);
  if (await ctx.db.campaignDaily.findFirst({ where: { campaignId, fecha } })) throw new Error("Ya existe un registro para esa fecha");
  const row = await ctx.db.campaignDaily.create({
    data: {
      organizationId: ctx.orgId, campaignId, fecha,
      mensajes: Math.round(clampNum(input.mensajes)), transacciones: Math.round(clampNum(input.transacciones)),
      presupuestoPublicidad: clampNum(input.presupuestoPublicidad), ventaDelDia: clampNum(input.ventaDelDia),
    },
  });
  if (row.ventaDelDia > 0) await logSalesEvent(ctx, c.sellerId, c.id, fecha, row.ventaDelDia);
  const trm = (await getUsdRates(s.currency, [input.fecha]))[input.fecha];
  return { id: row.id, fecha: input.fecha, mensajes: row.mensajes, transacciones: row.transacciones, presupuestoPublicidad: row.presupuestoPublicidad, ventaDelDia: row.ventaDelDia, trm };
}

async function loadDay(ctx: ExecContext, s: CampaignScope, id: string) {
  const day = await ctx.db.campaignDaily.findFirst({ where: { id }, include: { campaign: { select: { id: true, sellerId: true } } } });
  if (!day) throw new Error("Registro no encontrado");
  if (!canManageCampaign(s, day.campaign.sellerId)) throw new Error("Solo puedes gestionar tus campañas");
  return day;
}

export async function updateCampaignDay(ctx: ExecContext, s: CampaignScope, id: string, input: DayInput) {
  const day = await loadDay(ctx, s, id);
  let fecha = day.fecha;
  if (input.fecha !== undefined) {
    if (!isDateKey(input.fecha)) throw new Error("Fecha inválida");
    fecha = keyToDate(input.fecha);
    if (fecha.getTime() !== day.fecha.getTime() && (await ctx.db.campaignDaily.findFirst({ where: { campaignId: day.campaignId, fecha } }))) {
      throw new Error("Ya existe un registro para esa fecha");
    }
  }
  const row = await ctx.db.campaignDaily.update({
    where: { id },
    data: {
      fecha,
      mensajes: input.mensajes !== undefined ? Math.round(clampNum(input.mensajes)) : day.mensajes,
      transacciones: input.transacciones !== undefined ? Math.round(clampNum(input.transacciones)) : day.transacciones,
      presupuestoPublicidad: input.presupuestoPublicidad !== undefined ? clampNum(input.presupuestoPublicidad) : day.presupuestoPublicidad,
      ventaDelDia: input.ventaDelDia !== undefined ? clampNum(input.ventaDelDia) : day.ventaDelDia,
    },
  });
  if (row.ventaDelDia !== day.ventaDelDia || row.fecha.getTime() !== day.fecha.getTime()) {
    await logSalesEvent(ctx, day.campaign.sellerId, day.campaignId, row.fecha, row.ventaDelDia);
  }
  return row;
}

export async function deleteCampaignDay(ctx: ExecContext, s: CampaignScope, id: string) {
  const day = await loadDay(ctx, s, id);
  await ctx.db.campaignDaily.delete({ where: { id: day.id } });
}

/** Aplica de una vez los cambios de la matriz: borra, edita (y valida fechas repetidas). */
export async function saveCampaignDays(ctx: ExecContext, s: CampaignScope, campaignId: string, changes: { deleted: string[]; updated: Record<string, DayInput> }) {
  await loadOwned(ctx, s, campaignId);
  const own = new Set((await ctx.db.campaignDaily.findMany({ where: { campaignId }, select: { id: true } })).map((r) => r.id));
  for (const id of changes.deleted) if (own.has(id)) await deleteCampaignDay(ctx, s, id);
  for (const [id, fields] of Object.entries(changes.updated)) {
    if (!own.has(id) || changes.deleted.includes(id) || Object.keys(fields).length === 0) continue;
    await updateCampaignDay(ctx, s, id, fields);
  }
}

export async function searchProducts(ctx: ExecContext, q: string) {
  const term = q.trim();
  const rows = await ctx.db.product.findMany({
    where: { active: true, canBeSold: true, ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { sku: { contains: term, mode: "insensitive" } }] } : {}) },
    select: { id: true, name: true, sku: true }, orderBy: { name: "asc" }, take: 20,
  });
  return rows.map((p) => ({ id: p.id, name: p.name, hint: p.sku }));
}
