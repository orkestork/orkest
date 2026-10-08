import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DocLines } from "@/components/doc-lines";
import { TaxModeScope, TaxModeToggle } from "@/components/tax-mode";
import { CustomFieldInputs } from "@/components/custom-fields";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { saveSalesOrder } from "../../order-actions";

export default async function NewSalesOrder() {
  const ctx = await requireModule("sales", "sales.quotes.write");
  const [customers, products, warehouses, pricelists, terms, defs] = await Promise.all([
    ctx.db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.db.product.findMany({ where: { active: true, canBeSold: true }, orderBy: { name: "asc" } }),
    ctx.db.warehouse.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    ctx.db.pricelist.findMany(), ctx.db.paymentTerm.findMany(), getFieldDefs(ctx.db, "sales_order"),
  ]);
  return (
    <>
      <PageHeader title="Nuevo pedido de venta" crumbs={[{ label: "Pedidos", href: "/sales/orders" }, { label: "Nuevo" }]} subtitle="Al confirmar se genera la orden de entrega. Los precios de lista se ajustan a la lista de precios del cliente." />
      <Card>
        <ActionForm action={saveSalesOrder} className="space-y-5">
          <TaxModeScope>
          <TaxModeToggle />
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Field label="Cliente *"><select name="customerId" required className={input}><option value="">Selecciona…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
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
