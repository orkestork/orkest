import Link from "@/components/plink";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { RecordTopBar, type SmartButton } from "@/components/record/top-bar";
import { Chatter } from "@/components/record/chatter";
import { StatusPill } from "@/components/list/status-pill";
import { date, money, num } from "@/lib/ui/format";
import { RULE_ACTION } from "@/lib/ui/stock-labels";
import { ProductForm } from "../product-form";
import { toggleArchive } from "../actions";

const n = (v: unknown) => Number(v ?? 0);
const YEAR = 365 * 86400000;

export default async function ProductDetail({ params }: PageProps<"/products/[id]">) {
  const ctx = await requireModule("products", "products.read");
  const { id } = await params;
  const p = await ctx.db.product.findUnique({ where: { id } });
  if (!p) notFound();
  const since = new Date(Date.now() - YEAR);
  const [defs, cats, suppliers, order, soLines, poLines, boms, rules, quants, warehouses] = await Promise.all([
    getFieldDefs(ctx.db, "product"),
    ctx.db.product.findMany({ where: { category: { not: null } }, distinct: ["category"], select: { category: true } }),
    ctx.hasModule("purchasing") ? ctx.db.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    ctx.db.product.findMany({ where: { active: p.active }, select: { id: true }, orderBy: { name: "asc" } }),
    ctx.hasModule("sales") ? ctx.db.salesOrderLine.findMany({ where: { productId: id, order: { organizationId: ctx.orgId, createdAt: { gte: since }, status: { not: "canceled" } } }, include: { order: { include: { customer: true } } }, orderBy: { order: { createdAt: "desc" } } }) : [],
    ctx.hasModule("purchasing") ? ctx.db.purchaseOrderLine.findMany({ where: { productId: id, order: { organizationId: ctx.orgId, createdAt: { gte: since }, status: { in: ["purchase", "received"] } } }, include: { order: { include: { supplier: true } } }, orderBy: { order: { createdAt: "desc" } } }) : [],
    ctx.hasModule("manufacturing") ? ctx.db.bom.count({ where: { productId: id } }) : 0,
    ctx.hasModule("inventory") ? ctx.db.reorderRule.findMany({ where: { productId: id } }) : [],
    ctx.db.stockQuant.findMany({ where: { productId: id }, include: { location: true } }),
    ctx.db.warehouse.findMany({ orderBy: { position: "asc" } }),
  ]);
  const idx = order.findIndex((o) => o.id === id);
  const sold = soLines.reduce((s, l) => s + n(l.quantity), 0), bought = poLines.reduce((s, l) => s + n(l.quantity), 0);
  const smart: SmartButton[] = [];
  if (p.kind === "GOODS") smart.push({ label: "A mano", value: `${num(p.stock)} ${p.unit}`, href: `/inventory?q=${encodeURIComponent(p.sku)}`, icon: "📦" });
  if (ctx.hasModule("sales") && p.canBeSold) smart.push({ label: "Vendido (12 m)", value: `${num(sold)} ${p.unit}`, href: "/sales/orders", icon: "📈" });
  if (ctx.hasModule("purchasing") && p.canBePurchased) smart.push({ label: "Comprado (12 m)", value: `${num(bought)} ${p.unit}`, href: "/purchasing/orders", icon: "🛒" });
  if (boms) smart.push({ label: "Lista de materiales", value: boms, href: "/manufacturing/boms", icon: "🧩" });
  if (rules.length) smart.push({ label: "Reabastecimiento", value: `${rules.length} regla(s)`, href: "/inventory/replenishment", icon: "🔁" });
  const lname = new Map(quants.map((q) => [q.locationId, q.location.name]));

  const salesTab = soLines.length === 0 ? <p className="text-sm text-stone-500">Sin ventas en los últimos 12 meses.</p> : (
    <table className="w-full text-sm"><thead><tr className="text-left text-[13px] font-semibold"><th className="py-1.5">Pedido</th><th>Cliente</th><th>Fecha</th><th className="text-right">Cantidad</th><th className="text-right">Precio</th></tr></thead>
      <tbody>{soLines.slice(0, 12).map((l) => <tr key={l.id} className="border-t border-stone-100"><td className="py-1.5"><Link href={`/sales/orders/${l.order.id}`} className="text-[var(--ork-violet)] hover:underline">{l.order.number}</Link></td><td>{l.order.customer.name}</td><td>{date(l.order.createdAt)}</td><td className="text-right tabular-nums">{num(l.quantity)}</td><td className="text-right tabular-nums">{money(l.unitPrice)}</td></tr>)}</tbody></table>
  );
  const purchaseTab = poLines.length === 0 ? <p className="text-sm text-stone-500">Sin compras confirmadas en los últimos 12 meses.</p> : (
    <table className="w-full text-sm"><thead><tr className="text-left text-[13px] font-semibold"><th className="py-1.5">Orden</th><th>Proveedor</th><th>Fecha</th><th className="text-right">Cantidad</th><th className="text-right">Precio</th></tr></thead>
      <tbody>{poLines.slice(0, 12).map((l) => <tr key={l.id} className="border-t border-stone-100"><td className="py-1.5"><Link href={`/purchasing/orders/${l.order.id}`} className="text-[var(--ork-violet)] hover:underline">{l.order.number}</Link></td><td>{l.order.supplier.name}</td><td>{date(l.order.createdAt)}</td><td className="text-right tabular-nums">{num(l.quantity)}</td><td className="text-right tabular-nums">{money(l.unitPrice)}</td></tr>)}</tbody></table>
  );
  const inventoryTab = p.kind !== "GOODS" ? <p className="text-sm text-stone-500">Los servicios y kits no llevan existencias propias.</p> : (
    <div className="grid gap-6 md:grid-cols-2">
      <div><p className="mb-2 text-sm font-semibold">Existencias por almacén</p>
        <ul className="space-y-1 text-sm">{warehouses.map((w) => {
          const qty = quants.filter((q) => q.location.warehouseId === w.id && q.location.kind === "INTERNAL").reduce((s, q) => s + n(q.quantity), 0);
          return <li key={w.id} className="flex justify-between border-b border-stone-100 py-1"><span>{w.code} · {w.name}</span><span className="tabular-nums">{num(qty)} {p.unit}</span></li>;
        })}</ul>
        {!ctx.restricted("deny:costs") && <p className="mt-2 text-sm text-stone-600">Valor a costo: <b>{money(n(p.stock) * n(p.cost))}</b></p>}
      </div>
      <div><p className="mb-2 text-sm font-semibold">Reglas de reabastecimiento</p>
        {rules.length === 0 ? <p className="text-sm text-stone-500">Sin reglas. <Link href="/inventory/replenishment" className="text-[var(--ork-violet)] underline">Crear una</Link></p> : (
          <ul className="space-y-1 text-sm">{rules.map((r) => <li key={r.id} className="border-b border-stone-100 py-1">{lname.get(r.locationId) ?? "Ubicación"}: mín {num(r.minQty)} · máx {num(r.maxQty)} · {RULE_ACTION[r.action]}</li>)}</ul>
        )}
      </div>
    </div>
  );

  return (
    <>
      <RecordTopBar listLabel="Productos" listHref="/products" title={`[${p.sku}] ${p.name}`} newHref={ctx.can("products.write") ? "/products/new" : undefined} smart={smart}
        pager={{ index: idx + 1, total: order.length, prevHref: idx > 0 ? `/products/${order[idx - 1].id}` : undefined, nextHref: idx < order.length - 1 ? `/products/${order[idx + 1].id}` : undefined }} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ork-rule)] bg-white/80 p-2">
            <div className="flex gap-1.5">
              {ctx.hasModule("sales") && p.canBeSold && <Link href={`/sales/quotes/new`} className="rounded-lg bg-stone-200/70 px-3 py-1.5 text-sm font-medium hover:bg-stone-200">Cotizar</Link>}
              {ctx.hasModule("manufacturing") && boms > 0 && <Link href={`/manufacturing/orders/new?productId=${p.id}`} className="rounded-lg bg-stone-200/70 px-3 py-1.5 text-sm font-medium hover:bg-stone-200">Producir</Link>}
              {ctx.can("products.write") && (
                <form action={toggleArchive}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={p.active ? "0" : "1"} />
                  <button className="rounded-lg bg-stone-200/70 px-3 py-1.5 text-sm font-medium hover:bg-stone-200">{p.active ? "Archivar" : "Restaurar"}</button></form>
              )}
            </div>
            {!p.active && <StatusPill label="Archivado" tone="slate" />}
          </div>
          <ProductForm key={String(p.price) + (ctx.restricted("deny:costs") ? "" : String(p.cost)) + p.name} hideCost={ctx.restricted("deny:costs")} product={ctx.restricted("deny:costs") ? { ...p, cost: 0 } : p} defs={defs} suppliers={suppliers} categories={cats.map((c) => c.category!)} canWrite={ctx.can("products.write")}
            salesTab={salesTab} purchaseTab={purchaseTab} inventoryTab={inventoryTab} />
        </div>
        <div className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pr-1">
          <Chatter ctx={ctx} entityType="product" entityId={p.id} canWrite={ctx.can("products.write")} />
        </div>
      </div>
    </>
  );
}
