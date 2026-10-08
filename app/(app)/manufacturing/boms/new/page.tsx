import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DocLines } from "@/components/doc-lines";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { saveBom } from "../../actions";

export default async function NewBom() {
  const ctx = await requireModule("manufacturing", "manufacturing.write");
  const [products, centers] = await Promise.all([ctx.db.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }), ctx.db.workCenter.findMany({ where: { active: true } })]);
  return (
    <>
      <PageHeader title="Nueva lista de materiales" crumbs={[{ label: "Listas de materiales", href: "/manufacturing/boms" }, { label: "Nueva" }]} />
      <Card>
        <ActionForm action={saveBom} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Producto"><select name="productId" className={input}>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></Field>
            <Field label="Tipo"><select name="type" className={input}><option value="NORMAL">Fabricar este producto</option><option value="KIT">Kit</option></select></Field>
            <Field label="Cantidad que produce"><input name="quantity" type="number" step="any" min="0.001" defaultValue={1} className={input} /></Field>
            <Field label="Referencia"><input name="code" className={input} /></Field>
          </div>
          <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Componentes</p>
            <DocLines products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, price: 0 }))} withPrice={false} freeText={false} />
          </div>
          {centers.length > 0 && (
            <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Operaciones (opcional)</p>
              <div className="space-y-2">{[0, 1, 2, 3].map((i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <input name={`op_name_${i}`} placeholder={`Operación ${i + 1}`} className={input} />
                  <select name={`op_wc_${i}`} className={input}><option value="">Centro de trabajo…</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  <input name={`op_min_${i}`} type="number" min="0" placeholder="Minutos" className={input} />
                </div>
              ))}</div>
            </div>
          )}
          <SubmitButton className={btn.primary}>Guardar lista</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
