import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { PART_CATEGORIES } from "@/lib/apps/maintenance";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { num } from "@/lib/ui/format";
import { partMove, savePart } from "../actions";

export const metadata = { title: "Repuestos y herramientas" };

/** Repuestos y herramientas = productos del catálogo; sus existencias se mueven en el almacén principal. */
export default async function Parts() {
  const ctx = await requireModule("maintenance", "maintenance.read");
  const parts = await ctx.db.product.findMany({ where: { category: { in: Object.keys(PART_CATEGORIES) }, active: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  const canWrite = ctx.can("maintenance.write");
  const low = parts.filter((p) => Number(p.stock) <= Number(p.minStock)).length;
  return (
    <>
      <PageHeader title="Repuestos y herramientas" subtitle={<>{parts.length} ítems · {low} en o bajo el mínimo · las existencias se reflejan en <Link href="/inventory" className="underline">Inventario</Link></>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Código", "Nombre", "Categoría", "Existencia", "Mínimo", "", ...(canWrite ? ["Movimiento"] : [])]} empty={parts.length === 0}>
            {parts.map((p) => {
              const isLow = Number(p.stock) <= Number(p.minStock);
              return (
                <tr key={p.id}>
                  <td className={`${td} font-mono text-xs`}>{p.sku}</td>
                  <td className={td}><Link href={`/products/${p.id}`} className="hover:underline">{p.name}</Link></td>
                  <td className={td}>{p.category}</td>
                  <td className={`${td} tabular-nums`}>{num(p.stock)} {p.unit}</td>
                  <td className={`${td} tabular-nums`}>{num(p.minStock)}</td>
                  <td className={td}>{isLow ? <Badge tone="rose">Reponer</Badge> : <Badge tone="emerald">OK</Badge>}</td>
                  {canWrite && (
                    <td className={td}>
                      <ActionForm action={partMove} className="flex items-center gap-1">
                        <input type="hidden" name="productId" value={p.id} />
                        <select name="dir" className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs"><option value="out">Salida</option><option value="in">Entrada</option></select>
                        <input name="quantity" type="number" min="1" step="1" required className="w-16 rounded-full border border-slate-300 px-2 py-1 text-xs" aria-label="Cantidad" />
                        <SubmitButton className={btn.small} pendingText="…">OK</SubmitButton>
                      </ActionForm>
                    </td>
                  )}
                </tr>
              );
            })}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Nuevo repuesto o herramienta">
            <ActionForm action={savePart} className="space-y-3">
              <Field label="Código *"><input name="code" required className={input} /></Field>
              <Field label="Nombre *"><input name="name" required className={input} /></Field>
              <Field label="Categoría"><select name="category" className={input}>{Object.keys(PART_CATEGORIES).map((c) => <option key={c}>{c}</option>)}</select></Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Existencia"><input name="stock" type="number" min="0" defaultValue={0} className={input} /></Field>
                <Field label="Mínimo"><input name="minStock" type="number" min="0" defaultValue={0} className={input} /></Field>
                <Field label="Unidad"><input name="unit" defaultValue="UND" className={input} /></Field>
              </div>
              <SubmitButton className={btn.primary}>Crear</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
