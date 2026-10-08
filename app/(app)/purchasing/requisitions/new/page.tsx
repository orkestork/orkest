import { requireModule } from "@/lib/core/context";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CustomFieldInputs } from "@/components/custom-fields";
import { DocLines } from "@/components/doc-lines";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { saveRequisition } from "../../actions";

export default async function NewRequisition() {
  const ctx = await requireModule("purchasing", "purchasing.requisitions.write");
  const [products, warehouses, areas, defs] = await Promise.all([
    ctx.db.product.findMany({ where: { active: true, canBePurchased: true }, orderBy: { name: "asc" } }),
    ctx.db.warehouse.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    ctx.db.orgUnit.findMany({ where: { kind: "DEPARTMENT" }, orderBy: { name: "asc" } }),
    getFieldDefs(ctx.db, "requisition"),
  ]);
  return (
    <>
      <PageHeader title="Nueva requisición" crumbs={[{ label: "Requisiciones", href: "/purchasing/requisitions" }, { label: "Nueva" }]} />
      <Card>
        <ActionForm action={saveRequisition} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Área">
              {areas.length ? <select name="area" className={input}><option value="">—</option>{areas.map((a) => <option key={a.id}>{a.name}</option>)}</select> : <input name="area" className={input} />}
            </Field>
            <Field label="Necesaria para"><input name="neededBy" type="date" className={input} /></Field>
            <Field label="Entregar en"><select name="warehouseId" className={input}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></Field>
            <Field label="Proveedor sugerido"><input name="suggestedSupplier" className={input} /></Field>
          </div>
          <DocLines products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, price: Number(p.cost) }))} withPrice={false} />
          <Field label="Observaciones"><textarea name="notes" rows={2} className={input} /></Field>
          <CustomFieldInputs defs={defs} />
          <SubmitButton className={btn.primary}>Crear requisición</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
