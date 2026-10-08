import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { getWorkflow } from "@/lib/core/workflow";
import { orgUsers } from "@/lib/core/members";
import { ControlPanel } from "@/components/list/control-panel";
import { DataTable, type Column, type Group, type Row } from "@/components/list/data-table";
import { Avatar, StatusPill } from "@/components/list/status-pill";
import { BarChart } from "@/components/charts";
import { money } from "@/lib/ui/format";

export const metadata = { title: "Cotizaciones" };
const PAGE = 80;
const DAY = 86400000;
const n = (v: unknown) => Number(v ?? 0);
const when = (d: Date) => d.toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const monthKey = (d: Date) => d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

export default async function Quotes({ searchParams }: PageProps<"/sales/quotes">) {
  const ctx = await requireModule("sales", "sales.quotes.read");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const active = str("f").split(",").filter(Boolean);
  const view = str("view") || "list";

  const [wf, users] = await Promise.all([getWorkflow(ctx.db, "quote"), orgUsers(ctx)]);
  const states = wf?.states ?? [];
  const stateOf = new Map(states.map((s) => [s.key, s]));
  const um = new Map(users.map((u) => [u.id, u.name]));

  // ── Filtros (todos combinables; los de estado se suman con O) ──
  const statusKeys = active.filter((k) => k.startsWith("status:")).map((k) => k.slice(7));
  const where: Record<string, unknown> = {};
  if (statusKeys.length) where.status = { in: statusKeys };
  if (active.includes("mine")) where.ownerId = ctx.user.id;
  if (active.includes("open")) where.status = { in: statusKeys.length ? statusKeys : ["draft", "sent", "pending_approval", "approved"] };
  if (active.includes("month")) { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); where.createdAt = { gte: d }; }
  if (active.includes("30d")) where.createdAt = { gte: new Date(Date.now() - 30 * DAY) };
  const q = str("q");
  if (q) where.OR = [{ number: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }];

  const quotes = await ctx.db.quote.findMany({ where, include: { customer: true, lines: true }, orderBy: { createdAt: "desc" }, take: 2000 });
  const [products, tasks] = await Promise.all([
    ctx.db.product.findMany({ where: { id: { in: [...new Set(quotes.flatMap((x) => x.lines.map((l) => l.productId ?? "")))] } }, select: { id: true, cost: true } }),
    ctx.db.task.groupBy({ by: ["sourceId"], where: { sourceType: "quote", status: "OPEN", sourceId: { in: quotes.map((x) => x.id) } }, _count: true }),
  ]);
  const cost = new Map(products.map((p) => [p.id, n(p.cost)]));
  const taskCount = new Map(tasks.map((t) => [t.sourceId, t._count]));

  const data = quotes.map((x) => {
    const margin = n(x.subtotal) - x.lines.reduce((s, l) => s + n(l.quantity) * (cost.get(l.productId ?? "") ?? 0), 0);
    return { x, margin, marginPct: n(x.subtotal) ? (margin / n(x.subtotal)) * 100 : 0, owner: um.get(x.ownerId ?? "") ?? "" };
  });

  // ── Orden ──
  const sort = str("sort") || "createdAt", dir = str("dir") === "asc" ? 1 : -1;
  const keyOf: Record<string, (d: (typeof data)[number]) => string | number> = {
    number: (d) => d.x.number, createdAt: (d) => d.x.createdAt.getTime(), customer: (d) => d.x.customer.name, owner: (d) => d.owner,
    total: (d) => n(d.x.total), status: (d) => stateOf.get(d.x.status)?.position ?? 0, margin: (d) => d.margin, marginPct: (d) => d.marginPct,
  };
  const kf = keyOf[sort] ?? keyOf.createdAt;
  data.sort((a, b) => (kf(a) > kf(b) ? dir : kf(a) < kf(b) ? -dir : 0));

  const page = Math.max(1, Number(str("page")) || 1);
  const group = str("group");
  const paged = group ? data : data.slice((page - 1) * PAGE, page * PAGE);

  const toRow = (d: (typeof data)[number]): Row => {
    const st = stateOf.get(d.x.status);
    const t = taskCount.get(d.x.id) ?? 0;
    return {
      id: d.x.id, href: `/sales/quotes/${d.x.id}`,
      raw: { number: d.x.number, createdAt: d.x.createdAt.toISOString(), customer: d.x.customer.name, owner: d.owner, activities: t, total: n(d.x.total), status: st?.label ?? d.x.status, margin: Math.round(d.margin), marginPct: Math.round(d.marginPct * 10) / 10, subtotal: n(d.x.subtotal) },
      cells: {
        number: <span className="font-semibold">{d.x.number}</span>,
        createdAt: when(d.x.createdAt),
        customer: d.x.customer.name,
        owner: <Avatar name={d.owner} />,
        activities: t ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">◷ {t}</span> : <span className="text-stone-400" aria-label="Sin actividades">◷</span>,
        subtotal: money(d.x.subtotal),
        total: <span className="font-medium">{money(d.x.total)}</span>,
        status: <StatusPill label={st?.label ?? d.x.status} tone={st?.color} />,
        margin: <span className={d.margin < 0 ? "font-semibold text-rose-700" : ""}>{money(d.margin)}</span>,
        marginPct: <span className={d.marginPct < 15 ? "font-semibold text-rose-700" : ""}>{d.marginPct.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %</span>,
      },
    };
  };

  const columns: Column[] = [
    { key: "number", label: "Número", sortable: true, width: "110px" },
    { key: "createdAt", label: "Fecha de creación", sortable: true, width: "150px" },
    { key: "customer", label: "Cliente", sortable: true },
    { key: "owner", label: "Vendedor", sortable: true, width: "150px" },
    { key: "activities", label: "Actividades", align: "center", optional: true, width: "112px" },
    { key: "subtotal", label: "Base", align: "right", optional: true, hidden: true, sum: true, width: "140px" },
    { key: "total", label: "Total", align: "right", sortable: true, sum: true, width: "140px" },
    { key: "status", label: "Estado", sortable: true, width: "180px" },
    { key: "margin", label: "Margen", align: "right", sortable: true, optional: true, sum: true, width: "130px" },
    { key: "marginPct", label: "Margen (%)", align: "right", sortable: true, optional: true, width: "104px" },
  ];

  let groups: Group[] | undefined;
  if (group) {
    const gk: Record<string, (d: (typeof data)[number]) => string> = {
      customer: (d) => d.x.customer.name, owner: (d) => d.owner || "Sin vendedor",
      status: (d) => stateOf.get(d.x.status)?.label ?? d.x.status, month: (d) => monthKey(d.x.createdAt),
    };
    const f = gk[group] ?? gk.status;
    const map = new Map<string, typeof data>();
    for (const d of data) map.set(f(d), [...(map.get(f(d)) ?? []), d]);
    groups = [...map.entries()].map(([label, ds]) => ({ key: label, label, rows: ds.map(toRow) }));
  }

  // Vista gráfico: total por mes
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }).replace(".", "")); }
  const byMonth = months.map((m) => data.filter((d) => d.x.createdAt.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }).replace(".", "") === m).reduce((s, d) => s + n(d.x.total), 0));

  return (
    <>
      <ControlPanel
        title="Cotizaciones" newHref={ctx.can("sales.quotes.write") ? "/sales/quotes/new" : undefined}
        filters={[
          { group: "propias", options: [{ key: "mine", label: "Mis cotizaciones" }, { key: "open", label: "Presupuestos abiertos" }] },
          { group: "estado", options: states.map((s) => ({ key: `status:${s.key}`, label: s.label })) },
          { group: "fecha", options: [{ key: "month", label: "Este mes" }, { key: "30d", label: "Últimos 30 días" }] },
        ]}
        groupBys={[{ key: "customer", label: "Cliente" }, { key: "owner", label: "Vendedor" }, { key: "status", label: "Estado" }, { key: "month", label: "Mes de creación" }]}
        views={[{ key: "list", label: "Lista", icon: "list" }, { key: "kanban", label: "Kanban", icon: "kanban" }, { key: "graph", label: "Gráfico", icon: "graph" }]}
        pager={view === "list" && !group ? { from: data.length ? (page - 1) * PAGE + 1 : 0, to: Math.min(page * PAGE, data.length), total: data.length } : undefined}
      />

      {view === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {states.map((s) => {
            const items = data.filter((d) => d.x.status === s.key);
            return (
              <div key={s.key} className="w-72 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-sm font-semibold">{s.label} <span className="font-normal text-stone-500">{items.length}</span></p>
                  <p className="text-xs font-medium text-stone-600">{money(items.reduce((a, d) => a + n(d.x.total), 0))}</p>
                </div>
                <div className="space-y-2">
                  {items.slice(0, 40).map((d) => (
                    <Link key={d.x.id} href={`/sales/quotes/${d.x.id}`} className="block rounded-xl border border-[var(--ork-rule)] bg-white p-3 hover:border-[var(--ork-violet)]">
                      <div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold">{d.x.customer.name}</p><span className="shrink-0 whitespace-nowrap text-xs text-stone-500">{d.x.number}</span></div>
                      <p className="mt-1 text-sm font-medium">{money(d.x.total)}</p>
                      <div className="mt-2 flex items-center justify-between text-xs text-stone-600"><Avatar name={d.owner} size={18} /><span>{d.x.createdAt.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span></div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "graph" ? (
        <section className="rounded-2xl border border-[var(--ork-rule)] bg-white p-5">
          <h2 className="mb-3 font-display text-2xl uppercase tracking-tight text-[var(--ork-purple)]">Total cotizado por mes</h2>
          <BarChart labels={months} series={[{ name: "Total", color: "#6f35b5", values: byMonth }]} format="money" />
        </section>
      ) : (
        <DataTable storageKey="quotes" columns={columns} rows={paged.map(toRow)} groups={groups} moneyColumns={["total", "margin", "subtotal"]} />
      )}
    </>
  );
}
