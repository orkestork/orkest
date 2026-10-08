import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CustomFieldInputs } from "@/components/custom-fields";
import { Tabs } from "@/components/record/tabs";
import { ProductThumb } from "@/components/product-thumb";
import type { FieldDef } from "@/lib/core/custom-fields";
import { saveProductForm } from "./actions";

type P = { id?: string; sku: string; name: string; category: string | null; unit: string; price: unknown; cost: unknown; minStock: unknown; taxRate: unknown; kind: string; invoicePolicy: string; defaultSupplierId: string | null; canBeSold: boolean; canBePurchased: boolean; customFields: unknown };

const field = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ork-violet)]";
function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid items-center gap-1 text-sm sm:grid-cols-[170px_1fr] sm:gap-3">
      <span className="font-semibold text-stone-800">{label}</span>
      <span>{children}{hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}</span>
    </label>
  );
}

/** Ficha editable del producto (estilo Odoo) — se usa para crear y editar. */
export function ProductForm({ product, categories, suppliers, defs, canWrite, salesTab, purchaseTab, inventoryTab }: {
  product: P; categories: string[]; suppliers: { id: string; name: string }[]; defs: (FieldDef & { id: string })[]; canWrite: boolean;
  salesTab?: ReactNode; purchaseTab?: ReactNode; inventoryTab?: ReactNode;
}) {
  const num = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));
  return (
    <ActionForm action={saveProductForm} className="rounded-2xl border border-[var(--ork-rule)] bg-white p-6">
      {product.id && <input type="hidden" name="id" value={product.id} />}
      <fieldset disabled={!canWrite} className="contents">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <input name="name" defaultValue={product.name} required placeholder="Nombre del producto" aria-label="Nombre del producto"
              className="w-full border-b border-transparent bg-transparent text-3xl font-semibold tracking-tight outline-none hover:border-stone-200 focus:border-[var(--ork-violet)]" />
            <div className="flex flex-wrap gap-5 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="canBeSold" defaultChecked={product.canBeSold} className="h-4 w-4 accent-[var(--ork-violet)]" /> Se puede vender</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="canBePurchased" defaultChecked={product.canBePurchased} className="h-4 w-4 accent-[var(--ork-violet)]" /> Se puede comprar</label>
            </div>
          </div>
          <ProductThumb name={product.name || "Nuevo"} category={product.category} size={84} />
        </div>

        <Tabs tabs={[
          { key: "general", label: "Información general", content: (
            <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
              <div className="space-y-3">
                <Row label="Tipo de producto" hint="Almacenable lleva existencias; servicio no; kit entrega sus componentes.">
                  <select name="kind" defaultValue={product.kind} className={field}><option value="GOODS">Almacenable</option><option value="SERVICE">Servicio</option><option value="COMBO">Kit / combo</option></select>
                </Row>
                <Row label="Política de facturación">
                  <select name="invoicePolicy" defaultValue={product.invoicePolicy} className={field}><option value="ORDER">Cantidades pedidas</option><option value="DELIVERY">Cantidades entregadas</option></select>
                </Row>
                <Row label="Unidad de medida"><input name="unit" defaultValue={product.unit} className={field} /></Row>
                <Row label="Categoría">
                  <input name="category" list="product-categories" defaultValue={product.category ?? ""} className={field} />
                  <datalist id="product-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                </Row>
                <Row label="Referencia interna"><input name="sku" defaultValue={product.sku} required className={`${field} font-mono`} /></Row>
              </div>
              <div className="space-y-3">
                <Row label="Precio de venta"><input name="price" type="number" step="any" min="0" defaultValue={num(product.price)} className={`${field} text-right`} /></Row>
                <Row label="Impuesto (IVA %)"><input name="taxRate" type="number" step="any" min="0" max="100" defaultValue={num(product.taxRate)} className={`${field} text-right`} /></Row>
                <Row label="Costo" hint="Se usa para margen, valor de inventario y reabastecimiento."><input name="cost" type="number" step="any" min="0" defaultValue={num(product.cost)} className={`${field} text-right`} /></Row>
                {!product.id && <Row label="Existencia inicial" hint="Entra como ajuste al almacén principal."><input name="stock" type="number" step="any" min="0" className={`${field} text-right`} /></Row>}
              </div>
              {defs.length > 0 && <div className="md:col-span-2"><CustomFieldInputs defs={defs} values={(product.customFields ?? {}) as Record<string, unknown>} /></div>}
            </div>
          ) },
          { key: "sales", label: "Ventas", content: salesTab ?? <p className="text-sm text-stone-500">Guarda el producto para ver su historial de ventas.</p> },
          { key: "purchase", label: "Compras", content: (
            <div className="space-y-5">
              <div className="max-w-xl"><Row label="Proveedor por defecto" hint="Lo usa el reabastecimiento automático (regla «Comprar»).">
                <select name="defaultSupplierId" defaultValue={product.defaultSupplierId ?? ""} className={field}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </Row></div>
              {purchaseTab}
            </div>
          ) },
          { key: "inventory", label: "Inventario", content: (
            <div className="space-y-5">
              <div className="max-w-xl"><Row label="Stock mínimo (alerta)" hint="Radar avisa cuando la existencia total cae por debajo."><input name="minStock" type="number" step="any" min="0" defaultValue={num(product.minStock)} className={`${field} text-right`} /></Row></div>
              {inventoryTab}
            </div>
          ) },
        ]} />

        {canWrite && <div className="mt-6 flex justify-end border-t border-stone-100 pt-4"><SubmitButton className="rounded-lg bg-[var(--ork-purple)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--ork-violet)]" pendingText="Guardando…">Guardar</SubmitButton></div>}
      </fieldset>
    </ActionForm>
  );
}
