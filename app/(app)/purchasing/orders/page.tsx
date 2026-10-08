import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { getWorkflow } from "@/lib/core/workflow";
import { orgUsers } from "@/lib/core/members";
import { ControlPanel } from "@/components/list/control-panel";
import { DataTable, type Column, type Group, type Row } from "@/components/list/data-table";
import { Avatar, StatusPill } from "@/components/list/status-pill";
import { money } from "@/lib/ui/format";
import { relativeDay } from "@/lib/ui/relative-date";
import { RECEIPT_STATUS } from "@/lib/ui/purchase-labels";

export const metadata = { title: "Órdenes de compra" };
const PAGE = 80;
const n = (v: unknown) => Number(v ?? 0);

type Po = Awaited<ReturnType<typeof load>>[number];
const load = (ctx: Awaited<ReturnType<typeof requireModule>>) => ctx.db.purchaseOrder.findMany({ include: { supplier: true }, orderBy: { createdAt: "desc" }, take: 3000 });

/** Segmentos del tablero de compras (como el encabezado de Odoo). */
const now = () => new Date();
const SEGMENTS: { key: string; label: string; tone: string; test: (p: Po) => boolean }[] = [
  { key: "new", label: "Nuevo", tone: "bg-cyan-100 text-cyan-950", test: (p) => p.status === "draft" },
  { key: "sent", label: "Solicitud de cotización enviada", tone: "bg-stone-100 text-stone-900", test: (p) => p.status === "sent" },
  { key: "rfq_late", label: "Solicitud de cotización atrasada", tone: "bg-amber-100 text-amber-950", test: (p) => ["draft", "sent", "to_approve"].includes(p.status) && !!p.expectedAt && p.expectedAt < now() },
  { key: "to_receive", label: "Sin recibir", tone: "bg-cyan-100 text-cyan-950", test: (p) => p.status === "purchase" && p.receiptStatus !== "full" },
  { key: "late_receipt", label: "Recepción atrasada", tone: "bg-rose-100 text-rose-950", test: (p) => p.status === "purchase" && p.receiptStatus !== "full" && !!p.expectedAt && p.expectedAt < now() },
];

