import type { OrgContext } from "@/lib/core/context";
import { getWorkflow } from "@/lib/core/workflow";
import { orgUsers } from "@/lib/core/members";

/**
 * Tableros por área (estilo BI): KPIs con variación vs. periodo anterior,
 * un gráfico principal y dos rankings. Cada tablero exige su app + permiso,
 * y todo se calcula con ctx.db (solo datos de la organización activa).
 */
export type Range = { from: Date; to: Date; prevFrom: Date; prevTo: Date; label: string; period: string; offset: number; granularity: "week" | "month" };
/** prev definido = KPI del periodo (con variación); sin prev = foto actual ("Hoy"). hint = contexto legible. */
export type Kpi = { label: string; value: number; prev?: number; format: "money" | "number" | "percent"; invert?: boolean; hint?: string };
/** colors: color por barra (escala secuencial de un tono para magnitud/riesgo). */
export type Series = { name: string; color: string; values: number[]; colors?: string[] };
export type Chart = { title: string; kind: "area" | "bar"; labels: string[]; series: Series[]; format: "money" | "number" };
export type RankTable = { title: string; columns: string[]; rows: { cells: string[]; value: number; href?: string }[]; format: "money" | "number" };
export type BoardData = { kpis: Kpi[]; chart?: Chart; tables: RankTable[] };
export type Board = { key: string; group: string; label: string; module: string; permission: string; snapshot?: boolean; compute: (ctx: OrgContext, r: Range) => Promise<BoardData> };

export const SERIES = { primary: "#6f35b5", secondary: "#e8a33a" };
/** Secuencial violeta (claro → oscuro): más oscuro = más riesgo / magnitud. */
export const SEQ = ["#c9b6f2", "#a585e3", "#8257cf", "#5e2fa8", "#3c1676"];
const DAY = 86400000;
const n = (v: unknown) => Number(v ?? 0);
const inRange = (from: Date, to: Date) => ({ gte: from, lt: to });

export const PERIODS: Record<string, { label: string; days: number }> = {
  "30": { label: "Últimos 30 días", days: 30 }, "90": { label: "Últimos 90 días", days: 90 },
  "180": { label: "Últimos 6 meses", days: 180 }, "365": { label: "Últimos 12 meses", days: 365 },
};

export function makeRange(period = "90", offset = 0): Range {
  const p = PERIODS[period] ?? PERIODS["90"];
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const to = new Date(end.getTime() + 1 - offset * p.days * DAY);
  const from = new Date(to.getTime() - p.days * DAY);
  const fmt = (d: Date) => d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  return {
    from, to, prevFrom: new Date(from.getTime() - p.days * DAY), prevTo: from, period: period in PERIODS ? period : "90", offset,
    label: offset === 0 ? p.label : `${fmt(from)} – ${fmt(new Date(to.getTime() - 1))}`, granularity: p.days <= 31 ? "week" : "month",
  };
}

/** Cubetas de tiempo (semanas o meses) del rango. */
function buckets(r: Range) {
  const out: { label: string; from: Date; to: Date }[] = [];
  if (r.granularity === "week") {
    for (let t = r.from.getTime(); t < r.to.getTime(); t += 7 * DAY) {
      const f = new Date(t), e = new Date(Math.min(t + 7 * DAY, r.to.getTime()));
      out.push({ label: f.toLocaleDateString("es-CO", { day: "numeric", month: "short" }), from: f, to: e });
    }
  } else {
    const d = new Date(r.from.getFullYear(), r.from.getMonth(), 1);
    while (d < r.to) {
      const f = new Date(d), e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      out.push({ label: f.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }).replace(".", ""), from: f < r.from ? r.from : f, to: e > r.to ? r.to : e });
      d.setMonth(d.getMonth() + 1);
    }
  }
  return out;
}

function bucketize<T>(r: Range, items: T[], date: (x: T) => Date, value: (x: T) => number) {
  const bs = buckets(r);
  return { labels: bs.map((b) => b.label), values: bs.map((b) => items.filter((x) => date(x) >= b.from && date(x) < b.to).reduce((s, x) => s + value(x), 0)) };
}

