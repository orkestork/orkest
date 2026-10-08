import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, SEVERITY_LABEL, SEVERITY_TONE, Table, td } from "@/components/ui";
import { date } from "@/lib/ui/format";
import { saveNonconformity } from "../ops-actions";

export const metadata = { title: "Calidad" };

export default async function Quality() {
  const ctx = await requireModule("quality", "quality.read");
  const [ncs, suppliers, products] = await Promise.all([
    ctx.db.nonconformity.findMany({ include: { supplier: true }, orderBy: { createdAt: "desc" } }),
    ctx.db.supplier.findMany({ orderBy: { name: "asc" } }),
    ctx.db.product.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="No conformidades" subtitle={`${ncs.filter((n) => n.status === "open").length} abiertas`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Código", "Descripción", "Proveedor", "Severidad", "Fecha"]} empty={ncs.length === 0}>
            {ncs.map((n) => (
              <tr key={n.id}>
                <td className={`${td} font-mono text-xs`}>{n.code}</td>
                <td className={td}>{n.title}</td>
                <td className={td}>{n.supplier?.name ?? "—"}</td>
                <td className={td}><Badge tone={SEVERITY_TONE[n.severity]}>{SEVERITY_LABEL[n.severity]}</Badge></td>
                <td className={td}>{date(n.createdAt)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {ctx.can("quality.write") && (
          <Card title="Registrar no conformidad">
            <ActionForm action={saveNonconformity} className="space-y-3">
              <Field label="Título *"><input name="title" required className={input} /></Field>
              <Field label="Descripción"><textarea name="description" rows={3} className={input} /></Field>
              <Field label="Proveedor"><select name="supplierId" className={input}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <Field label="Producto"><select name="productId" className={input}><option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <Field label="Severidad"><select name="severity" defaultValue="MEDIUM" className={input}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}</select></Field>
              <SubmitButton className={btn.primary}>Registrar</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