export default async function PurchaseOrders({ searchParams }: PageProps<"/purchasing/orders">) {
  const ctx = await requireModule("purchasing", "purchasing.read");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const f = str("f").split(",").filter(Boolean);
  const seg = str("seg"), mine = str("mine") === "1";

  const [all, wf, users, receipts] = await Promise.all([
    load(ctx), getWorkflow(ctx.db, "purchase_order"), orgUsers(ctx),
    ctx.db.transfer.findMany({ where: { sourceType: "purchase_order", status: "done" }, select: { sourceId: true, doneAt: true } }),
  ]);
  const states = wf?.states ?? [];
  const stateOf = new Map(states.map((s) => [s.key, s]));
  const um = new Map(users.map((u) => [u.id, u.name]));

  // KPIs: % entregas a tiempo (última recepción ≤ fecha prevista) y días promedio para ordenar
  const received = all.filter((p) => p.receiptStatus === "full" && p.expectedAt && receipts.some((r) => r.sourceId === p.id));
  const lastReceipt = (id: string) => receipts.filter((r) => r.sourceId === id).reduce<Date | null>((m, r) => (!m || (r.doneAt && r.doneAt > m) ? r.doneAt : m), null);
  const onTime = (ps: Po[]) => { const xs = ps.filter((p) => p.receiptStatus === "full" && p.expectedAt && lastReceipt(p.id)); return xs.length ? Math.round((xs.filter((p) => lastReceipt(p.id)! <= new Date(p.expectedAt!.getTime() + 86400000)).length / xs.length) * 100) : null; };
  const daysToOrder = (ps: Po[]) => { const xs = ps.filter((p) => p.confirmedAt); return xs.length ? xs.reduce((s, p) => s + (p.confirmedAt!.getTime() - p.createdAt.getTime()) / 86400000, 0) / xs.length : null; };
  const minePos = all.filter((p) => p.ownerId === ctx.user.id);

  // Filtros
  let rows = all;
  const segDef = SEGMENTS.find((s) => s.key === seg);
  if (segDef) rows = rows.filter(segDef.test);
  if (mine || f.includes("mine")) rows = rows.filter((p) => p.ownerId === ctx.user.id);
  const st = f.filter((k) => k.startsWith("status:")).map((k) => k.slice(7));
  if (st.length) rows = rows.filter((p) => st.includes(p.status));
  if (f.includes("rfq")) rows = rows.filter((p) => ["draft", "sent", "to_approve"].includes(p.status));
  if (f.includes("po")) rows = rows.filter((p) => ["purchase", "received"].includes(p.status));
  if (f.includes("to_bill")) rows = rows.filter((p) => ["purchase", "received"].includes(p.status) && p.billStatus !== "billed" && p.receiptStatus !== "none");
  const q = str("q").toLowerCase();
  if (q) rows = rows.filter((p) => `${p.number} ${p.supplier.name} ${p.origin ?? ""}`.toLowerCase().includes(q));
  const sort = str("sort"), dir = str("dir") === "asc" ? 1 : -1;
  if (sort) {
    const key: Record<string, (p: Po) => string | number> = { number: (p) => p.number, supplier: (p) => p.supplier.name, owner: (p) => um.get(p.ownerId ?? "") ?? "", expectedAt: (p) => p.expectedAt?.getTime() ?? 0, total: (p) => n(p.total), status: (p) => stateOf.get(p.status)?.position ?? 0 };
    const kf = key[sort] ?? key.number;
    rows = [...rows].sort((a, b) => (kf(a) > kf(b) ? dir : kf(a) < kf(b) ? -dir : 0));
  }
  const page = Math.max(1, Number(str("page")) || 1);
  const group = str("group");

  const toRow = (p: Po): Row => {
    const s = stateOf.get(p.status);
    const open = ["draft", "sent", "to_approve", "purchase"].includes(p.status) && p.receiptStatus !== "full";
    const rel = relativeDay(p.expectedAt);
    const highlight = ["draft", "sent", "to_approve"].includes(p.status);
    return {
      id: p.id, href: `/purchasing/orders/${p.id}`,
      raw: { number: p.number, supplier: p.supplier.name, owner: um.get(p.ownerId ?? "") ?? "", expectedAt: p.expectedAt?.toISOString() ?? "", origin: p.origin ?? "", total: n(p.total), status: s?.label ?? p.status, receipt: RECEIPT_STATUS[p.receiptStatus]?.label ?? "" },
      cells: {
        number: <span className={`font-semibold ${highlight ? "text-[var(--ork-violet)]" : ""}`}>{p.number}</span>,
        supplier: <span className={highlight ? "text-[var(--ork-violet)]" : ""}>{p.supplier.name}</span>,
        owner: <Avatar name={um.get(p.ownerId ?? "") ?? "Sin comprador"} />,
        expectedAt: open && rel.label ? <span className={rel.past ? "font-semibold text-rose-700" : rel.today ? "font-semibold text-amber-800" : "text-stone-700"}>{rel.label}</span> : <span className="text-stone-400">{p.expectedAt?.toLocaleDateString("es-CO", { day: "numeric", month: "short" }) ?? ""}</span>,
        origin: p.origin ?? "",
        total: <span className={highlight ? "font-medium text-[var(--ork-violet)]" : "font-medium"}>{money(p.total)}</span>,
        receipt: p.status === "purchase" || p.status === "received" ? <StatusPill label={RECEIPT_STATUS[p.receiptStatus].label} tone={RECEIPT_STATUS[p.receiptStatus].tone} /> : <span className="text-stone-400">—</span>,
        status: <StatusPill label={s?.label ?? p.status} tone={s?.color} />,
      },
    };
  };
  const columns: Column[] = [
    { key: "number", label: "Referencia", sortable: true, width: "120px" },
    { key: "supplier", label: "Proveedor", sortable: true },
    { key: "owner", label: "Comprador", sortable: true, width: "170px" },
    { key: "expectedAt", label: "Llegada prevista", sortable: true, width: "140px" },
    { key: "origin", label: "Documento origen", optional: true, hidden: true, width: "150px" },
    { key: "total", label: "Total", align: "right", sortable: true, sum: true, width: "150px" },
    { key: "receipt", label: "Recepción", optional: true, width: "140px" },
    { key: "status", label: "Estado", sortable: true, width: "200px" },
  ];
  let groups: Group[] | undefined;
  if (group) {
    const gk1 = (g: string, p: Po) => (g === "supplier" ? p.supplier.name : g === "owner" ? um.get(p.ownerId ?? "") ?? "Sin comprador" : stateOf.get(p.status)?.label ?? p.status);
    const gk = (p: Po) => group.split(",").map((g) => gk1(g, p)).join("  ›  ");
    const m = new Map<string, Po[]>();
    for (const p of rows) m.set(gk(p), [...(m.get(gk(p)) ?? []), p]);
    groups = [...m.entries()].map(([label, ps]) => ({ key: label, label, rows: ps.map(toRow) }));
  }
  const segHref = (key: string, mineRow: boolean) => {
    const active = seg === key && mine === mineRow;
    return active ? "/purchasing/orders" : `/purchasing/orders?seg=${key}${mineRow ? "&mine=1" : ""}`;
  };
  const kpiOnTime = onTime(all), kpiOnTimeMine = onTime(minePos);
  const kpiDays = daysToOrder(all), kpiDaysMine = daysToOrder(minePos);

  return (
    <>
      <ControlPanel title="Solicitudes de cotización" newHref={ctx.can("purchasing.write") ? "/purchasing/orders/new" : undefined}
        filters={[
          { group: "propias", options: [{ key: "mine", label: "Mis órdenes" }, { key: "rfq", label: "Solicitudes de cotización" }, { key: "po", label: "Órdenes de compra" }, { key: "to_bill", label: "Por facturar" }] },
          { group: "estado", options: states.map((s) => ({ key: `status:${s.key}`, label: s.label })) },
        ]}
        groupBys={[{ key: "supplier", label: "Proveedor" }, { key: "owner", label: "Comprador" }, { key: "status", label: "Estado" }]}
        views={[{ key: "list", label: "Lista", icon: "list" }]}
        pager={!group ? { from: rows.length ? (page - 1) * PAGE + 1 : 0, to: Math.min(page * PAGE, rows.length), total: rows.length } : undefined} />

      {/* Tablero de compras */}
      <section className="mb-5 overflow-x-auto rounded-2xl border border-[var(--ork-rule)] bg-white p-4">
        <div className="grid min-w-[900px] grid-cols-[56px_repeat(5,minmax(0,1fr))_24px_repeat(2,minmax(0,0.9fr))] gap-2">
          <span className="self-center text-sm font-medium text-stone-700">Todos</span>
          {SEGMENTS.map((s) => {
            const c = all.filter(s.test).length;
            const active = seg === s.key && !mine;
            return (
              <Link key={s.key} href={segHref(s.key, false)} aria-pressed={active}
                className={`flex min-h-[84px] flex-col items-center justify-center rounded-xl px-2 py-3 text-center transition hover:brightness-95 ${c ? s.tone : "bg-stone-50 text-stone-500"} ${active ? "ring-2 ring-[var(--ork-purple)]" : ""}`}>
                <span className="text-2xl font-semibold tabular-nums">{c}</span>
                <span className="text-xs font-medium leading-tight">{s.label}</span>
              </Link>
            );
          })}
          <span />
          <div className="flex flex-col items-center justify-center rounded-xl bg-stone-50 px-2 py-3 text-center">
            <span className="text-2xl font-semibold tabular-nums">{kpiOnTime === null ? "—" : `${kpiOnTime} %`}</span><span className="text-xs text-stone-700">Entregas a tiempo</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl bg-stone-50 px-2 py-3 text-center">
            <span className="text-2xl font-semibold tabular-nums">{kpiDays === null ? "—" : kpiDays.toLocaleString("es-CO", { maximumFractionDigits: 1 })}</span><span className="text-xs text-stone-700">Días para ordenar</span>
          </div>

          <span className="self-center text-sm font-medium text-stone-700">Mis</span>
          {SEGMENTS.map((s) => {
            const c = minePos.filter(s.test).length;
            const active = seg === s.key && mine;
            return (
              <Link key={s.key} href={segHref(s.key, true)} aria-pressed={active}
                className={`grid place-items-center rounded-lg py-2 text-sm font-semibold tabular-nums transition hover:bg-stone-100 ${c ? "bg-stone-50 text-stone-900" : "bg-stone-50 text-stone-400"} ${active ? "ring-2 ring-[var(--ork-purple)]" : ""}`}>{c}</Link>
            );
          })}
          <span />
          <span className="grid place-items-center rounded-lg bg-stone-50 py-2 text-sm font-semibold tabular-nums">{kpiOnTimeMine === null ? "—" : `${kpiOnTimeMine} %`}</span>
          <span className="grid place-items-center rounded-lg bg-stone-50 py-2 text-sm font-semibold tabular-nums">{kpiDaysMine === null ? "—" : kpiDaysMine.toLocaleString("es-CO", { maximumFractionDigits: 1 })}</span>
        </div>
        {segDef && <p className="mt-3 text-xs text-stone-600">Mostrando: <b>{mine ? "mis " : ""}{segDef.label.toLowerCase()}</b> · <Link href="/purchasing/orders" className="text-[var(--ork-violet)] underline">ver todas</Link></p>}
      </section>

      <DataTable storageKey="purchase-orders" columns={columns} rows={(group ? rows : rows.slice((page - 1) * PAGE, page * PAGE)).map(toRow)} groups={groups} moneyColumns={["total"]} />
      <p className="mt-2 text-xs text-stone-500">Recibidas a tiempo: compara la última recepción con la llegada prevista ({received.length} órdenes evaluadas).</p>
    </>
  );
}
