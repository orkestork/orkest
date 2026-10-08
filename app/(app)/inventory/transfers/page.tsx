import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { ControlPanel } from "@/components/list/control-panel";
import { DataTable, type Column, type Group, type Row } from "@/components/list/data-table";
import { StatusPill } from "@/components/list/status-pill";
import { OP_KIND, TRANSFER_STATUS } from "@/lib/ui/stock-labels";

export const metadata = { title: "Transferencias" };
const OP_ICON: Record<string, string> = { RECEIPT: "📥", INTERNAL: "⇄", DELIVERY: "🚚", MANUFACTURING: "🏭" };
const OPEN = ["ready", "waiting", "draft"];

export default async function Transfers({ searchParams }: PageProps<"/inventory/transfers">) {
  const ctx = await requireModule("inventory", "inventory.read");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const f = str("f").split(",").filter(Boolean);
  const wh = str("wh");
  const q = str("q");

  const [warehouses, ops, locations] = await Promise.all([
    ctx.db.warehouse.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    ctx.db.operationType.findMany({ where: { warehouse: { active: true } } }),
    ctx.db.location.findMany(),
  ]);
  const loc = new Map(locations.map((l) => [l.id, l]));
  const whById = new Map(warehouses.map((w) => [w.id, w]));
  const opById = new Map(ops.map((o) => [o.id, o]));

  // Resumen por almacén y tipo de operación (como el tablero de inventario de Odoo)
  const openTransfers = await ctx.db.transfer.findMany({ where: { status: { in: OPEN } }, select: { operationTypeId: true, status: true, scheduledAt: true } });
  const now = Date.now();
  const summary = (opId: string) => {
    const ts = openTransfers.filter((t) => t.operationTypeId === opId);
    return { ready: ts.filter((t) => t.status === "ready").length, waiting: ts.filter((t) => t.status === "waiting").length, late: ts.filter((t) => t.scheduledAt.getTime() < now - 86400000).length, total: ts.length };
  };

  // Lista filtrada
  const where: Record<string, unknown> = {};
  const statuses = f.filter((k) => k.startsWith("status:")).map((k) => k.slice(7));
  if (statuses.length) where.status = { in: statuses };
  if (f.includes("open")) where.status = { in: statuses.length ? statuses : OPEN };
  const kinds = f.filter((k) => k.startsWith("kind:")).map((k) => k.slice(5));
  const opFilter = str("op");
  if (opFilter) where.operationTypeId = opFilter;
  else if (kinds.length || wh) where.operationTypeId = { in: ops.filter((o) => (!kinds.length || kinds.includes(o.kind)) && (!wh || o.warehouseId === wh)).map((o) => o.id) };
  if (f.includes("late")) where.scheduledAt = { lt: new Date(now - 86400000) };
  if (q) where.OR = [{ number: { contains: q, mode: "insensitive" } }, { origin: { contains: q, mode: "insensitive" } }, { partnerName: { contains: q, mode: "insensitive" } }];
  let transfers = await ctx.db.transfer.findMany({ where, include: { lines: true }, orderBy: { createdAt: "desc" }, take: 1000 });
  if (wh && !opFilter) transfers = transfers.filter((t) => loc.get(t.srcLocationId)?.warehouseId === wh || loc.get(t.destLocationId)?.warehouseId === wh || opById.get(t.operationTypeId)?.warehouseId === wh);

  const place = (id: string) => {
    const l = loc.get(id);
    if (!l) return "—";
    if (l.warehouseId) return <span className="inline-flex items-center gap-1.5"><span className="rounded bg-[var(--ork-purple)] px-1.5 py-0.5 font-mono text-[10px] text-white">{whById.get(l.warehouseId)?.code ?? "—"}</span><span className="truncate">{whById.get(l.warehouseId)?.name}</span></span>;
    return <span className="text-stone-500">{l.name.replace("Socios / ", "").replace("Virtual / ", "")}</span>;
  };
  const toRow = (t: (typeof transfers)[number]): Row => {
    const op = opById.get(t.operationTypeId);
    const late = OPEN.includes(t.status) && t.scheduledAt.getTime() < now - 86400000;
    return {
      id: t.id, href: `/inventory/transfers/${t.id}`,
      raw: { number: t.number, kind: OP_KIND[op?.kind ?? ""] ?? "", from: loc.get(t.srcLocationId)?.name ?? "", to: loc.get(t.destLocationId)?.name ?? "", origin: t.origin ?? "", partner: t.partnerName ?? "", date: t.scheduledAt.toISOString(), status: TRANSFER_STATUS[t.status]?.label ?? t.status, lines: t.lines.length },
      cells: {
        number: <span className="font-mono text-xs font-semibold">{t.number}</span>,
        kind: <span className="inline-flex items-center gap-1.5">{OP_ICON[op?.kind ?? ""]} {OP_KIND[op?.kind ?? ""]}</span>,
        from: place(t.srcLocationId), to: place(t.destLocationId),
        origin: <span className="truncate">{t.origin ?? "—"}{t.partnerName ? <span className="block text-xs text-stone-500">{t.partnerName}</span> : null}</span>,
        date: <span className={late ? "font-semibold text-rose-700" : ""}>{t.scheduledAt.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span>,
        lines: t.lines.length,
        status: <StatusPill label={TRANSFER_STATUS[t.status]?.label ?? t.status} tone={TRANSFER_STATUS[t.status]?.tone} />,
      },
    };
  };
  const columns: Column[] = [
    { key: "number", label: "Referencia", width: "150px" },
    { key: "kind", label: "Operación", width: "150px" },
    { key: "from", label: "Desde" },
    { key: "to", label: "Hacia" },
    { key: "origin", label: "Documento origen", optional: true },
    { key: "date", label: "Programada", width: "110px" },
    { key: "lines", label: "Productos", align: "right", optional: true, width: "95px" },
    { key: "status", label: "Estado", width: "120px" },
  ];
  const group = str("group");
  let groups: Group[] | undefined;
  if (group) {
    const gk = (t: (typeof transfers)[number]) => {
      const op = opById.get(t.operationTypeId);
      if (group === "warehouse") return whById.get(op?.warehouseId ?? "")?.name ?? "Otro";
      if (group === "kind") return OP_KIND[op?.kind ?? ""] ?? "Otro";
      return TRANSFER_STATUS[t.status]?.label ?? t.status;
    };
    const map = new Map<string, typeof transfers>();
    for (const t of transfers) map.set(gk(t), [...(map.get(gk(t)) ?? []), t]);
    groups = [...map.entries()].map(([label, ts]) => ({ key: label, label, rows: ts.map(toRow) }));
  }
  const whHref = (id: string) => { const p = new URLSearchParams(); if (id) p.set("wh", id); if (str("f")) p.set("f", str("f")); return `/inventory/transfers?${p}`; };

  return (
    <>
      {/* Resumen de operaciones por almacén */}
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {warehouses.map((w) => (
          <section key={w.id} className={`rounded-2xl border bg-white p-4 ${wh === w.id ? "border-[var(--ork-violet)] shadow-[0_6px_20px_rgba(111,53,181,.15)]" : "border-[var(--ork-rule)]"}`}>
            <div className="mb-3 flex items-center justify-between">
              <Link href={whHref(w.id)} className="flex items-center gap-2 font-semibold hover:text-[var(--ork-violet)]">
                <span className="rounded-md bg-[var(--ork-purple)] px-2 py-0.5 font-mono text-[11px] text-white">{w.code}</span>{w.name}
              </Link>
              {ctx.can("inventory.write") && <Link href="/inventory/transfers/new" className="text-xs text-[var(--ork-violet)] hover:underline">+ Traslado</Link>}
            </div>
            <ul className="space-y-1.5">
              {ops.filter((o) => o.warehouseId === w.id).sort((a, b) => ["RECEIPT", "INTERNAL", "DELIVERY", "MANUFACTURING"].indexOf(a.kind) - ["RECEIPT", "INTERNAL", "DELIVERY", "MANUFACTURING"].indexOf(b.kind)).map((o) => {
                const s = summary(o.id);
                return (
                  <li key={o.id}>
                    <Link href={`/inventory/transfers?op=${o.id}&f=open&wh=${w.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50">
                      <span className="flex items-center gap-2"><span aria-hidden="true">{OP_ICON[o.kind]}</span>{o.name}</span>
                      <span className="flex items-center gap-1.5 text-xs">
                        {s.total === 0 && <span className="text-stone-400">Al día</span>}
                        {s.ready > 0 && <span className="rounded-full bg-[var(--ork-purple)] px-2 py-0.5 font-semibold text-white">{s.ready} por procesar</span>}
                        {s.waiting > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">{s.waiting} en espera</span>}
                        {s.late > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">{s.late} atrasada(s)</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <ControlPanel title="Transferencias" newHref={ctx.can("inventory.write") ? "/inventory/transfers/new" : undefined}
        filters={[
          { group: "estado", options: [{ key: "open", label: "Por hacer" }, { key: "late", label: "Atrasadas" }, ...Object.entries(TRANSFER_STATUS).filter(([k]) => k !== "draft").map(([k, v]) => ({ key: `status:${k}`, label: v.label }))] },
          { group: "tipo", options: Object.entries(OP_KIND).map(([k, v]) => ({ key: `kind:${k}`, label: v })) },
        ]}
        groupBys={[{ key: "warehouse", label: "Almacén" }, { key: "kind", label: "Tipo de operación" }, { key: "status", label: "Estado" }]}
        views={[{ key: "list", label: "Lista", icon: "list" }]}
        pager={{ from: transfers.length ? 1 : 0, to: transfers.length, total: transfers.length }} />

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Almacén</span>
        <Link href={whHref("")} className={`rounded-full border px-3 py-1 ${!wh ? "border-[var(--ork-purple)] bg-[var(--ork-purple)] text-white" : "border-stone-300 bg-white hover:border-[var(--ork-violet)]"}`}>Todos</Link>
        {warehouses.map((w) => (
          <Link key={w.id} href={whHref(w.id)} className={`rounded-full border px-3 py-1 ${wh === w.id ? "border-[var(--ork-purple)] bg-[var(--ork-purple)] text-white" : "border-stone-300 bg-white hover:border-[var(--ork-violet)]"}`}>{w.code} · {w.name}</Link>
        ))}
        {opFilter && <Link href={whHref(wh)} className="ml-2 text-xs text-[var(--ork-violet)] underline">Quitar filtro de operación ({opById.get(opFilter)?.name})</Link>}
      </div>

      <DataTable storageKey="transfers" columns={columns} rows={transfers.map(toRow)} groups={groups} />
    </>
  );
}
