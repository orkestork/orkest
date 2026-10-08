import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DocLines } from "@/components/doc-lines";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { OP_KIND } from "@/lib/ui/stock-labels";
import { saveTransfer } from "../../actions";

export default async function NewTransfer({ searchParams }: PageProps<"/inventory/transfers/new">) {
  const ctx = await requireModule("inventory", "inventory.write");
  const { mode } = await searchParams;
  const advanced = mode === "advanced";
  const [warehouses, ops, locations, products] = await Promise.all([
    ctx.db.warehouse.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    ctx.db.operationType.findMany({ where: { warehouse: { active: true } }, include: { warehouse: true }, orderBy: [{ warehouse: { position: "asc" } }, { kind: "asc" }] }),
    ctx.db.location.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    ctx.db.product.findMany({ where: { active: true, kind: "GOODS" }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Nueva transferencia" crumbs={[{ label: "Transferencias", href: "/inventory/transfers" }, { label: "Nueva" }]}
        subtitle={advanced ? "Modo avanzado: elige el tipo de operación y las ubicaciones." : "Traslada varios productos de un almacén a otro. Queda lista para validar."}
        actions={<a href={advanced ? "/inventory/transfers/new" : "/inventory/transfers/new?mode=advanced"} className={btn.secondary}>{advanced ? "Entre almacenes" : "Modo avanzado"}</a>} />
      <Card>
        <ActionForm action={saveTransfer} className="space-y-5">
          <input type="hidden" name="mode" value={advanced ? "advanced" : "warehouses"} />
          {advanced ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tipo de operación"><select name="operationTypeId" className={input}>{ops.map((o) => <option key={o.id} value={o.id}>{o.warehouse.code} · {o.name} ({OP_KIND[o.kind]})</option>)}</select></Field>
              <Field label="Desde (opcional)"><select name="srcLocationId" className={input}><option value="">Según tipo</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
              <Field label="Hacia (opcional)"><select name="destLocationId" className={input}><option value="">Según tipo</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
              <Field label="Documento origen"><input name="origin" className={input} /></Field>
              <Field label="Tercero"><input name="partnerName" className={input} /></Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Desde el almacén"><select name="fromWarehouseId" className={input}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></Field>
              <Field label="Hacia el almacén"><select name="toWarehouseId" defaultValue={warehouses[1]?.id} className={input}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></Field>
              <Field label="Referencia"><input name="origin" className={input} placeholder="Traslado semanal a planta" /></Field>
            </div>
          )}
          <DocLines products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, price: 0 }))} withPrice={false} freeText={false} />
          <SubmitButton className={btn.primary}>Crear transferencia</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
