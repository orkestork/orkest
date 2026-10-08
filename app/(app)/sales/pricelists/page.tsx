import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { money, num } from "@/lib/ui/format";
import { savePricelist } from "../order-actions";

export const metadata = { title: "Listas de precios" };

export default async function Pricelists() {
  const ctx = await requireModule("sales", "sales.quotes.write");
  const [lists, products] = await Promise.all([
    ctx.db.pricelist.findMany({ include: { items: true }, orderBy: { name: "asc" } }),
    ctx.db.product.findMany({ where: { canBeSold: true }, orderBy: { name: "asc" } }),
  ]);
  const pmap = new Map(products.map((p) => [p.id, p.name]));
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))] as string[];
  return (
    <>
      <PageHeader title="Listas de precios" subtitle="Reglas por producto, categoría o generales, con cantidad mínima. Gana la más específica. Se asignan a cada cliente." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {lists.map((l) => (
            <Card key={l.id} title={`${l.name} · ${l.currency}${l.isDefault ? " · por defecto" : ""}`}>
              {l.items.length === 0 ? <p className="text-sm text-slate-400">Sin reglas: usa el precio de venta del producto.</p> : (
                <ul className="mb-4 space-y-1 text-sm">{l.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5">
                    <span>{i.productId ? pmap.get(i.productId) : i.category ? `Categoría ${i.category}` : "Todos los productos"}{Number(i.minQty) > 0 ? ` · desde ${num(i.minQty)} und` : ""}</span>
                    <span className="font-medium">{i.fixedPrice !== null ? money(i.fixedPrice, l.currency) : `−${num(i.discountPct)}%`}</span>
                  </li>
                ))}</ul>
              )}
              <ActionForm action={savePricelist} className="grid gap-2 sm:grid-cols-6">
                <input type="hidden" name="op" value="item" /><input type="hidden" name="pricelistId" value={l.id} />
                <select name="productId" className={`${input} sm:col-span-2`} aria-label="Producto"><option value="">Todos / por categoría</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <select name="category" className={input} aria-label="Categoría"><option value="">Categoría…</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
                <input name="minQty" type="number" min="0" placeholder="Cant. mín" className={input} />
                <input name="discountPct" type="number" min="0" max="100" step="any" placeholder="% desc." className={input} />
                <input name="fixedPrice" type="number" min="0" step="any" placeholder="o precio fijo" className={input} />
                <SubmitButton className={`${btn.small} sm:col-span-6 sm:justify-self-start`}>Agregar regla</SubmitButton>
              </ActionForm>
            </Card>
          ))}
        </div>
        <Card title="Nueva lista">
          <ActionForm action={savePricelist} className="space-y-3">
            <Field label="Nombre"><input name="name" required className={input} placeholder="Mayoristas" /></Field>
            <Field label="Moneda"><select name="currency" defaultValue={ctx.org.currency} className={input}>{["COP", "USD", "EUR", "MXN"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <SubmitButton className={btn.primary}>Crear lista</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
