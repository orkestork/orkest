import { requireModule } from "@/lib/core/context";
import { getWorkflow } from "@/lib/core/workflow";
import { orgPeople } from "@/lib/core/members";
import { ControlPanel } from "@/components/list/control-panel";
import { DataTable, type Column, type Group, type Row } from "@/components/list/data-table";
import { Avatar, StatusPill } from "@/components/list/status-pill";
import { BarChart } from "@/components/charts";
import { money } from "@/lib/ui/format";
import { DELIVERY_STATUS, INVOICE_STATUS } from "@/lib/ui/sales-labels";
import type { Prisma } from "@/lib/generated/prisma/client";
import { fieldOptions, formatFieldValue, getFieldDefs } from "@/lib/core/custom-fields";
import { customCondition, dateWhere, parseList, type FieldKind, type ListField } from "@/lib/ui/list-query";
import { customJsonCondition } from "@/lib/ui/list-query-server";
import { applyDefaultFavorite, listFavorites } from "@/lib/ui/favorites";
import { ownerScope } from "@/lib/core/scope";

export const metadata = { title: "Pedidos de venta" };
const PAGE = 80;
/** Agrupar trae como máximo esta cantidad de pedidos (los más recientes según el orden). */
const GROUP_LIMIT = 2000;
const n = (v: unknown) => Number(v ?? 0);
const when = (d: Date) => d.toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const monthKey = (d: Date) => d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
const monthShort = (d: Date) => d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }).replace(".", "");