const pctOf = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} % del total` : undefined);
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

function topBy<T>(items: T[], key: (x: T) => string, value: (x: T) => number, limit = 8) {
  const m = new Map<string, number>();
  for (const x of items) m.set(key(x), (m.get(key(x)) ?? 0) + value(x));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

// ─────────────────────────── Tableros ───────────────────────────

export const BOARDS: Board[] = [
  {
    key: "sales", group: "Ventas", label: "Ventas", module: "sales", permission: "sales.quotes.read",
    async compute(ctx, r) {
      const [quotes, prevQuotes, orders, prevOrders, users] = await Promise.all([
        ctx.db.quote.findMany({ where: { createdAt: inRange(r.from, r.to) }, include: { customer: true } }),
        ctx.db.quote.count({ where: { createdAt: inRange(r.prevFrom, r.prevTo) } }),
        ctx.db.salesOrder.findMany({ where: { createdAt: inRange(r.from, r.to), status: { not: "canceled" } }, include: { customer: true } }),
        ctx.db.salesOrder.findMany({ where: { createdAt: inRange(r.prevFrom, r.prevTo), status: { not: "canceled" } }, select: { total: true } }),
        orgUsers(ctx),
      ]);
      const um = new Map(users.map((u) => [u.id, u.name]));
      const rev = sum(orders, (o) => n(o.total)), prevRev = sum(prevOrders, (o) => n(o.total));
      const b = bucketize(r, orders, (o) => o.createdAt, (o) => n(o.total));
      const openQuotes = quotes.filter((q) => !["converted", "rejected"].includes(q.status)).sort((a, b) => n(b.total) - n(a.total)).slice(0, 8);
      return {
        kpis: [
          { label: "Cotizaciones", value: quotes.length, prev: prevQuotes, format: "number", hint: `${quotes.filter((q) => q.status === "converted").length} convertidas en pedido` },
          { label: "Pedidos", value: orders.length, prev: prevOrders.length, format: "number" },
          { label: "Ingreso", value: rev, prev: prevRev, format: "money" },
          { label: "Pedido promedio", value: orders.length ? rev / orders.length : 0, prev: prevOrders.length ? prevRev / prevOrders.length : 0, format: "money", hint: "Ingreso ÷ pedidos" },
        ],
        chart: { title: "Ventas mensuales", kind: "area", labels: b.labels, series: [{ name: "Ingreso", color: SERIES.primary, values: b.values }], format: "money" },
        tables: [
          { title: "Mejores cotizaciones abiertas", columns: ["Cliente", "Vendedor", "Total"], format: "money",
            rows: openQuotes.map((q) => ({ cells: [q.customer.name, um.get(q.ownerId ?? "") ?? "—"], value: n(q.total), href: `/sales/quotes/${q.id}` })) },
          { title: "Pedidos de venta principales", columns: ["Cliente", "Vendedor", "Ingreso"], format: "money",
            rows: [...orders].sort((a, b) => n(b.total) - n(a.total)).slice(0, 8).map((o) => ({ cells: [o.customer.name, um.get(o.ownerId ?? "") ?? "—"], value: n(o.total), href: `/sales/orders/${o.id}` })) },
        ],
      };
    },
  },
  {
    key: "products", group: "Ventas", label: "Productos", module: "sales", permission: "sales.quotes.read",
    async compute(ctx, r) {
      const [lines, prevLines, products] = await Promise.all([
        ctx.db.salesOrderLine.findMany({ where: { order: { organizationId: ctx.orgId, createdAt: inRange(r.from, r.to), status: { not: "canceled" } } } }),
        ctx.db.salesOrderLine.findMany({ where: { order: { organizationId: ctx.orgId, createdAt: inRange(r.prevFrom, r.prevTo), status: { not: "canceled" } } } }),
        ctx.db.product.findMany(),
      ]);
      const pm = new Map(products.map((p) => [p.id, p]));
      const margin = (ls: typeof lines) => sum(ls, (l) => n(l.total) - n(l.quantity) * n(pm.get(l.productId ?? "")?.cost));
      const byCat = topBy(lines, (l) => pm.get(l.productId ?? "")?.category ?? "Otros", (l) => n(l.total), 8);
      const top = topBy(lines.filter((l) => l.productId), (l) => l.productId!, (l) => n(l.total), 8);
      const qty = topBy(lines.filter((l) => l.productId), (l) => l.productId!, (l) => n(l.quantity), 8);
      return {
        kpis: [
          { label: "Unidades vendidas", value: sum(lines, (l) => n(l.quantity)), prev: sum(prevLines, (l) => n(l.quantity)), format: "number" },
          { label: "Referencias vendidas", value: new Set(lines.map((l) => l.productId)).size, prev: new Set(prevLines.map((l) => l.productId)).size, format: "number" },
          { label: "Ingreso", value: sum(lines, (l) => n(l.total)), prev: sum(prevLines, (l) => n(l.total)), format: "money" },
          { label: "Margen bruto", value: margin(lines), prev: margin(prevLines), format: "money" },
        ],
        chart: { title: "Ventas por categoría", kind: "bar", labels: byCat.map(([k]) => k), series: [{ name: "Ingreso", color: SERIES.primary, values: byCat.map(([, v]) => v) }], format: "money" },
        tables: [
          { title: "Productos con más ingreso", columns: ["Producto", "Categoría", "Ingreso"], format: "money", rows: top.map(([id, v]) => ({ cells: [pm.get(id)?.name ?? "—", pm.get(id)?.category ?? "—"], value: v })) },
          { title: "Productos con más unidades", columns: ["Producto", "Unidad", "Cantidad"], format: "number", rows: qty.map(([id, v]) => ({ cells: [pm.get(id)?.name ?? "—", pm.get(id)?.unit ?? ""], value: v })) },
        ],
      };
    },
  },
  {
    key: "crm", group: "CRM", label: "Oportunidades", module: "crm", permission: "crm.opportunities.read",
    async compute(ctx, r) {
      const [all, created, prevCreated, wf, users] = await Promise.all([
        ctx.db.opportunity.findMany({ include: { customer: true } }),
        ctx.db.opportunity.count({ where: { createdAt: inRange(r.from, r.to) } }),
        ctx.db.opportunity.count({ where: { createdAt: inRange(r.prevFrom, r.prevTo) } }),
        getWorkflow(ctx.db, "opportunity"), orgUsers(ctx),
      ]);
      const um = new Map(users.map((u) => [u.id, u.name]));
      const open = all.filter((o) => !["won", "lost"].includes(o.status));
      const won = all.filter((o) => o.status === "won"), lost = all.filter((o) => o.status === "lost");
      const states = (wf?.states ?? []).filter((s) => !["won", "lost"].includes(s.key));
      const bySeller = topBy(open, (o) => um.get(o.ownerId ?? "") ?? "Sin asignar", (o) => n(o.amount), 8);
      return {
        kpis: [
          { label: "Oportunidades nuevas", value: created, prev: prevCreated, format: "number" },
          { label: "Pipeline abierto", value: sum(open, (o) => n(o.amount)), format: "money", hint: `${open.length} oportunidades abiertas` },
          { label: "Ganadas", value: sum(won, (o) => n(o.amount)), format: "money", hint: `${won.length} oportunidades` },
          { label: "Tasa de cierre", value: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : 0, format: "percent", hint: `${won.length} ganadas de ${won.length + lost.length} cerradas` },
        ],
        chart: { title: "Pipeline por etapa", kind: "bar", labels: states.map((s) => s.label), series: [{ name: "Valor", color: SERIES.primary, values: states.map((s) => sum(open.filter((o) => o.status === s.key), (o) => n(o.amount))) }], format: "money" },
        tables: [
          { title: "Oportunidades principales", columns: ["Oportunidad", "Cliente", "Valor"], format: "money", rows: [...open].sort((a, b) => n(b.amount) - n(a.amount)).slice(0, 8).map((o) => ({ cells: [o.title, o.customer?.name ?? "—"], value: n(o.amount), href: "/crm/opportunities" })) },
          { title: "Pipeline por vendedor", columns: ["Vendedor", "", "Valor"], format: "money", rows: bySeller.map(([k, v]) => ({ cells: [k, ""], value: v })) },
        ],
      };
    },
  },
  {
    key: "invoicing", group: "Finanzas", label: "Facturación", module: "invoicing", permission: "invoicing.read",
    async compute(ctx, r) {
      const [invs, prevInvs, pays, prevPays, open] = await Promise.all([
        ctx.db.invoice.findMany({ where: { type: "OUT_INVOICE", issuedAt: inRange(r.from, r.to), status: { not: "void" } } }),
        ctx.db.invoice.findMany({ where: { type: "OUT_INVOICE", issuedAt: inRange(r.prevFrom, r.prevTo), status: { not: "void" } }, select: { total: true } }),
        ctx.db.payment.findMany({ where: { direction: "INBOUND", date: inRange(r.from, r.to) } }),
        ctx.db.payment.findMany({ where: { direction: "INBOUND", date: inRange(r.prevFrom, r.prevTo) }, select: { amount: true } }),
        ctx.db.invoice.findMany({ where: { type: "OUT_INVOICE", status: "issued" }, include: { customer: true } }),
      ]);
      const now = new Date();
      const overdue = open.filter((i) => i.dueDate < now);
      const f = bucketize(r, invs, (i) => i.issuedAt, (i) => n(i.total));
      const c = bucketize(r, pays, (p) => p.date, (p) => n(p.amount));
      const byCustomer = topBy(open, (i) => i.customer.name, (i) => n(i.balance), 8);
      return {
        kpis: [
          { label: "Facturado", value: sum(invs, (i) => n(i.total)), prev: sum(prevInvs, (i) => n(i.total)), format: "money" },
          { label: "Cobrado", value: sum(pays, (p) => n(p.amount)), prev: sum(prevPays, (p) => n(p.amount)), format: "money" },
          { label: "Cartera", value: sum(open, (i) => n(i.balance)), format: "money", hint: `${open.length} facturas abiertas` },
          { label: "Cartera vencida", value: sum(overdue, (i) => n(i.balance)), format: "money", invert: true, hint: `${overdue.length} facturas · ${pctOf(sum(overdue, (i) => n(i.balance)), sum(open, (i) => n(i.balance))) ?? "0 %"}` },
        ],
        chart: { title: "Facturado vs. cobrado", kind: "area", labels: f.labels, series: [{ name: "Facturado", color: SERIES.primary, values: f.values }, { name: "Cobrado", color: SERIES.secondary, values: c.values }], format: "money" },
        tables: [
          { title: "Clientes con mayor saldo", columns: ["Cliente", "", "Saldo"], format: "money", rows: byCustomer.map(([k, v]) => ({ cells: [k, ""], value: v })) },
          { title: "Facturas vencidas", columns: ["Factura", "Cliente", "Saldo"], format: "money", rows: [...overdue].sort((a, b) => n(b.balance) - n(a.balance)).slice(0, 8).map((i) => ({ cells: [`${i.number} · ${Math.floor((now.getTime() - i.dueDate.getTime()) / DAY)} d`, i.customer.name], value: n(i.balance), href: `/invoicing/${i.id}` })) },
        ],
      };
    },
  },
  {
    key: "receivables", group: "Finanzas", label: "Cartera por edades", module: "invoicing", permission: "invoicing.read", snapshot: true,
    async compute(ctx) {
      const open = await ctx.db.invoice.findMany({ where: { type: "OUT_INVOICE", status: "issued" }, include: { customer: true } });
      const now = Date.now();
      const age = (d: Date) => Math.floor((now - d.getTime()) / DAY);
      const bucketsDef = [["Al día", (a: number) => a <= 0], ["1–30", (a: number) => a > 0 && a <= 30], ["31–60", (a: number) => a > 30 && a <= 60], ["61–90", (a: number) => a > 60 && a <= 90], ["+90", (a: number) => a > 90]] as const;
      const total = sum(open, (i) => n(i.balance));
      const overdue = sum(open.filter((i) => age(i.dueDate) > 0), (i) => n(i.balance));
      const byCustomer = topBy(open.filter((i) => age(i.dueDate) > 0), (i) => i.customer.name, (i) => n(i.balance), 8);
      return {
        kpis: [
          { label: "Cartera total", value: total, format: "money", hint: `${open.length} facturas abiertas` },
          { label: "Vencida", value: overdue, format: "money", invert: true, hint: `${open.filter((i) => age(i.dueDate) > 0).length} facturas` },
          { label: "% vencida", value: total ? (overdue / total) * 100 : 0, format: "percent", invert: true, hint: "Vencida ÷ cartera total" },
          { label: "Más de 90 días", value: sum(open.filter((i) => age(i.dueDate) > 90), (i) => n(i.balance)), format: "money", invert: true, hint: "Riesgo alto de no pago" },
        ],
        chart: { title: "Cartera por días de vencimiento", kind: "bar", labels: bucketsDef.map(([l]) => l), series: [{ name: "Saldo", color: SERIES.primary, colors: SEQ, values: bucketsDef.map(([, f]) => sum(open.filter((i) => f(age(i.dueDate))), (i) => n(i.balance))) }], format: "money" },
        tables: [
          { title: "Clientes con cartera vencida", columns: ["Cliente", "", "Vencido"], format: "money", rows: byCustomer.map(([k, v]) => ({ cells: [k, ""], value: v })) },
          { title: "Facturas por vencer (próximos 30 días)", columns: ["Factura", "Cliente", "Saldo"], format: "money", rows: open.filter((i) => age(i.dueDate) <= 0 && age(i.dueDate) > -30).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()).slice(0, 8).map((i) => ({ cells: [i.number, i.customer.name], value: n(i.balance), href: `/invoicing/${i.id}` })) },
        ],
      };
    },
  },
  {
    key: "purchasing", group: "Logística", label: "Compras", module: "purchasing", permission: "purchasing.read",
    async compute(ctx, r) {
      const confirmed = { status: { in: ["purchase", "received"] } };
      const [pos, prevPos, pending, bills] = await Promise.all([
        ctx.db.purchaseOrder.findMany({ where: { ...confirmed, createdAt: inRange(r.from, r.to) }, include: { supplier: true } }),
        ctx.db.purchaseOrder.findMany({ where: { ...confirmed, createdAt: inRange(r.prevFrom, r.prevTo) }, select: { total: true } }),
        ctx.db.purchaseOrder.findMany({ where: { status: "purchase" }, include: { supplier: true } }),
        ctx.hasModule("invoicing") ? ctx.db.bill.findMany({ where: { status: "posted" }, select: { balance: true } }) : [],
      ]);
      const b = bucketize(r, pos, (p) => p.createdAt, (p) => n(p.total));
      const bySupplier = topBy(pos, (p) => p.supplier.name, (p) => n(p.total), 8);
      return {
        kpis: [
          { label: "Órdenes confirmadas", value: pos.length, prev: prevPos.length, format: "number" },
          { label: "Total comprado", value: sum(pos, (p) => n(p.total)), prev: sum(prevPos, (p) => n(p.total)), format: "money" },
          { label: "Por recibir", value: sum(pending, (p) => n(p.total)), format: "money", hint: `${pending.length} órdenes confirmadas` },
          { label: "Cuentas por pagar", value: sum(bills, (x) => n(x.balance)), format: "money", hint: `${bills.length} facturas de proveedor` },
        ],
        chart: { title: "Compras mensuales", kind: "area", labels: b.labels, series: [{ name: "Comprado", color: SERIES.primary, values: b.values }], format: "money" },
        tables: [
          { title: "Principales proveedores", columns: ["Proveedor", "", "Comprado"], format: "money", rows: bySupplier.map(([k, v]) => ({ cells: [k, ""], value: v })) },
          { title: "Órdenes pendientes de recibir", columns: ["Orden", "Proveedor", "Total"], format: "money", rows: pending.sort((a, b) => n(b.total) - n(a.total)).slice(0, 8).map((p) => ({ cells: [p.number, p.supplier.name], value: n(p.total), href: `/purchasing/orders/${p.id}` })) },
        ],
      };
    },
  },
  {
    key: "inventory", group: "Logística", label: "Inventario", module: "inventory", permission: "inventory.read",
    async compute(ctx, r) {
      const [products, moves, prevMoves, pendingT] = await Promise.all([
        ctx.db.product.findMany({ where: { kind: "GOODS", active: true } }),
        ctx.db.stockMovement.findMany({ where: { createdAt: inRange(r.from, r.to) } }),
        ctx.db.stockMovement.count({ where: { createdAt: inRange(r.prevFrom, r.prevTo) } }),
        ctx.db.transfer.findMany({ where: { status: { in: ["ready", "waiting"] } }, include: { operationType: true } }),
      ]);
      const value = sum(products, (p) => n(p.stock) * n(p.cost));
      const low = products.filter((p) => n(p.minStock) > 0 && n(p.stock) < n(p.minStock));
      const ins = bucketize(r, moves.filter((m) => ["IN", "PRODUCE"].includes(m.type)), (m) => m.createdAt, (m) => n(m.quantity));
      const outs = bucketize(r, moves.filter((m) => ["OUT", "CONSUME"].includes(m.type)), (m) => m.createdAt, (m) => n(m.quantity));
      const byValue = [...products].sort((a, b) => n(b.stock) * n(b.cost) - n(a.stock) * n(a.cost)).slice(0, 8);
      return {
        kpis: [
          { label: "Valor del inventario", value, format: "money", hint: `${products.length} referencias a costo` },
          { label: "Movimientos", value: moves.length, prev: prevMoves, format: "number", hint: "Líneas de stock movidas" },
          { label: "Transferencias pendientes", value: pendingT.length, format: "number", hint: `${pendingT.filter((t) => t.status === "waiting").length} esperando existencias` },
          { label: "Productos bajo mínimo", value: low.length, format: "number", invert: true, hint: `de ${products.filter((p) => n(p.minStock) > 0).length} con mínimo definido` },
        ],
        chart: { title: "Entradas vs. salidas (unidades)", kind: "bar", labels: ins.labels, series: [{ name: "Entradas", color: SERIES.primary, values: ins.values }, { name: "Salidas", color: SERIES.secondary, values: outs.values }], format: "number" },
        tables: [
          { title: "Mayor valor en inventario", columns: ["Producto", "Existencia", "Valor"], format: "money", rows: byValue.map((p) => ({ cells: [p.name, `${n(p.stock).toLocaleString("es-CO")} ${p.unit}`], value: n(p.stock) * n(p.cost) })) },
          { title: "Bajo el mínimo", columns: ["Producto", "Mínimo", "Existencia"], format: "number", rows: low.map((p) => ({ cells: [p.name, n(p.minStock).toLocaleString("es-CO")], value: n(p.stock), href: "/inventory/replenishment" })) },
        ],
      };
    },
  },
  {
    key: "manufacturing", group: "Producción", label: "Manufactura", module: "manufacturing", permission: "manufacturing.read",
    async compute(ctx, r) {
      const [done, prevDone, open, products] = await Promise.all([
        ctx.db.productionOrder.findMany({ where: { status: "done", doneAt: inRange(r.from, r.to) } }),
        ctx.db.productionOrder.findMany({ where: { status: "done", doneAt: inRange(r.prevFrom, r.prevTo) }, select: { producedQty: true } }),
        ctx.db.productionOrder.findMany({ where: { status: { in: ["draft", "confirmed", "in_progress"] } } }),
        ctx.db.product.findMany({ select: { id: true, name: true } }),
      ]);
      const pm = new Map(products.map((p) => [p.id, p.name]));
      const late = open.filter((o) => o.status !== "draft" && o.scheduledAt.getTime() < Date.now() - DAY);
      const b = bucketize(r, done, (o) => o.doneAt!, (o) => n(o.producedQty));
      const top = topBy(done, (o) => pm.get(o.productId) ?? "—", (o) => n(o.producedQty), 8);
      return {
        kpis: [
          { label: "Órdenes terminadas", value: done.length, prev: prevDone.length, format: "number" },
          { label: "Unidades producidas", value: sum(done, (o) => n(o.producedQty)), prev: sum(prevDone, (o) => n(o.producedQty)), format: "number" },
          { label: "Órdenes abiertas", value: open.length, format: "number", hint: `${open.filter((o) => o.status === "in_progress").length} en proceso` },
          { label: "Atrasadas", value: late.length, format: "number", invert: true, hint: late.length ? `de ${open.length} abiertas` : "Todo a tiempo" },
        ],
        chart: { title: "Unidades producidas", kind: "bar", labels: b.labels, series: [{ name: "Unidades", color: SERIES.primary, values: b.values }], format: "number" },
        tables: [
          { title: "Productos más fabricados", columns: ["Producto", "", "Unidades"], format: "number", rows: top.map(([k, v]) => ({ cells: [k, ""], value: v })) },
          { title: "Órdenes abiertas", columns: ["Orden", "Producto", "Pendiente"], format: "number", rows: open.slice(0, 8).map((o) => ({ cells: [o.number, pm.get(o.productId) ?? "—"], value: n(o.quantity) - n(o.producedQty), href: `/manufacturing/orders/${o.id}` })) },
        ],
      };
    },
  },
  {
    key: "quality", group: "Producción", label: "Calidad", module: "quality", permission: "quality.read",
    async compute(ctx, r) {
      const [ncs, prev, all] = await Promise.all([
        ctx.db.nonconformity.findMany({ where: { createdAt: inRange(r.from, r.to) }, include: { supplier: true } }),
        ctx.db.nonconformity.count({ where: { createdAt: inRange(r.prevFrom, r.prevTo) } }),
        ctx.db.nonconformity.findMany({ include: { supplier: true } }),
      ]);
      const bySup = topBy(all.filter((x) => x.supplier), (x) => x.supplier!.name, () => 1, 8);
      const sev = ["CRITICAL", "HIGH", "MEDIUM", "LOW"], sevL: Record<string, string> = { CRITICAL: "Crítica", HIGH: "Alta", MEDIUM: "Media", LOW: "Baja" };
      return {
        kpis: [
          { label: "No conformidades nuevas", value: ncs.length, prev, format: "number", invert: true, hint: "Registradas en el periodo" },
          { label: "Abiertas", value: all.filter((x) => x.status === "open").length, format: "number", invert: true, hint: `de ${all.length} registradas` },
          { label: "Graves (alta/crítica)", value: all.filter((x) => ["HIGH", "CRITICAL"].includes(x.severity)).length, format: "number", invert: true, hint: pctOf(all.filter((x) => ["HIGH", "CRITICAL"].includes(x.severity)).length, all.length) },
          { label: "Proveedores afectados", value: new Set(all.map((x) => x.supplierId).filter(Boolean)).size, format: "number", hint: `de ${await ctx.db.supplier.count()} proveedores` },
        ],
        chart: { title: "No conformidades por severidad", kind: "bar", labels: sev.map((s) => sevL[s]), series: [{ name: "Cantidad", color: SERIES.primary, colors: [SEQ[4], SEQ[3], SEQ[2], SEQ[0]], values: sev.map((s) => all.filter((x) => x.severity === s).length) }], format: "number" },
        tables: [
          { title: "Proveedores con más no conformidades", columns: ["Proveedor", "", "Cantidad"], format: "number", rows: bySup.map(([k, v]) => ({ cells: [k, ""], value: v })) },
          { title: "Recientes", columns: ["Código", "Descripción", "Días"], format: "number", rows: [...all].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 8).map((x) => ({ cells: [x.code, x.title], value: Math.floor((Date.now() - x.createdAt.getTime()) / DAY), href: "/quality" })) },
        ],
      };
    },
  },
];

export function availableBoards(ctx: OrgContext) {
  return BOARDS.filter((b) => ctx.hasModule(b.module) && ctx.can(b.permission));
}
