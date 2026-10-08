import { requireModule } from "@/lib/core/context";
import { RecordTopBar } from "@/components/record/top-bar";
import { saveQuote } from "../../actions";
import { QuoteEditor } from "../quote-editor";

export default async function NewQuote({ searchParams }: PageProps<"/sales/quotes/new">) {
  const ctx = await requireModule("sales", "sales.quotes.write");
  const { customerId } = await searchParams;
  const [products, customers, terms, pricelists] = await Promise.all([
    ctx.db.product.findMany({ where: { active: true, canBeSold: true }, orderBy: { name: "asc" } }),
    ctx.db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ctx.db.paymentTerm.findMany({ select: { id: true, name: true } }),
    ctx.db.pricelist.findMany({ select: { id: true, name: true } }),
  ]);
  return (
    <>
      <RecordTopBar listLabel="Cotizaciones" listHref="/sales/quotes" title="Nueva" />
      <div className="rounded-2xl border border-[var(--ork-rule)] bg-white p-6">
        <QuoteEditor action={saveQuote}
          initial={{ customerId: typeof customerId === "string" ? customerId : "", validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), paymentTermId: "", pricelistId: "", terms: "Oferta válida por 30 días. Precios en pesos colombianos, IVA discriminado.", notes: "",
            lines: [{ kind: "PRODUCT", productId: "", description: "", quantity: 1, unitPrice: 0, discountPct: 0, taxRate: 19 }] }}
          products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, price: Number(p.price), cost: Number(p.cost), taxRate: Number(p.taxRate), unit: p.unit }))}
          customers={customers} terms={terms} pricelists={pricelists} />
      </div>
    </>
  );
}
