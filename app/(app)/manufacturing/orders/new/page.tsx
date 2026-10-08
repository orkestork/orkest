import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Empty, Field, input, PageHeader } from "@/components/ui";
import { saveProduction } from "../../actions";

export default async function NewProduction({ searchParams }: PageProps<"/manufacturing/orders/new">) {
  const ctx = await requireModule("manufacturing", "manufacturing.write");
  const { productId } = await searchParams;
  const [boms, warehouses] = await Promise.all([
    ctx.db.bom.findMany({ where: { active: true, type: "NORMAL" } }),
    ctx.db.warehouse.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
  ]);
  const products = await ctx.db.product.findMany({ where: { id: { in: boms.map((b) => b.productId) } }, orderBy: { name: "asc" } });
  if (!products.length) return <Empty title="Primero crea una lista de materiales">Manufactura → Listas de materiales.</Empty>;
  return (
    <>
      <PageHeader title="Nueva orden de producción" crumbs={[{ label: "Órdenes de producción", href: "/manufacturing/orders" }, { label: "Nueva" }]} />
      <Card className="max-w-2xl">
        <ActionForm action={saveProduction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Producto a fabricar"><select name="productId" defaultValue={typeof productId === "string" ? productId : undefined} className={input}>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></Field>
          <Field label="Cantidad"><input name="quantity" type="number" min="0.001" step="any" defaultValue={1} required className={input} /></Field>
          <Field label="Planta (almacén)"><select name="warehouseId" className={input}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></Field>
          <Field label="Fecha programada"><input name="scheduledAt" type="date" className={input} /></Field>
          <Field label="Origen"><input name="origin" className={input} placeholder="Pedido PV-00001" /></Field>
          <div className="flex items-end"><SubmitButton className={btn.primary}>Crear orden</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
