import { requireModule } from "@/lib/core/context";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CustomFieldInputs } from "@/components/custom-fields";
import { DocLines } from "@/components/doc-lines";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { savePurchaseOrder } from "../../actions";

export default async function NewPurchaseOrder() {
  const ctx = await requireModule("purchasing", "purchasing.write");
  const [suppliers, warehouses, products, defs] = await Promise.all([
    ctx.db.supplier.findMany({ orderBy: { name: "asc" } }),
    ctx.db.warehouse.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    ctx.db.product.findMany({ where: { active: true, canBePurchased: true }, orderBy: { name: "asc" } }),
    getFieldDefs(ctx.db, "purchase_order"),
  ]);
  return (
    <>
      <PageHeader title="Nueva solicitud de cotización" crumbs={[{ label: "Órdenes de compra", href: "/purchasing/orders" }, { label: "Nueva" }]} />
      <Card>
        <ActionForm action={savePurchaseOrder} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Proveedor *"><select name="supplierId" required className={input}><option value="">Selecciona…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Recibir en"><select name="warehouseId" className={input}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></Field>
            <Field label="Llegada esperada"><input name="expectedAt" type="date" className={input} /></Field>
          </div>
          <DocLines products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, price: Number(p.cost), taxRate: Number(p.taxRate) }))} />
          <Field label="Notas"><textarea name="notes" rows={2} className={input} /></Field>
          <CustomFieldInputs defs={defs} />
          <SubmitButton className={btn.primary}>Crear</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
