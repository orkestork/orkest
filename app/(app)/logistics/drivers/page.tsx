import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { saveDriver, toggleDriver } from "../actions";

export const metadata = { title: "Conductores" };

export default async function Drivers() {
  const ctx = await requireModule("logistics", "logistics.read");
  const [drivers, routes, incidents] = await Promise.all([
    ctx.db.driver.findMany({ orderBy: [{ active: "desc" }, { fullName: "asc" }] }),
    ctx.db.deliveryRoute.groupBy({ by: ["driverId"], _count: { _all: true } }),
    ctx.db.transportIncident.groupBy({ by: ["driverId"], where: { status: "OPEN" }, _count: { _all: true } }),
  ]);
  const canWrite = ctx.can("logistics.write");
  return (
    <>
      <PageHeader title="Conductores" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Nombre", "Teléfono", "Rutas", "Novedades abiertas", "Estado", ""]} empty={drivers.length === 0}>
            {drivers.map((d) => (
              <tr key={d.id}>
                <td className={td}>{d.fullName}</td>
                <td className={td}>{d.phone ?? "—"}</td>
                <td className={`${td} tabular-nums`}>{routes.find((r) => r.driverId === d.id)?._count._all ?? 0}</td>
                <td className={`${td} tabular-nums`}>{incidents.find((r) => r.driverId === d.id)?._count._all ?? 0}</td>
                <td className={td}>{d.active ? <Badge tone="emerald">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                <td className={td}>{canWrite && <form action={toggleDriver}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="active" value={d.active ? "0" : "1"} /><button className={btn.small}>{d.active ? "Desactivar" : "Activar"}</button></form>}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Nuevo conductor">
            <ActionForm action={saveDriver} className="space-y-3">
              <Field label="Nombre completo *"><input name="fullName" required className={input} /></Field>
              <Field label="Teléfono"><input name="phone" className={input} /></Field>
              <SubmitButton className={btn.primary}>Crear</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
