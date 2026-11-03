// Calendario de actividad comercial — carga de datos (servidor). Reutiliza Campaign y CampaignDaily.
import type { ExecContext } from "@/lib/core/context";
import { prisma } from "@/lib/core/prisma";
import { emitEvent } from "@/lib/core/events";
import { getUsdRates } from "./trm";
import type { CampaignScope } from "./campaigns";
import {
  addDays, compliance, computeDayStatus, dateToKey, DEFAULT_DEADLINE_MINUTES, DEFAULT_WORK_DAYS, isDateKey,
  keyToDate, localKey, localNow, localStamp, monthKeys, prevMonth, weekday,
  type Cell, type CellEvent, type CellNewCampaign, type CellRow, type SellerCalendar,
} from "./commercial-calendar";

export async function getCalendarConfig(ctx: ExecContext, s: CampaignScope) {
  const existing = await ctx.db.calendarConfig.findFirst({});
  if (existing) return existing;
  // Primer uso: el seguimiento arranca hoy; no se inventa historial hacia atrás.
  return ctx.db.calendarConfig.create({
    data: { organizationId: ctx.orgId, deadlineMinutes: DEFAULT_DEADLINE_MINUTES, trackingStartDate: keyToDate(localNow(s.tz).key) },
  });
}

/**
 * Vendedores del calendario: miembros activos cuyo rol tiene el alcance "solo sus campañas"
 * (rol de vendedor) más cualquier dueño de al menos una campaña.
 */
export async function listCalendarSellers(ctx: ExecContext, s: CampaignScope) {
  const [members, owners] = await Promise.all([
    ctx.db.membership.findMany({ where: { status: "ACTIVE" }, select: { userId: true, role: { select: { permissions: true } } } }),
    ctx.db.campaign.findMany({ distinct: ["sellerId"], select: { sellerId: true } }),
  ]);
  const ids = new Set([
    ...members.filter((m) => m.role.permissions.includes("scope:own:campaigns")).map((m) => m.userId),
    ...owners.map((o) => o.sellerId),
  ]);
  if (s.own) for (const id of [...ids]) if (id !== s.userId) ids.delete(id);
  const [users, settings] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    ctx.db.sellerCalendarSetting.findMany({ where: { userId: { in: [...ids] } } }),
  ]);
  const byUser = new Map(settings.map((x) => [x.userId, x]));
  return users.map((u) => ({
    id: u.id,
    name: u.name || u.email,
    workDays: byUser.get(u.id)?.workDays ?? DEFAULT_WORK_DAYS,
    active: byUser.get(u.id)?.active ?? true,
  }));
}

export type CalendarData = Awaited<ReturnType<typeof loadCalendar>>;

