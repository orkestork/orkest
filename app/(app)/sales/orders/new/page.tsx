import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DocLines } from "@/components/doc-lines";
import { TaxModeScope, TaxModeToggle } from "@/components/tax-mode";
import { CustomFieldInputs } from "@/components/custom-fields";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { RecordPicker } from "@/components/record-picker";
import { orgPeople } from "@/lib/core/members";
import { lookupCustomers, quickCreateCustomer } from "../../../lookup-actions";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { saveSalesOrder } from "../../order-actions";

export default async function NewSalesOrder() {
  const ctx = await requireModule("sales", "sales.quotes.write");
  const [products, warehouses, pricelists, terms, defs, people] = await Promise.all([
    ctx.db.product.findMany({ where: { active: true, canBeSold: true }, orderBy: { name: "asc" } }),
    ctx.db.warehouse.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    ctx.db.pricelist.findMany(), ctx.db.paymentTerm.findMany(), getFieldDefs(ctx.db, "sales_order"), orgPeople(ctx),
  ]);
  return (
    <>
      <PageHeader title="Nuevo pedido de venta" crumbs={[{ label: "Pedidos", href: "/sales/orders" }, { label: "Nuevo" }]} subtitle="Al confirmar se genera la orden de entrega. Los precios de lista se ajustan a la lista de precios del cliente." />
      <Card>
        <ActionForm action={saveSalesOrder} className="space-y-5">
          <TaxModeScope>
          <TaxModeToggle />
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-7">
            <Field label="Cliente *" className="sm:col-span-2"><RecordPicker name="customerId" label="Cliente" required search={lookupCustomers} create={ctx.can("crm.customers.write") ? quickCreateCustomer : undefined} placeholder="Nombre, NIT o teléfono…" /></Field>
            <Field label="Vendedor"><select name="ownerId" defaultValue={ctx.user.id} className={input}>{people.filter((p) => !ctx.restricted("scope:own:sales") || p.id === ctx.user.id).map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (sin acceso)"}</option>)}</select></Field>
            <Field label="Despachar desde"><select name="warehouseId" className={input}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></Field>
            <Field label="Lista de precios"><select name="pricelistId" className={input}><option value="">La del cliente</option>{pricelists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Plazo de pago"><select name="paymentTermId" className={input}><option value="">El del cliente</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field label="Fecha compromiso"><input name="commitmentAt" type="date" className={input} /></Field>
          </div>
          {defs.length > 0 && <div className="rounded-xl border border-[var(--ork-rule)] bg-[var(--ork-paper-light)] p-4"><CustomFieldInputs defs={defs} legend="Despacho y facturación" wide /></div>}
          <DocLines products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, price: Number(p.price), taxRate: Number(p.taxRate) }))} />
          </TaxModeScope>
          <SubmitButton className={btn.primary}>Confirmar pedido</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
