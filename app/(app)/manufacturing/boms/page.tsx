import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { Badge, btn, Card, PageHeader } from "@/components/ui";
import { num } from "@/lib/ui/format";

export const metadata = { title: "Listas de materiales" };

export default async function Boms() {
  const ctx = await requireModule("manufacturing", "manufacturing.read");
  const boms = await ctx.db.bom.findMany({ include: { lines: true, operations: { orderBy: { position: "asc" } } } });
  const products = new Map((await ctx.db.product.findMany()).map((p) => [p.id, p]));
  const centers = new Map((await ctx.db.workCenter.findMany()).map((c) => [c.id, c.name]));
  return (
    <>
      <PageHeader title="Listas de materiales" subtitle="NORMAL: se fabrica con una orden de producción. KIT: no se fabrica; al venderlo se entregan sus componentes."
        actions={ctx.can("manufacturing.write") && <Link href="/manufacturing/boms/new" className={btn.primary}>Nueva lista</Link>} />
      <div className="grid gap-4 lg:grid-cols-2">
        {boms.map((b) => {
          const p = products.get(b.productId);
          const cost = b.lines.reduce((s, l) => s + Number(l.quantity) * Number(products.get(l.componentId)?.cost ?? 0), 0) / Number(b.quantity);
          return (
            <Card key={b.id} title={<span className="flex items-center gap-2">{p?.name}<Badge tone={b.type === "KIT" ? "amber" : "violet"}>{b.type === "KIT" ? "Kit" : "Fabricar"}</Badge></span>}
              actions={b.type === "NORMAL" && ctx.can("manufacturing.write") ? <Link href={`/manufacturing/orders/new?productId=${b.productId}`} className={btn.small}>Producir</Link> : null}>
              <p className="mb-2 text-xs text-slate-500">Produce {num(b.quantity)} {p?.unit} · costo de materiales ≈ {Math.round(cost).toLocaleString("es-CO")} c/u</p>
              <ul className="space-y-1 text-sm">{b.lines.map((l) => <li key={l.id} className="flex justify-between"><span>{products.get(l.componentId)?.name}</span><span className="text-slate-500">{num(l.quantity)} {products.get(l.componentId)?.unit}</span></li>)}</ul>
              {b.operations.length > 0 && <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">Ruta: {b.operations.map((o) => `${o.name} (${centers.get(o.workCenterId)}, ${o.durationMinutes} min)`).join(" → ")}</p>}
            </Card>
          );
        })}
      </div>
    </>
  );
}