export async function loadCalendar(ctx: ExecContext, s: CampaignScope, opts: { month: string; platform?: string }) {
  const { month, platform } = opts;
  const now = localNow(s.tz);
  const config = await getCalendarConfig(ctx, s);
  const trackingStart = dateToKey(config.trackingStartDate);

  const monthKs = monthKeys(month);
  const prevKs = monthKeys(prevMonth(month));
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(now.key, -13 + i));
  const windows: [string, string][] = [
    [monthKs[0], monthKs[monthKs.length - 1]],
    [prevKs[0], prevKs[prevKs.length - 1]],
    [last14[0], now.key],
  ];
  const allKeys = new Set([...monthKs, ...prevKs, ...last14]);

  const sellers = (await listCalendarSellers(ctx, s)).filter((x) => x.active);
  const ids = sellers.map((x) => x.id);
  const dateOr = (field: "fecha" | "date") => windows.map(([a, b]) => ({ [field]: { gte: keyToDate(a), lte: keyToDate(b) } }));
  // Creación de campañas: ventana UTC holgada y luego se ubica cada una en su día local.
  const createdOr = windows.map(([a, b]) => ({ createdAt: { gte: keyToDate(addDays(a, -1)), lt: keyToDate(addDays(b, 2)) } }));

  const [campaigns, closes, events, newCamps, holidays] = await Promise.all([
    ctx.db.campaign.findMany({ where: { sellerId: { in: ids } }, select: { id: true, name: true, platform: true, sellerId: true, status: true } }),
    ctx.db.sellerDailyClose.findMany({ where: { sellerId: { in: ids }, OR: dateOr("date") } }),
    ctx.db.sellerReportEvent.findMany({ where: { sellerId: { in: ids }, OR: dateOr("date") }, orderBy: { createdAt: "asc" } }),
    ctx.db.campaign.findMany({
      where: { sellerId: { in: ids }, OR: createdOr },
      select: { id: true, name: true, platform: true, status: true, createdAt: true, sellerId: true, dailyEntries: { orderBy: { fecha: "asc" }, take: 1, select: { presupuestoPublicidad: true } } },
    }),
    ctx.db.calendarHoliday.findMany({}),
  ]);
  const campaignOf = new Map(campaigns.map((c) => [c.id, c]));
  const rows = await ctx.db.campaignDaily.findMany({
    where: { campaignId: { in: campaigns.map((c) => c.id) }, OR: dateOr("fecha") },
    select: { campaignId: true, fecha: true, mensajes: true, transacciones: true, presupuestoPublicidad: true, ventaDelDia: true, updatedAt: true },
  });

  const holidaySet = new Set(holidays.map((h) => dateToKey(h.date)));
  const actorIds = [...new Set(events.map((e) => e.actorId))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } });
  const actorName = new Map(actors.map((a) => [a.id, a.name || a.email]));

  type Bucket = {
    rows: (CellRow & { updatedAt: number })[];
    close?: (typeof closes)[number];
    events: CellEvent[];
    firstReport: string | null;
    news: CellNewCampaign[];
  };
  const buckets = new Map<string, Bucket>();
  const bucket = (sellerId: string, date: string) => {
    const k = `${sellerId}|${date}`;
    let b = buckets.get(k);
    if (!b) { b = { rows: [], events: [], firstReport: null, news: [] }; buckets.set(k, b); }
    return b;
  };
  const minReport = (b: Bucket, ms: number) => {
    const st = localStamp(ms, s.tz);
    b.firstReport = b.firstReport === null || st < b.firstReport ? st : b.firstReport;
  };

  for (const r of rows) {
    const c = campaignOf.get(r.campaignId)!;
    bucket(c.sellerId, dateToKey(r.fecha)).rows.push({
      campaignId: c.id, name: c.name, platform: c.platform, venta: r.ventaDelDia, presupuestoUsd: r.presupuestoPublicidad,
      mensajes: r.mensajes, transacciones: r.transacciones, updatedAt: r.updatedAt.getTime(),
    });
  }
  for (const c of closes) {
    const b = bucket(c.sellerId, dateToKey(c.date));
    b.close = c;
    minReport(b, c.closedAt.getTime());
  }
  for (const e of events) {
    const b = bucket(e.sellerId, dateToKey(e.date));
    b.events.push({ kind: e.kind, value: e.value, at: e.createdAt.toISOString(), actor: actorName.get(e.actorId) ?? "—" });
    if (e.kind === "CLOSE" || e.value > 0) minReport(b, e.createdAt.getTime());
  }
  for (const c of newCamps) {
    const key = localKey(c.createdAt.getTime(), s.tz);
    if (!allKeys.has(key)) continue;
    bucket(c.sellerId, key).news.push({
      id: c.id, name: c.name, platform: c.platform, status: c.status, createdAt: c.createdAt.toISOString(),
      initialUsd: c.dailyEntries[0]?.presupuestoPublicidad || null,
    });
  }

  const sellersOut: SellerCalendar[] = sellers.map((sel) => {
    const cells: Record<string, Cell> = {};
    for (const date of allKeys) {
      const b = buckets.get(`${sel.id}|${date}`);
      const allSales = b?.rows.reduce((t, r) => t + r.venta, 0) ?? 0;
      const withSales = b?.rows.filter((r) => r.venta > 0) ?? [];
      const first = b ? (b.firstReport ?? (withSales.length ? localStamp(Math.min(...withSales.map((r) => r.updatedAt)), s.tz) : null)) : null;
      const res = computeDayStatus({
        date, todayKey: now.key, nowMinutes: now.minutes, deadlineMinutes: config.deadlineMinutes,
        trackingStart, workDays: sel.workDays, isHoliday: holidaySet.has(date), active: true,
        hasClose: !!b?.close, salesTotal: allSales, rowsCount: b?.rows.length ?? 0, firstReportAt: first,
      });
      const shown = (b?.rows ?? []).filter((r) => !platform || r.platform === platform);
      const updates = [...(b?.rows.map((r) => r.updatedAt) ?? []), ...(b?.close ? [b.close.closedAt.getTime()] : [])];
      cells[date] = {
        date, ...res,
        total: shown.reduce((t, r) => t + r.venta, 0),
        campaignsWithSales: shown.filter((r) => r.venta > 0).length,
        rows: shown.map(({ updatedAt: _u, ...r }) => r),
        newCampaigns: (b?.news ?? []).filter((c) => !platform || c.platform === platform),
        closed: !!b?.close,
        noSales: !!b?.close?.noSales,
        lastUpdate: updates.length ? new Date(Math.max(...updates)).toISOString() : null,
        events: b?.events ?? [],
      };
    }
    return { id: sel.id, name: sel.name, workDays: sel.workDays, cells };
  });

  // ─── KPIs ───
  const yesterday = addDays(now.key, -1);
  const day = (key: string) => {
    const cs = sellersOut.map((x) => x.cells[key]);
    const expected = cs.filter((c) => c.status !== "GRAY" && c.status !== "FUTURE" && c.reason !== "untracked");
    return {
      reported: cs.filter((c) => c.status === "GREEN" && c.reason !== "untracked").length,
      expected: expected.length,
      sales: cs.reduce((t, c) => t + c.total, 0),
    };
  };
  const period = (keys: string[]) => {
    const cs = sellersOut.flatMap((x) => keys.map((k) => x.cells[k]));
    const { done, expected, pct } = compliance(cs, () => true);
    return { done, expected, pct, late: cs.filter((c) => c.late).length, newCampaigns: cs.reduce((t, c) => t + c.newCampaigns.length, 0) };
  };
  const today = day(now.key);
  const ayer = day(yesterday);
  const kpis = {
    today, yesterday: ayer,
    pending: today.expected - today.reported,
    yesterdayPending: ayer.expected - ayer.reported,
    month: period(monthKs),
    prevMonth: period(prevKs),
  };

  // ─── Alertas (últimos 14 días, sin filtro de plataforma) ───
  const alerts = sellersOut.map((sel) => {
    const past = last14.filter((k) => k < now.key || sel.cells[k].status === "RED");
    const items: string[] = [];
    const lastWork = [...past].reverse().find((k) => sel.cells[k].status !== "GRAY");
    if (lastWork && sel.cells[lastWork].status === "RED") {
      items.push(lastWork === yesterday ? "No reportó ayer." : `No reportó el ${lastWork.slice(8)}/${lastWork.slice(5, 7)}.`);
    }
    let streak = 0;
    for (const k of [...past].reverse()) {
      const st = sel.cells[k].status;
      if (st === "GRAY") continue;
      if (st === "RED") streak++;
      else break;
    }
    if (streak >= 2) items.push(`${streak} días laborables consecutivos sin reportar.`);
    const reds = last14.filter((k) => sel.cells[k].status === "RED").length;
    if (reds > 0) items.push(`${reds} ${reds === 1 ? "reporte pendiente" : "reportes pendientes"} (últimos 14 días).`);
    const lates = last14.filter((k) => sel.cells[k].late).length;
    if (lates > 0) items.push(`${lates} ${lates === 1 ? "reporte fuera de plazo" : "reportes fuera de plazo"} (últimos 14 días).`);
    return { sellerId: sel.id, name: sel.name, items };
  });

  // Campañas activas que invierten sin vender en los últimos 3 días.
  const last3 = new Set([now.key, addDays(now.key, -1), addDays(now.key, -2)]);
  const spend = new Map<string, { name: string; sellerId: string; usd: number; venta: number }>();
  for (const r of rows) {
    const c = campaignOf.get(r.campaignId)!;
    if (c.status !== "ACTIVE" || !last3.has(dateToKey(r.fecha))) continue;
    const cur = spend.get(c.id) ?? { name: c.name, sellerId: c.sellerId, usd: 0, venta: 0 };
    cur.usd += r.presupuestoPublicidad;
    cur.venta += r.ventaDelDia;
    spend.set(c.id, cur);
  }
  const nameOf = new Map(sellers.map((x) => [x.id, x.name]));
  const spendingNoSales = [...spend.entries()]
    .filter(([, v]) => v.usd > 0 && v.venta === 0)
    .map(([id, v]) => ({ campaignId: id, name: v.name, seller: nameOf.get(v.sellerId) ?? "—", usd: v.usd }));

  // TRM solo de los días del mes visible con inversión (para ROAS en el detalle).
  const trmDates = new Set<string>();
  for (const x of sellersOut) for (const k of monthKs) if (x.cells[k].rows.some((r) => r.presupuestoUsd > 0)) trmDates.add(k);
  const trm = await getUsdRates(s.currency, [...trmDates]);

  const monthSet = new Set([...monthKs, ...last14]);
  const visible = sellersOut.map((x) => ({ ...x, cells: Object.fromEntries(Object.entries(x.cells).filter(([k]) => monthSet.has(k))) }));

  // Meses con actividad (ventas registradas o campañas creadas) para el filtro de mes.
  const monthRows = ids.length
    ? await prisma.$queryRaw<{ m: string }[]>`
      SELECT DISTINCT to_char(d.fecha, 'YYYY-MM') AS m
      FROM "CampaignDaily" d JOIN "Campaign" c ON c.id = d."campaignId"
      WHERE c."organizationId" = ${ctx.orgId} AND c."sellerId" = ANY(${ids})
      UNION
      SELECT DISTINCT to_char((c."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${s.tz}, 'YYYY-MM')
      FROM "Campaign" c WHERE c."organizationId" = ${ctx.orgId} AND c."sellerId" = ANY(${ids})`
    : [];
  const months = monthRows.map((r) => r.m).sort().reverse();

  return {
    months, month, today: now.key, platforms: [...new Set(campaigns.map((c) => c.platform))].sort(), deadlineMinutes: config.deadlineMinutes, trackingStart, timezone: s.tz,
    holidays: [...holidaySet], sellers: visible, kpis, alerts, spendingNoSales, trm,
    weekdayOfFirst: weekday(monthKs[0]),
  };
}

