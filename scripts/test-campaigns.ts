import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "@/lib/core/prisma";
import { tenantDb } from "@/lib/core/db";
import type { ExecContext } from "@/lib/core/context";
import {
  addCampaignDay, deleteCampaign, getCampaignDays, listCampaigns, saveCampaign, saveCampaignDays, type CampaignScope,
} from "@/lib/apps/campaigns";
import { closeSellerDay, loadCalendar, saveCalendarSettings } from "@/lib/apps/commercial-calendar-data";
import { addDays, computeDayStatus, DEFAULT_WORK_DAYS, localNow, prevMonth, type DayInput } from "@/lib/apps/commercial-calendar";
import { buildCampaignDailyRows, calcCampaignDailyTotals, displayStatus } from "@/lib/apps/campaign-calc";

/** Campañas + calendario comercial: cálculos, alcance por vendedor, matriz diaria, cierres y aislamiento. */
function pure() {
  const base: DayInput = {
    date: "2026-09-22", todayKey: "2026-09-25", nowMinutes: 600, deadlineMinutes: 1200, trackingStart: "2026-09-01",
    workDays: DEFAULT_WORK_DAYS, isHoliday: false, active: true, hasClose: false, salesTotal: 0, rowsCount: 0, firstReportAt: null,
  };
  const s = (o: Partial<DayInput>) => computeDayStatus({ ...base, ...o });
  assert.equal(s({}).status, "RED"); // pasado sin reporte
  assert.equal(s({ rowsCount: 2 }).status, "RED"); // filas en 0 no son confirmación
  assert.equal(s({ salesTotal: 500 }).status, "GREEN");
  assert.equal(s({ hasClose: true }).status, "GREEN"); // cero ventas confirmado
  assert.equal(s({ date: "2026-09-27" }).status, "GRAY"); // domingo
  assert.equal(s({ date: "2026-09-26" }).status, "FUTURE");
  assert.equal(s({ date: "2026-09-25" }).status, "PENDING"); // hoy antes del límite
  assert.equal(s({ date: "2026-09-25", rowsCount: 1 }).status, "YELLOW");
  assert.equal(s({ date: "2026-09-25", nowMinutes: 1300 }).status, "RED"); // hoy pasado el límite
  assert.equal(s({ date: "2026-08-31" }).reason, "untracked");
  assert.equal(s({ date: "2026-08-31", salesTotal: 9 }).status, "GREEN");
  assert.equal(s({ isHoliday: true }).reason, "holiday");
  assert.equal(s({ active: false }).reason, "inactive");
  assert.equal(s({ salesTotal: 1, firstReportAt: "2026-09-24 01:00" }).late, true); // lunes reportado el miércoles
  assert.equal(s({ salesTotal: 1, firstReportAt: "2026-09-22 19:59" }).late, false);
  assert.equal(s({ salesTotal: 1, firstReportAt: "2026-09-22 20:01" }).late, true);
  assert.equal(prevMonth("2026-01"), "2025-12");

  const rows = buildCampaignDailyRows([
    { id: "b", fecha: "2026-09-02", mensajes: 50, transacciones: 5, presupuestoPublicidad: 10, ventaDelDia: 300000, trm: 4000 },
    { id: "a", fecha: "2026-09-01", mensajes: 100, transacciones: 25, presupuestoPublicidad: 20, ventaDelDia: 1000000, trm: 4000 },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["a", "b"]);
  assert.equal(rows[0].kpiMensajes, 0.25);
  assert.equal(rows[0].presupuestoCOP, 80000);
  assert.equal(rows[0].kpiConversion, 12.5);
  assert.equal(rows[0].metaDiaria, 800000);
  const t = calcCampaignDailyTotals(rows);
  assert.equal(t.totalInversion, 120000);
  assert.equal(Math.round(t.kpiGeneral * 100) / 100, 10.83);
  assert.equal(displayStatus("ACTIVE", 10, 10), "meta");
  assert.equal(displayStatus("ACTIVE", 7, 10), "rentable");
  assert.equal(displayStatus("ACTIVE", 2, 10), "riesgo");
  assert.equal(displayStatus("PAUSED", 20, 10), "pausada");
  console.log("1. cálculos puros (estados del día, retraso, matriz, ROAS): ok");
}

async function cleanup(slugs: string[]) {
  const orgs = await prisma.organization.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (!ids.length) return;
  const w = { where: { organizationId: { in: ids } } };
  await prisma.campaignDaily.deleteMany(w);
  await prisma.campaign.deleteMany(w);
  await prisma.sellerDailyClose.deleteMany(w);
  await prisma.sellerReportEvent.deleteMany(w);
  await prisma.calendarConfig.deleteMany(w);
  await prisma.sellerCalendarSetting.deleteMany(w);
  await prisma.calendarHoliday.deleteMany(w);
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@test-campaigns.local" } } });
}

async function main() {
  pure();
  await cleanup(["test-camp", "test-camp-b"]);
  const o = await prisma.organization.create({ data: { slug: "test-camp", name: "Test Campañas", status: "ACTIVE", timezone: "America/Bogota", currency: "USD" } });
  const ob = await prisma.organization.create({ data: { slug: "test-camp-b", name: "Otra", status: "ACTIVE" } });
  const boss = await prisma.user.create({ data: { email: "jefe@test-campaigns.local", name: "Jefa Ventas", passwordHash: "x" } });
  const ana = await prisma.user.create({ data: { email: "ana@test-campaigns.local", name: "Ana Vendedora", passwordHash: "x" } });
  const beto = await prisma.user.create({ data: { email: "beto@test-campaigns.local", name: "Beto Vendedor", passwordHash: "x" } });
  const mgr = await prisma.role.create({ data: { organizationId: o.id, key: "MGR", name: "Jefe", permissions: ["campaigns.*"] } });
  const sel = await prisma.role.create({ data: { organizationId: o.id, key: "SEL", name: "Vendedor", permissions: ["campaigns.read", "campaigns.write", "scope:own:campaigns"] } });
  await prisma.membership.createMany({ data: [
    { organizationId: o.id, userId: boss.id, roleId: mgr.id },
    { organizationId: o.id, userId: ana.id, roleId: sel.id },
    { organizationId: o.id, userId: beto.id, roleId: sel.id },
  ] });

  const db = tenantDb(o.id);
  const ctxOf = (userId: string): ExecContext => ({ orgId: o.id, db, actorId: userId });
  const scope = (userId: string, own: boolean, manage = !own): CampaignScope => ({ userId, own, manage, tz: "America/Bogota", currency: "USD" });
  const BOSS = scope(boss.id, false), ANA = scope(ana.id, true), BETO = scope(beto.id, true);
  const today = localNow("America/Bogota").key;

  // Jefa asigna a Ana; Ana no puede asignar a Beto (queda a su nombre).
  const c1 = await saveCampaign(ctxOf(boss.id), BOSS, { name: "Jabón Q4", sellerId: ana.id, investment: 100, sales: 500, targetMultiple: 10, startDate: addDays(today, -5) });
  const c2 = await saveCampaign(ctxOf(ana.id), ANA, { name: "Gel", sellerId: beto.id, platform: "TikTok Ads" });
  assert.equal(c1.sellerId, ana.id);
  assert.equal(c2.sellerId, ana.id);
  const c3 = await saveCampaign(ctxOf(boss.id), BOSS, { name: "Beto pauta", sellerId: beto.id });
  console.log("2. alcance al crear: vendedor con «solo sus campañas» no asigna a otros: ok");

  await assert.rejects(() => saveCampaign(ctxOf(boss.id), BOSS, { name: "" }), /Nombre requerido/);
  await assert.rejects(() => saveCampaign(ctxOf(boss.id), BOSS, { name: "X", startDate: "2026-09-10", endDate: "2026-09-01" }), /anterior/);
  await assert.rejects(() => saveCampaign(ctxOf(ana.id), ANA, { name: "Robo" }, c3.id), /tus campañas/);
  await assert.rejects(() => deleteCampaign(ctxOf(ana.id), ANA, c3.id), /tus campañas/);
  assert.equal((await listCampaigns(ctxOf(ana.id), ANA)).length, 2);
  assert.equal((await listCampaigns(ctxOf(boss.id), BOSS)).length, 3);
  await assert.rejects(() => getCampaignDays(ctxOf(ana.id), ANA, c3.id), /no encontrada/);
  console.log("3. validaciones y visibilidad (Ana ve 2, la jefa 3; no edita ni lee la de Beto): ok");

  // Matriz diaria: días con venta registran evento SALES; fecha repetida rechazada.
  const y = addDays(today, -1);
  const d1 = await addCampaignDay(ctxOf(ana.id), ANA, c1.id, { fecha: y, mensajes: 40, transacciones: 8, presupuestoPublicidad: 12.5, ventaDelDia: 900 });
  assert.equal(d1.trm, 1); // org en USD
  await assert.rejects(() => addCampaignDay(ctxOf(ana.id), ANA, c1.id, { fecha: y }), /Ya existe/);
  const d2 = await addCampaignDay(ctxOf(ana.id), ANA, c1.id, { fecha: addDays(today, -2), presupuestoPublicidad: 5 });
  await assert.rejects(() => saveCampaignDays(ctxOf(ana.id), ANA, c1.id, { deleted: [], updated: { [d2.id]: { fecha: y } } }), /Ya existe/);
  await saveCampaignDays(ctxOf(ana.id), ANA, c1.id, { deleted: [], updated: { [d2.id]: { ventaDelDia: 50, mensajes: -3 } } });
  const days = await getCampaignDays(ctxOf(ana.id), ANA, c1.id);
  assert.equal(days.length, 2);
  assert.equal(days.find((d) => d.id === d2.id)!.mensajes, 0); // negativos → 0
  assert.equal(await db.sellerReportEvent.count({ where: { kind: "SALES" } }), 2);
  const listed = (await listCampaigns(ctxOf(boss.id), BOSS)).find((c) => c.id === c1.id)!;
  assert.equal(listed.daily.days, 2);
  assert.equal(listed.daily.sales, 950);
  assert.equal(listed.daily.investmentUsd, 17.5);
  console.log("4. matriz diaria (alta, edición en lote, duplicados, log de ventas, totales): ok");

  // Calendario: seguimiento desde hace 10 días; Ana reportó ayer, Beto no.
  await saveCalendarSettings(ctxOf(boss.id), BOSS, { trackingStartDate: addDays(today, -10), deadlineMinutes: 1200, holidays: [{ date: addDays(today, -3), label: "Festivo" }] });
  await assert.rejects(() => saveCalendarSettings(ctxOf(ana.id), ANA, { deadlineMinutes: 1 }), /Permiso/);
  await assert.rejects(() => closeSellerDay(ctxOf(ana.id), ANA, { date: addDays(today, 1), noSales: true }), /futuro/);
  const cal = await loadCalendar(ctxOf(boss.id), BOSS, { month: y.slice(0, 7) });
  assert.deepEqual(cal.sellers.map((x) => x.name).sort(), ["Ana Vendedora", "Beto Vendedor"]);
  const anaCal = cal.sellers.find((x) => x.id === ana.id)!;
  assert.equal(anaCal.cells[y].status, "GREEN");
  assert.equal(anaCal.cells[y].total, 900);
  assert.equal(anaCal.cells[addDays(today, -3)]?.reason ?? "holiday", "holiday");
  const betoY = cal.sellers.find((x) => x.id === beto.id)!.cells[y];
  if (DEFAULT_WORK_DAYS.includes(new Date(`${y}T12:00:00Z`).getUTCDay()) && y !== addDays(today, -3)) assert.equal(betoY.status, "RED");
  // Beto confirma "sin ventas" ayer: queda verde y con retraso (se cerró hoy, después de la hora límite de ayer).
  await closeSellerDay(ctxOf(beto.id), BETO, { sellerId: ana.id, date: y, noSales: true }); // ignora sellerId ajeno
  const again = await closeSellerDay(ctxOf(beto.id), BETO, { date: y, noSales: true });
  assert.equal(await db.sellerDailyClose.count({}), 1); // idempotente
  assert.equal(again.sellerId, beto.id);
  const cal2 = await loadCalendar(ctxOf(boss.id), BOSS, { month: y.slice(0, 7) });
  const betoY2 = cal2.sellers.find((x) => x.id === beto.id)!.cells[y];
  assert.equal(betoY2.status, "GREEN");
  assert.equal(betoY2.noSales, true);
  assert.equal(betoY2.late, true);
  assert.ok(cal2.months.includes(y.slice(0, 7)));
  const own = await loadCalendar(ctxOf(ana.id), ANA, { month: y.slice(0, 7) });
  assert.deepEqual(own.sellers.map((x) => x.id), [ana.id]);
  const tiktok = await loadCalendar(ctxOf(boss.id), BOSS, { month: y.slice(0, 7), platform: "TikTok Ads" });
  assert.equal(tiktok.sellers.find((x) => x.id === ana.id)!.cells[y].total, 0);
  console.log("5. calendario (estados, festivo, cierre idempotente con retraso, alcance propio, filtro de plataforma): ok");

  // Vendedor inactivo sale del calendario.
  await saveCalendarSettings(ctxOf(boss.id), BOSS, { sellers: [{ userId: beto.id, workDays: [1, 2, 3, 4, 5], active: false }] });
  assert.equal((await loadCalendar(ctxOf(boss.id), BOSS, { month: y.slice(0, 7) })).sellers.length, 1);

  // Aislamiento: otra organización no ve nada.
  const dbB = tenantDb(ob.id);
  assert.equal(await dbB.campaign.count({}), 0);
  assert.equal(await dbB.campaignDaily.count({}), 0);
  assert.equal(await dbB.sellerDailyClose.count({}), 0);
  await assert.rejects(() => getCampaignDays({ orgId: ob.id, db: dbB, actorId: boss.id }, { ...BOSS }, c1.id), /no encontrada/);

  await deleteCampaign(ctxOf(boss.id), BOSS, c1.id);
  assert.equal(await db.campaignDaily.count({ where: { campaignId: c1.id } }), 0);
  console.log("6. configuración por vendedor, aislamiento entre empresas y borrado en cascada: ok");

  await cleanup(["test-camp", "test-camp-b"]);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
