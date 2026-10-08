import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { money } from "@/lib/ui/format";
import { saveWorkCenter } from "../actions";

export const metadata = { title: "Centros de trabajo" };

export default async function WorkCenters() {
  const ctx = await requireModule("manufacturing", "manufacturing.read");
  const [centers, wos] = await Promise.all([ctx.db.workCenter.findMany({ orderBy: { code: "asc" } }), ctx.db.workOrder.findMany({ where: { status: { not: "done" }, production: { organizationId: ctx.orgId } } })]);
  return (
    <>
      <PageHeader title="Centros de trabajo" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Código", "Nombre", "Costo / hora", "Capacidad", "Carga pendiente"]} empty={centers.length === 0}>
            {centers.map((c) => {
              const load = wos.filter((w) => w.workCenterId === c.id).reduce((s, w) => s + w.expectedMinutes, 0);
              return <tr key={c.id}><td className={`${td} font-mono text-xs`}>{c.code}</td><td className={td}>{c.name}</td><td className={td}>{money(c.costPerHour, ctx.org.currency)}</td><td className={td}>{c.capacity}</td><td className={td}>{Math.round(load / 60 * 10) / 10} h</td></tr>;
            })}
          </Table>
        </Card>
        {ctx.can("manufacturing.write") && (
          <Card title="Nuevo centro de trabajo">
            <ActionForm action={saveWorkCenter} className="space-y-3">
              <Field label="Código *"><input name="code" required className={input} /></Field>
              <Field label="Nombre *"><input name="name" required className={input} /></Field>
              <Field label="Costo por hora"><input name="costPerHour" type="number" min="0" className={input} /></Field>
              <Field label="Capacidad (en paralelo)"><input name="capacity" type="number" min="1" defaultValue={1} className={input} /></Field>
              <SubmitButton className={btn.primary}>Crear</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