export default async function SalesOrders({ searchParams }: PageProps<"/sales/orders">) {
  const ctx = await requireModule("sales", "sales.quotes.read");
  const sp = await searchParams;
  const [wf, users, defs, favorites] = await Promise.all([getWorkflow(ctx.db, "sales_order"), orgPeople(ctx), getFieldDefs(ctx.db, "sales_order"), listFavorites(ctx, "sales_order")]);
  applyDefaultFavorite(favorites, Object.keys(sp).length === 0, "/sales/orders");
  const L = parseList(sp, "number");
  // Compatibilidad con enlaces antiguos (?filter=to_deliver|to_invoice)
  const legacy = sp.filter === "to_deliver" ? "deliver" : sp.filter === "to_invoice" ? "invoice" : "";
  const active = [...L.filters, legacy].filter(Boolean);
  const view = L.view;

  // Campos de Studio que se pueden filtrar (listas y sí/no) y mostrar como columnas
  const listDefs = defs.filter((d) => ["select", "boolean", "text", "user"].includes(d.type));
  const filterDefs = defs.filter((d) => d.type === "select" || d.type === "boolean");
  const states = wf?.states ?? [];
  const stateOf = new Map(states.map((s) => [s.key, s]));
  const um = new Map(users.map((u) => [u.id, u.name]));
  const opts = (r: Record<string, { label: string }>) => Object.entries(r).map(([value, v]) => ({ value, label: v.label }));
  const kindOf = (t: string): FieldKind => (t === "number" || t === "currency" ? "number" : t === "date" || t === "datetime" ? "date" : t === "select" ? "select" : t === "boolean" ? "boolean" : "text");

  // ── Campos para filtro y agrupación personalizados ──
  const fields: ListField[] = [
    { key: "number", label: "Número", kind: "text" },
    { key: "customer", label: "Cliente", kind: "text", groupable: true },
    { key: "createdAt", label: "Fecha", kind: "date" },
    { key: "commitmentAt", label: "Fecha compromiso", kind: "date" },
    { key: "total", label: "Total", kind: "number" },
    { key: "subtotal", label: "Base", kind: "number" },
    { key: "status", label: "Estado", kind: "select", options: states.map((st) => ({ value: st.key, label: st.label })), groupable: true },
    { key: "deliveryStatus", label: "Entrega", kind: "select", options: opts(DELIVERY_STATUS), groupable: true },
    { key: "invoiceStatus", label: "Facturación", kind: "select", options: opts(INVOICE_STATUS), groupable: true },
    { key: "taxExempt", label: "Sin IVA", kind: "boolean", groupable: true },
    ...defs.map((d): ListField => ({ key: `cf_${d.key}`, label: d.label, kind: kindOf(d.type), options: d.type === "select" ? fieldOptions(d) : undefined, groupable: d.type === "select" || d.type === "boolean" })),
  ];

  // ── Filtros predefinidos (combinables; los de estado se suman con O) ──
  const statusKeys = active.filter((k) => k.startsWith("status:")).map((k) => k.slice(7));
  // Alcance del rol: un vendedor restringido solo ve los pedidos que tiene asignados
  const where: Prisma.SalesOrderWhereInput = { ...ownerScope(ctx, "sales") };
  const and: Prisma.SalesOrderWhereInput[] = [];
  if (statusKeys.length) where.status = { in: statusKeys };
  if (active.includes("mine")) where.ownerId = ctx.user.id;
  if (active.includes("deliver")) { where.status = { in: statusKeys.length ? statusKeys : ["confirmed"] }; where.deliveryStatus = { not: "full" }; }
  if (active.includes("invoice")) where.invoiceStatus = "to_invoice";
  if (active.includes("taxed") !== active.includes("exempt")) where.taxExempt = active.includes("exempt");
  // Filtros por campos de Studio: cf:<campo>=<valor> (mismo campo → O, distintos campos → Y)
  const cfFilters = new Map<string, string[]>();
  for (const k of active.filter((x) => x.startsWith("cf:"))) { const [key, value] = k.slice(3).split("="); cfFilters.set(key, [...(cfFilters.get(key) ?? []), value]); }
  for (const [key, values] of cfFilters) {
    const def = filterDefs.find((d) => d.key === key);
    if (def) and.push({ OR: values.map((v) => ({ customFields: { path: [key], equals: def.type === "boolean" ? v === "true" : v } })) });
  }
  // ── Fechas (meses / trimestres / años) ──
  and.push(...(dateWhere(L.dates, (f) => (["createdAt", "commitmentAt"].includes(f) ? f : null)) as Prisma.SalesOrderWhereInput[]));
  // ── Búsqueda por campo ("Buscar Cliente por: …"); valores del mismo campo → O ──
  const ci = (v: string) => ({ contains: v, mode: "insensitive" as const });
  const matchUsers = (v: string) => users.filter((u) => u.name.toLowerCase().includes(v.toLowerCase())).map((u) => u.id);
  // Producto: por referencia o nombre (también líneas sin producto, por descripción)
  const prodIds = new Map<string, string[]>();
  for (const v of L.search.get("product") ?? []) prodIds.set(v, (await ctx.db.product.findMany({ where: { OR: [{ sku: ci(v) }, { name: ci(v) }] }, select: { id: true }, take: 500 })).map((p) => p.id));
  const searchBy: Record<string, (v: string) => Prisma.SalesOrderWhereInput> = {
    number: (v) => ({ number: ci(v) }),
    customer: (v) => ({ customer: { name: ci(v) } }),
    owner: (v) => ({ ownerId: { in: matchUsers(v) } }),
    product: (v) => ({ lines: { some: { OR: [{ productId: { in: prodIds.get(v) ?? [] } }, { description: ci(v) }] } } }),
    ...Object.fromEntries(defs.filter((d) => ["text", "select"].includes(d.type)).map((d) => [`cf_${d.key}`, (v: string) => ({ customFields: { path: [d.key], string_contains: v } })])),
  };
  for (const [k, values] of L.search) if (searchBy[k]) and.push({ OR: values.map(searchBy[k]) });
  // ── Filtros personalizados ──
  for (const c of L.custom) {
    const f = fields.find((x) => x.key === c.field);
    if (!f) continue;
    if (f.key.startsWith("cf_")) { const w = customJsonCondition(f.key.slice(3), f.kind, c.op, c.value); if (w) and.push(w as Prisma.SalesOrderWhereInput); continue; }
    const cond = customCondition(f.kind, c.op, c.value);
    if (cond === undefined) continue;
    and.push(f.key === "customer" ? { customer: { name: cond as Prisma.StringFilter } } : ({ [f.key]: cond } as Prisma.SalesOrderWhereInput));
  }
  if (and.length) where.AND = and;

  // ── Orden y página (en la base: hay organizaciones con miles de pedidos) ──
  const sort = L.sort || "createdAt", dir: Prisma.SortOrder = L.dir;
  const orderBy: Prisma.SalesOrderOrderByWithRelationInput =
    sort === "customer" ? { customer: { name: dir } } : sort === "owner" ? { ownerId: dir } : ["number", "total", "status", "commitmentAt", "deliveryStatus", "invoiceStatus"].includes(sort) ? { [sort]: dir } : { createdAt: dir };
  const page = L.page;
  const group = L.groups.join(",");
  const [total, orders] = await Promise.all([
    ctx.db.salesOrder.count({ where }),
    ctx.db.salesOrder.findMany({
      where, orderBy: [orderBy, { id: "desc" }], include: { customer: { select: { name: true } }, lines: { select: { productId: true, quantity: true } } },
      ...(group ? { take: GROUP_LIMIT } : { skip: (page - 1) * PAGE, take: PAGE }),
    }),
  ]);
  const productIds = [...new Set(orders.flatMap((o) => o.lines.map((l) => l.productId ?? "")))].filter(Boolean);
  const [products, tasks] = await Promise.all([
    ctx.db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, cost: true } }),
    ctx.db.task.groupBy({ by: ["sourceId"], where: { sourceType: "sales_order", status: "OPEN", sourceId: { in: orders.map((o) => o.id) } }, _count: true }),
  ]);
  // Con costos ocultos no se calcula margen: ningún costo llega al navegador
  const cost = new Map(ctx.restricted("deny:costs") ? [] : products.map((p) => [p.id, n(p.cost)]));
  const taskCount = new Map(tasks.map((t) => [t.sourceId, t._count]));

  const data = orders.map((o) => {
    const margin = n(o.subtotal) - o.lines.reduce((s, l) => s + n(l.quantity) * (cost.get(l.productId ?? "") ?? 0), 0);
    return { o, margin, marginPct: n(o.subtotal) ? (margin / n(o.subtotal)) * 100 : 0, owner: um.get(o.ownerId ?? "") ?? "" };
  });

  const cfOf = (d: (typeof data)[number]) => (d.o.customFields ?? {}) as Record<string, unknown>;
  const toRow = (d: (typeof data)[number]): Row => {
    const st = stateOf.get(d.o.status);
    const t = taskCount.get(d.o.id) ?? 0;
    const del = DELIVERY_STATUS[d.o.deliveryStatus] ?? DELIVERY_STATUS.none, inv = INVOICE_STATUS[d.o.invoiceStatus] ?? INVOICE_STATUS.none;
    return {
      id: d.o.id, href: `/sales/orders/${d.o.id}`,
      raw: { ...Object.fromEntries(listDefs.map((f) => [`cf_${f.key}`, String(formatFieldValue(f, cfOf(d)[f.key], um) ?? "")])), tax: d.o.taxExempt ? "Sin IVA" : "Con IVA", number: d.o.number, createdAt: d.o.createdAt.toISOString(), customer: d.o.customer.name, owner: d.owner, activities: t, subtotal: n(d.o.subtotal), total: n(d.o.total),
        deliveryStatus: del.label, invoiceStatus: inv.label, commitmentAt: d.o.commitmentAt?.toISOString() ?? "", status: st?.label ?? d.o.status, margin: Math.round(d.margin), marginPct: Math.round(d.marginPct * 10) / 10 },
      cells: {
        ...Object.fromEntries(listDefs.map((f) => [`cf_${f.key}`, cfOf(d)[f.key] === undefined || cfOf(d)[f.key] === null || cfOf(d)[f.key] === "" ? <span className="text-stone-400">—</span> : formatFieldValue(f, cfOf(d)[f.key], um)])),
        tax: d.o.taxExempt ? <StatusPill label="Sin IVA" tone="amber" /> : <span className="text-stone-600">Con IVA</span>,
        number: <span className="font-semibold">{d.o.number}</span>,
        createdAt: when(d.o.createdAt),
        customer: d.o.customer.name,
        owner: <Avatar name={d.owner} />,
        activities: t ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">◷ {t}</span> : <span className="text-stone-400" aria-label="Sin actividades">◷</span>,
        subtotal: money(d.o.subtotal, d.o.currency),
        total: <span className="font-medium">{money(d.o.total, d.o.currency)}</span>,
        deliveryStatus: <StatusPill label={del.label} tone={del.tone} />,
        invoiceStatus: <StatusPill label={inv.label} tone={inv.tone} />,
        commitmentAt: d.o.commitmentAt ? d.o.commitmentAt.toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : <span className="text-stone-400">—</span>,
        status: <StatusPill label={st?.label ?? d.o.status} tone={st?.color} />,
        margin: <span className={d.margin < 0 ? "font-semibold text-rose-700" : ""}>{money(d.margin)}</span>,
        marginPct: <span className={d.marginPct < 15 ? "font-semibold text-rose-700" : ""}>{d.marginPct.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %</span>,
      },
    };
  };

  const columns: Column[] = [
    { key: "number", label: "Número", sortable: true, width: "110px" },
    { key: "createdAt", label: "Fecha", sortable: true, width: "150px" },
    { key: "customer", label: "Cliente", sortable: true },
    { key: "owner", label: "Vendedor", sortable: true, width: "170px" },
    { key: "activities", label: "Actividades", align: "center", optional: true, hidden: true, width: "112px" },
    { key: "subtotal", label: "Base", align: "right", optional: true, hidden: true, sum: true, width: "140px" },
    { key: "total", label: "Total", align: "right", sortable: true, sum: true, width: "140px" },
    { key: "deliveryStatus", label: "Entrega", sortable: true, optional: true, width: "130px" },
    { key: "invoiceStatus", label: "Facturación", sortable: true, optional: true, width: "150px" },
    { key: "commitmentAt", label: "Compromiso", sortable: true, optional: true, hidden: true, width: "120px" },
    { key: "status", label: "Estado", sortable: true, width: "130px" },
    { key: "tax", label: "IVA", optional: true, width: "100px" },
    ...listDefs.map((f): Column => ({ key: `cf_${f.key}`, label: f.label, optional: true, width: "150px" })),
    ...(ctx.restricted("deny:costs") ? [] : ([
      { key: "margin", label: "Margen", align: "right", optional: true, hidden: true, sum: true, width: "130px" },
      { key: "marginPct", label: "Margen (%)", align: "right", optional: true, hidden: true, width: "104px" },
    ] as Column[])),
  ];

  let groups: Group[] | undefined;
  if (group) {
    const gk: Record<string, (d: (typeof data)[number]) => string> = {
      customer: (d) => d.o.customer.name, owner: (d) => d.owner || "Sin vendedor", status: (d) => stateOf.get(d.o.status)?.label ?? d.o.status,
      delivery: (d) => DELIVERY_STATUS[d.o.deliveryStatus]?.label ?? d.o.deliveryStatus, invoice: (d) => INVOICE_STATUS[d.o.invoiceStatus]?.label ?? d.o.invoiceStatus,
      month: (d) => monthKey(d.o.createdAt),
    };
    for (const d of defs) gk[`cf_${d.key}`] = (x) => String(formatFieldValue(d, cfOf(x)[d.key], um));
    gk.taxExempt = (x) => (x.o.taxExempt ? "Sin IVA" : "Con IVA");
    gk.deliveryStatus = gk.delivery; gk.invoiceStatus = gk.invoice;
    // Varios niveles: "Confirmado › ATEMPO…"
    const f = (x: (typeof data)[number]) => L.groups.map((g) => (gk[g] ?? gk.status)(x)).join("  ›  ");
    const map = new Map<string, typeof data>();
    for (const d of data) map.set(f(d), [...(map.get(f(d)) ?? []), d]);
    groups = [...map.entries()].map(([label, ds]) => ({ key: label, label, rows: ds.map(toRow) }));
  }

  // Vista gráfico: total vendido por mes (últimos 12 meses, con los filtros aplicados)
  const months: string[] = [];
  let byMonth: number[] = [];
  if (view === "graph") {
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0); start.setMonth(start.getMonth() - 11);
    const rows = await ctx.db.salesOrder.findMany({ where: { AND: [where, { createdAt: { gte: start } }, { status: { not: "canceled" } }] }, select: { createdAt: true, total: true } });
    for (let i = 0; i < 12; i++) { const d = new Date(start); d.setMonth(start.getMonth() + i); months.push(monthShort(d)); }
    const sums = new Map<string, number>();
    for (const r of rows) sums.set(monthShort(r.createdAt), (sums.get(monthShort(r.createdAt)) ?? 0) + n(r.total));
    byMonth = months.map((m) => sums.get(m) ?? 0);
  }

  return (
    <>
      <ControlPanel
        entityType="sales_order" favorites={favorites} fields={fields}
        searchFields={[{ key: "number", label: "Número" }, { key: "customer", label: "Cliente" }, { key: "owner", label: "Vendedor" }, { key: "product", label: "Producto" },
          ...defs.filter((d) => ["text", "select"].includes(d.type)).map((d) => ({ key: `cf_${d.key}`, label: d.label }))]}
        dateFields={[{ key: "createdAt", label: "Fecha" }, { key: "commitmentAt", label: "Fecha compromiso" }]}
        title="Pedidos" newHref={ctx.can("sales.quotes.write") ? "/sales/orders/new" : undefined}
        filters={[
          { group: "propias", options: [{ key: "mine", label: "Mis pedidos" }, { key: "deliver", label: "Por entregar" }, { key: "invoice", label: "Por facturar" }] },
          { group: "estado", options: states.map((s) => ({ key: `status:${s.key}`, label: s.label })) },
          { group: "iva", options: [{ key: "taxed", label: "Con IVA" }, { key: "exempt", label: "Sin IVA" }] },
          ...filterDefs.map((f) => ({
            group: f.label,
            options: f.type === "boolean"
              ? [{ key: `cf:${f.key}=true`, label: `${f.label}: sí` }, { key: `cf:${f.key}=false`, label: `${f.label}: no` }]
              : fieldOptions(f).map((o) => ({ key: `cf:${f.key}=${o.value}`, label: o.label })),
          })),
        ]}
        groupBys={[{ key: "customer", label: "Cliente" }, { key: "owner", label: "Vendedor" }, { key: "status", label: "Estado" }, { key: "delivery", label: "Entrega" }, { key: "invoice", label: "Facturación" }, { key: "month", label: "Mes" }]}
        views={[{ key: "list", label: "Lista", icon: "list" }, { key: "graph", label: "Gráfico", icon: "graph" }]}
        pager={view === "list" && !group ? { from: total ? (page - 1) * PAGE + 1 : 0, to: Math.min(page * PAGE, total), total } : undefined}
      />

      {view === "graph" ? (
        <section className="rounded-2xl border border-[var(--ork-rule)] bg-white p-5">
          <h2 className="mb-3 font-display text-2xl uppercase tracking-tight text-[var(--ork-purple)]">Total vendido por mes</h2>
          <BarChart labels={months} series={[{ name: "Total", color: "#6f35b5", values: byMonth }]} format="money" />
        </section>
      ) : (
        <>
          {group && total > GROUP_LIMIT && <p className="mb-2 text-xs text-stone-600">Agrupando los {GROUP_LIMIT.toLocaleString("es-CO")} pedidos más recientes de {total.toLocaleString("es-CO")}. Usa filtros para acotar.</p>}
          <DataTable canExport={!ctx.restricted("deny:export")} storageKey="sales-orders" columns={columns} rows={group ? [] : data.map(toRow)} groups={groups} moneyColumns={["total", "margin", "subtotal"]} />
        </>
      )}
    </>
  );
}
