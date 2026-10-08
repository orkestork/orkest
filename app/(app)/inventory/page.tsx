import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { warehouseLimit } from "@/lib/apps/stock";
import { Badge, btn } from "@/components/ui";
import { money, num } from "@/lib/ui/format";
import { StockPanel } from "./stock-panel";

export const metadata = { title: "Existencias" };

/** Existencias por almacén (matriz producto × bodega) + traslados rápidos. */
export default async function Inventory({ searchParams }: PageProps<"/inventory">) {
  const ctx = await requireModule("inventory", "inventory.read");
  const { q, move } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const [warehouses, allProducts, quants, pending, limit] = await Promise.all([
    ctx.db.warehouse.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    ctx.db.product.findMany({ where: { active: true, kind: "GOODS" }, orderBy: { name: "asc" } }),
    ctx.db.stockQuant.findMany({ include: { location: true } }),
    ctx.db.transfer.count({ where: { status: { in: ["ready", "waiting"] } } }),
    warehouseLimit(ctx),
  ]);
  const products = query ? allProducts.filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase())) : allProducts;
  const qty: Record<string, Record<string, number>> = {};
  for (const x of quants) {
    if (x.location.kind !== "INTERNAL" || !x.location.warehouseId) continue;
    (qty[x.productId] ??= {})[x.location.warehouseId] = (qty[x.productId]?.[x.location.warehouseId] ?? 0) + Number(x.quantity);
  }
  const value = allProducts.reduce((s, p) => s + Number(p.stock) * Number(p.cost), 0);
  const canWrite = ctx.can("inventory.write");

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl uppercase leading-none tracking-tight">Existencias</h1>
          <p className="mt-2 text-sm text-stone-600">Valor a costo {money(value, ctx.org.currency)} · {warehouses.length} de {limit} almacenes · <Link href="/inventory/transfers?status=ready" className="underline">{pending} transferencias pendientes</Link></p>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory/warehouses" className={btn.secondary}>Administrar almacenes</Link>
          {canWrite && <Link href="/inventory/transfers/new" className={btn.primary}>Transferencia de varios productos</Link>}
        </div>
      </div>
      <form className="mb-4"><input name="q" defaultValue={query} placeholder="Buscar producto o SKU…" className="w-full max-w-sm rounded-full border border-stone-300 bg-white px-4 py-2 text-sm" /></form>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-x-auto rounded-2xl border border-[var(--ork-rule)] bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-[13px] font-semibold text-stone-800">
                <th className="px-4 py-3">Producto</th>
                {warehouses.map((w) => <th key={w.id} className="px-3 py-3 text-right" title={w.name}>{w.code}</th>)}
                <th className="px-3 py-3 text-right">Total</th><th className="px-3 py-3 text-right">Mínimo</th><th className="px-3 py-3">Estado</th>{canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const low = Number(p.minStock) > 0 && Number(p.stock) < Number(p.minStock);
                return (
                  <tr key={p.id} className="border-b border-stone-100 hover:bg-[var(--ork-lavender)]/10">
                    <td className="px-4 py-2.5"><Link href={`/products/${p.id}`} className="font-medium hover:underline">{p.name}</Link><p className="font-mono text-xs text-stone-500">{p.sku}</p></td>
                    {warehouses.map((w) => { const v = qty[p.id]?.[w.id] ?? 0; return <td key={w.id} className={`px-3 py-2.5 text-right tabular-nums ${v ? "" : "text-stone-300"}`}>{num(v)}</td>; })}
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{num(p.stock)} <span className="text-xs font-normal text-stone-500">{p.unit}</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{num(p.minStock)}</td>
                    <td className="px-3 py-2.5">{low ? <Badge tone={Number(p.stock) <= 0 ? "rose" : "amber"}>{Number(p.stock) <= 0 ? "Agotado" : "Bajo mínimo"}</Badge> : <Badge tone="emerald">OK</Badge>}</td>
                    {canWrite && <td className="pr-3 text-right"><Link href={`/inventory?move=${p.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`} scroll={false} title="Trasladar entre almacenes" aria-label={`Trasladar ${p.name}`} className="inline-grid h-8 w-8 place-items-center rounded-full border border-stone-300 hover:border-[var(--ork-violet)] hover:text-[var(--ork-violet)]">⇄</Link></td>}
                  </tr>
                );
              })}
              {products.length === 0 && <tr><td colSpan={warehouses.length + 5} className="py-10 text-center text-stone-500">Sin productos.</td></tr>}
            </tbody>
          </table>
        </div>
        {canWrite && (
          <div className="xl:sticky xl:top-20 xl:self-start">
            <StockPanel key={typeof move === "string" ? move : "x"} products={allProducts.map((p) => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit }))}
              warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name, locationId: w.stockLocationId! }))}
              qty={qty} defaultProductId={typeof move === "string" ? move : undefined} limit={limit} canCreate={canWrite} />
          </div>
        )}
      </div>
    </>
  );
}
