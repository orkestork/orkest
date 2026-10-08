import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { ControlPanel } from "@/components/list/control-panel";
import { DataTable, type Column, type Group, type Row } from "@/components/list/data-table";
import { StatusPill } from "@/components/list/status-pill";
import { ProductThumb } from "@/components/product-thumb";
import { money } from "@/lib/ui/format";

export const metadata = { title: "Productos" };
const n = (v: unknown) => Number(v ?? 0);
const KIND: Record<string, { label: string; tone: string }> = { GOODS: { label: "Almacenable", tone: "blue" }, SERVICE: { label: "Servicio", tone: "violet" }, COMBO: { label: "Kit", tone: "amber" } };

export default async function Products({ searchParams }: PageProps<"/products">) {
  const ctx = await requireModule("products", "products.read");
  const hideCost = ctx.restricted("deny:costs");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const f = str("f").split(",").filter(Boolean);
  const view = str("view") || "kanban";
  const q = str("q");

  const where: Record<string, unknown> = { active: !f.includes("archived") };
  if (f.includes("sold")) where.canBeSold = true;
  if (f.includes("purchased")) where.canBePurchased = true;
  const kinds = f.filter((k) => k.startsWith("kind:")).map((k) => k.slice(5));
  if (kinds.length) where.kind = { in: kinds };
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }];

  let products = await ctx.db.product.findMany({ where, orderBy: { name: "asc" }, take: 1000 });
  if (f.includes("low")) products = products.filter((p) => n(p.minStock) > 0 && n(p.stock) < n(p.minStock));
  const sort = str("sort"), dir = str("dir") === "asc" ? 1 : -1;
  if (sort) {
    const key: Record<string, (p: (typeof products)[number]) => string | number> = { sku: (p) => p.sku, name: (p) => p.name, category: (p) => p.category ?? "", price: (p) => n(p.price), cost: (p) => n(p.cost), stock: (p) => n(p.stock), margin: (p) => (n(p.price) ? (n(p.price) - n(p.cost)) / n(p.price) : -1) };
    const kf = (hideCost && ["cost", "margin"].includes(sort) ? undefined : key[sort]) ?? key.name;
    products.sort((a, b) => (kf(a) > kf(b) ? dir : kf(a) < kf(b) ? -dir : 0));
  }

  const toRow = (p: (typeof products)[number]): Row => {
    const marginPct = !hideCost && p.canBeSold && n(p.price) ? ((n(p.price) - n(p.cost)) / n(p.price)) * 100 : null;
    const low = n(p.minStock) > 0 && n(p.stock) < n(p.minStock);
    return {
      id: p.id, href: `/products/${p.id}`,
      raw: { sku: p.sku, name: p.name, kind: KIND[p.kind]?.label ?? p.kind, category: p.category ?? "", price: n(p.price), cost: hideCost ? "" : n(p.cost), margin: hideCost ? "" : marginPct ?? "", stock: n(p.stock), unit: p.unit },
      cells: {
        sku: <span className="font-mono text-xs">{p.sku}</span>,
        name: <span className="font-medium">{p.name}</span>,
        kind: <StatusPill label={KIND[p.kind]?.label ?? p.kind} tone={KIND[p.kind]?.tone} />,
        category: p.category ?? "—",
        price: p.canBeSold ? money(p.price) : <span className="text-stone-400">No se vende</span>,
        cost: hideCost ? "" : money(p.cost),
        margin: marginPct === null ? <span className="text-stone-400">—</span> : <span className={marginPct < 15 ? "font-semibold text-rose-700" : ""}>{marginPct.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %</span>,
        stock: p.kind === "GOODS" ? <span className={low ? "font-semibold text-rose-700" : ""}>{n(p.stock).toLocaleString("es-CO")} {p.unit}</span> : <span className="text-stone-400">—</span>,
      },
    };
  };
  const columns: Column[] = [
    { key: "sku", label: "Referencia", sortable: true, width: "140px" },
    { key: "name", label: "Producto", sortable: true },
    { key: "kind", label: "Tipo", width: "130px" },
    { key: "category", label: "Categoría", sortable: true, width: "150px" },
    { key: "price", label: "Precio de venta", align: "right", sortable: true, width: "150px" },
    ...(hideCost ? [] : [
      { key: "cost", label: "Costo", align: "right" as const, sortable: true, optional: true, width: "140px" },
      { key: "margin", label: "Margen", align: "right" as const, sortable: true, optional: true, width: "100px" },
    ]),
    { key: "stock", label: "A mano", align: "right", sortable: true, width: "130px" },
  ];
  const group = str("group");
  let groups: Group[] | undefined;
  if (group) {
    const gk1 = (g: string, p: (typeof products)[number]) => (g === "kind" ? KIND[p.kind]?.label ?? p.kind : p.category ?? "Sin categoría");
    const gk = (p: (typeof products)[number]) => group.split(",").map((g) => gk1(g, p)).join("  ›  ");
    const map = new Map<string, typeof products>();
    for (const p of products) map.set(gk(p), [...(map.get(gk(p)) ?? []), p]);
    groups = [...map.entries()].map(([label, ps]) => ({ key: label, label, rows: ps.map(toRow) }));
  }

  return (
    <>
      <ControlPanel title="Productos" newHref={ctx.can("products.write") ? "/products/new" : undefined}
        filters={[
          { group: "uso", options: [{ key: "sold", label: "Se puede vender" }, { key: "purchased", label: "Se puede comprar" }] },
          { group: "tipo", options: [{ key: "kind:GOODS", label: "Almacenables" }, { key: "kind:SERVICE", label: "Servicios" }, { key: "kind:COMBO", label: "Kits" }] },
          { group: "stock", options: [{ key: "low", label: "Bajo el mínimo" }, { key: "archived", label: "Archivados" }] },
        ]}
        groupBys={[{ key: "category", label: "Categoría" }, { key: "kind", label: "Tipo de producto" }]}
        views={[{ key: "kanban", label: "Kanban", icon: "kanban" }, { key: "list", label: "Lista", icon: "list" }]}
        pager={{ from: products.length ? 1 : 0, to: products.length, total: products.length }} />

      {view === "list" ? (
        <DataTable canExport={!ctx.restricted("deny:export")} storageKey="products" columns={columns} rows={products.map(toRow)} groups={groups} moneyColumns={["price", "cost"]} />
      ) : products.length === 0 ? (
        <p className="py-16 text-center text-stone-500">No hay productos con estos filtros.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {products.map((p) => {
            const low = n(p.minStock) > 0 && n(p.stock) < n(p.minStock);
            return (
              <Link key={p.id} href={`/products/${p.id}`} className="flex gap-3 rounded-xl border border-[var(--ork-rule)] bg-white p-3 transition hover:border-[var(--ork-violet)] hover:shadow-md">
                <ProductThumb name={p.name} category={p.category} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" title={p.name}>{p.name}</p>
                  <p className="font-mono text-xs text-stone-500">[{p.sku}]</p>
                  <p className="mt-1 text-sm">{p.canBeSold ? <>Precio: <b className="tabular-nums">{money(p.price)}</b></> : <span className="text-stone-500">{hideCost ? "Insumo" : <>Costo: {money(p.cost)}</>}</span>}</p>
                  {p.kind === "GOODS"
                    ? <p className={`text-xs ${low ? "font-semibold text-rose-700" : "text-stone-600"}`}>A mano: {n(p.stock).toLocaleString("es-CO")} {p.unit}{low ? ` · mínimo ${n(p.minStock).toLocaleString("es-CO")}` : ""}</p>
                    : <p className="text-xs text-stone-600">{KIND[p.kind]?.label}</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