/** Cierra el día del vendedor (cero ventas o cierre explícito). Idempotente por (vendedor, fecha). */
export async function closeSellerDay(ctx: ExecContext, s: CampaignScope, opts: { sellerId?: string; date: string; noSales: boolean }) {
  if (!isDateKey(opts.date)) throw new Error("Fecha inválida");
  if (opts.date > localNow(s.tz).key) throw new Error("No se puede cerrar un día futuro");
  if (!ctx.actorId) throw new Error("Sesión no válida");
  // Un vendedor (alcance propio) solo cierra su día; quien configura el calendario puede cerrar el de otros.
  const sellerId = s.own || !opts.sellerId ? s.userId : opts.sellerId;
  if (sellerId !== s.userId && !s.manage) throw new Error("Solo puedes cerrar tu propio día");
  const date = keyToDate(opts.date);
  const existing = await ctx.db.sellerDailyClose.findFirst({ where: { sellerId, date } });
  if (existing) return existing;
  const dayRows = await ctx.db.campaignDaily.findMany({ where: { fecha: date, campaign: { sellerId } }, select: { ventaDelDia: true } });
  const totalSold = dayRows.reduce((t, r) => t + r.ventaDelDia, 0);
  const noSales = opts.noSales && totalSold === 0;
  const close = await ctx.db.sellerDailyClose.create({ data: { organizationId: ctx.orgId, sellerId, date, noSales, totalSold, closedById: ctx.actorId } });
  await ctx.db.sellerReportEvent.create({ data: { organizationId: ctx.orgId, sellerId, date, kind: "CLOSE", value: totalSold, actorId: ctx.actorId } });
  await emitEvent(ctx, "SellerDayClosed", "campaign", close.id, { sellerId, date: opts.date, totalSold, noSales });
  return close;
}

