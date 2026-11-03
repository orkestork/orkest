import { requireModule } from "@/lib/core/context";
import { rangeFrom, todayKey } from "@/lib/apps/ops-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { OpsBadge, RangeFilter } from "@/components/ops";
import { btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { date } from "@/lib/ui/format";
import { resolveIncident, saveIncident } from "../actions";

export const metadata = { title: "Novedades de transporte" };

export default async function Incidents({ searchParams }: PageProps<"/logistics/incidents">) {
  const ctx = await requireModule("logistics", "logistics.read");
  const { from, to, where } = rangeFrom(await searchParams);
  const [incidents, vehicles, drivers] = await Promise.all([
    ctx.db.transportIncident.findMany({ where: { OR: [{ status: "OPEN" }, { date: where }] }, orderBy: [{ status: "asc" }, { date: "desc" }] }),
    ctx.db.vehicle.findMany({ orderBy: { plate: "asc" } }),
    ctx.db.driver.findMany({ orderBy: { fullName: "asc" } }),
  ]);
  const plate = new Map(vehicles.map((v) => [v.id, v.plate]));
  const driver = new Map(drivers.map((d) => [d.id, d.fullName]));
  const canWrite = ctx.can("logistics.write");
  return (
    <>
      <PageHeader title="Novedades" subtitle={`${incidents.filter((i) => i.status === "OPEN").length} abiertas`} />
      <RangeFilter from={from} to={to} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Fecha", "Tipo", "Vehículo / conductor", "Descripción", "Acción correctiva", "Estado"]} empty={incidents.length === 0}>
            {incidents.map((i) => (
              <tr key={i.id}>
                <td className={td}>{date(i.date)}</td>
                <td className={td}>{i.type}</td>
                <td className={td}>{i.vehicleId ? <span className="font-mono">{plate.get(i.vehicleId)}</span> : "—"}<p className="text-xs text-slate-400">{i.driverId ? driver.get(i.driverId) : ""}</p></td>
                <td className={td}>{i.description}</td>
                <td className={td}>
                  {i.status === "OPEN" && canWrite ? (
                    <form action={resolveIncident} className="flex gap-1">
                      <input type="hidden" name="id" value={i.id} />
                      <input name="correctiveAction" defaultValue={i.correctiveAction ?? ""} placeholder="Acción tomada" className="w-40 rounded-full border border-slate-300 px-2 py-1 text-xs" />
                      <button className={btn.small}>Resolver</button>
                    </form>
                  ) : i.correctiveAction ?? "—"}
                </td>
                <td className={td}><OpsBadge kind="incidentStatus" value={i.status} /></td>
              </tr>
            ))}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Registrar novedad">
            <ActionForm action={saveIncident} className="space-y-3">
              <Field label="Fecha"><input type="date" name="date" defaultValue={todayKey()} required className={input} /></Field>
              <Field label="Tipo *" hint="Ej.: accidente, daño mecánico, retraso, comparendo"><input name="type" required className={input} /></Field>
              <Field label="Vehículo"><select name="vehicleId" className={input}><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></Field>
              <Field label="Conductor"><select name="driverId" className={input}><option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}</select></Field>
              <Field label="Descripción *"><textarea name="description" rows={3} required className={input} /></Field>
              <Field label="Acción correctiva"><input name="correctiveAction" className={input} /></Field>
              <SubmitButton className={btn.primary}>Registrar</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
