import { requireModule } from "@/lib/core/context";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { RecordTopBar } from "@/components/record/top-bar";
import { ProductForm } from "../product-form";

export default async function NewProduct() {
  const ctx = await requireModule("products", "products.write");
  const [defs, cats, suppliers] = await Promise.all([
    getFieldDefs(ctx.db, "product"),
    ctx.db.product.findMany({ where: { category: { not: null } }, distinct: ["category"], select: { category: true } }),
    ctx.hasModule("purchasing") ? ctx.db.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  return (
    <>
      <RecordTopBar listLabel="Productos" listHref="/products" title="Nuevo" />
      <ProductForm canWrite hideCost={ctx.restricted("deny:costs")} defs={defs} suppliers={suppliers} categories={cats.map((c) => c.category!)}
        product={{ sku: "", name: "", category: null, unit: "UND", price: 0, cost: 0, minStock: 0, taxRate: 19, kind: "GOODS", invoicePolicy: "ORDER", defaultSupplierId: null, canBeSold: true, canBePurchased: true, customFields: {} }} />
    </>
  );
}