// ─── Configuración ───

export async function getCalendarSettings(ctx: ExecContext, s: CampaignScope) {
  const [config, holidays, sellers] = await Promise.all([
    getCalendarConfig(ctx, s),
    ctx.db.calendarHoliday.findMany({ orderBy: { date: "asc" } }),
    listCalendarSellers(ctx, { ...s, own: false }),
  ]);
  return {
    deadlineMinutes: config.deadlineMinutes,
    trackingStartDate: dateToKey(config.trackingStartDate),
    holidays: holidays.map((h) => ({ date: dateToKey(h.date), label: h.label })),
    sellers,
  };
}

export type CalendarSettingsInput = {
  deadlineMinutes?: number; trackingStartDate?: string;
  holidays?: { date: string; label: string }[];
  sellers?: { userId: string; workDays: number[]; active: boolean }[];
};

export async function saveCalendarSettings(ctx: ExecContext, s: CampaignScope, body: CalendarSettingsInput) {
  if (!s.manage) throw new Error("Permiso requerido: configurar calendario comercial");
  const config = await getCalendarConfig(ctx, s);
  const data: { deadlineMinutes?: number; trackingStartDate?: Date } = {};
  if (body.deadlineMinutes !== undefined) {
    if (!Number.isInteger(body.deadlineMinutes) || body.deadlineMinutes < 0 || body.deadlineMinutes > 1439) throw new Error("Hora límite inválida");
    data.deadlineMinutes = body.deadlineMinutes;
  }
  if (body.trackingStartDate !== undefined) {
    if (!isDateKey(body.trackingStartDate)) throw new Error("Fecha de inicio inválida");
    data.trackingStartDate = keyToDate(body.trackingStartDate);
  }
  if (Object.keys(data).length) await ctx.db.calendarConfig.update({ where: { id: config.id }, data });

  if (body.holidays) {
    const seen = new Set<string>();
    const clean = body.holidays
      .filter((h) => isDateKey(h.date) && !seen.has(h.date) && seen.add(h.date))
      .map((h) => ({ organizationId: ctx.orgId, date: keyToDate(h.date), label: (h.label || "Festivo").slice(0, 80) }));
    await ctx.db.calendarHoliday.deleteMany({});
    if (clean.length) await ctx.db.calendarHoliday.createMany({ data: clean });
  }
  if (body.sellers) {
    const allowed = new Set((await listCalendarSellers(ctx, { ...s, own: false })).map((x) => x.id));
    for (const x of body.sellers) {
      if (!allowed.has(x.userId)) continue;
      const workDays = [...new Set(x.workDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
      await ctx.db.sellerCalendarSetting.upsert({
        where: { organizationId_userId: { organizationId: ctx.orgId, userId: x.userId } },
        update: { workDays, active: !!x.active },
        create: { organizationId: ctx.orgId, userId: x.userId, workDays, active: !!x.active },
      });
    }
  }
}
