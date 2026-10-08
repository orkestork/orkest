import { requireModule } from "@/lib/core/context";
import { getFieldDefs, formatFieldValue } from "@/lib/core/custom-fields";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CustomFieldInputs } from "@/components/custom-fields";
import { btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { saveSupplier } from "../../ops-actions";

export const metadata = { title: "Proveedores" };

export default async function Suppliers() {
  const ctx = await requireModule("purchasing", "purchasing.read");
  const [suppliers, defs] = await Promise.all([
    ctx.db.supplier.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { nonconformities: true } } } }),
    getFieldDefs(ctx.db, "supplier"),
  ]);
  return (
    <>
      <PageHeader title="Proveedores" subtitle="Órdenes de compra: próxima iteración del módulo Purchasing" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Proveedor", "NIT", ...defs.map((d) => d.label), ...(ctx.hasModule("quality") ? ["No conformidades"] : [])]} empty={suppliers.length === 0}>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td className={td}><p className="font-medium">{s.name}</p><p className="text-xs text-slate-400">{s.email}</p></td>
                <td className={td}>{s.taxId ?? "—"}</td>
                {defs.map((d) => <td key={d.id} className={td}>{formatFieldValue(d, (s.customFields as Record<string, unknown>)[d.key])}</td>)}
                {ctx.hasModule("quality") && <td className={td}>{s._count.nonconformities}</td>}
              </tr>
            ))}
          </Table>
        </Card>
        {ctx.can("purchasing.write") && (
          <Card title="Nuevo proveedor">
            <ActionForm action={saveSupplier} className="space-y-3">
              <Field label="Nombre *"><input name="name" required className={input} /></Field>
              <Field label="NIT"><input name="taxId" className={input} /></Field>
              <Field label="Email"><input name="email" type="email" className={input} /></Field>
              <CustomFieldInputs defs={defs} />
              <SubmitButton className={btn.primary}>Crear</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
