import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { docState, VEHICLE_DOCS } from "@/lib/apps/logistics";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { OpsBadge, opsOptions } from "@/components/ops";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { date } from "@/lib/ui/format";
import { saveVehicleAction, toggleVehicle } from "../actions";

export const metadata = { title: "Vehículos" };

export default async function Vehicles() {
  const ctx = await requireModule("logistics", "logistics.read");
  const vehicles = await ctx.db.vehicle.findMany({ orderBy: [{ active: "desc" }, { plate: "asc" }] });
  const canWrite = ctx.can("logistics.write");
  const alerts = vehicles.filter((v) => v.active && VEHICLE_DOCS.some((d) => ["rose", "amber"].includes(docState(v[d.key])?.tone ?? ""))).length;
  return (
    <>
      <PageHeader title="Vehículos" subtitle={`${vehicles.filter((v) => v.active).length} activos · ${alerts} con documentos vencidos o por vencer`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Placa", "Tipo", ...VEHICLE_DOCS.map((d) => d.label), ""]} empty={vehicles.length === 0}>
            {vehicles.map((v) => (
              <tr key={v.id} className={v.active ? "" : "opacity-50"}>
                <td className={`${td} font-mono font-semibold`}><Link href={`/logistics/vehicles/${v.id}`} className="text-[var(--ork-violet)] underline">{v.plate}</Link></td>
                <td className={td}><OpsBadge kind="vehicleType" value={v.type} /></td>
                {VEHICLE_DOCS.map((d) => {
                  const st = docState(v[d.key]);
                  return <td key={d.key} className={td}>{st ? <><Badge tone={st.tone}>{st.label}</Badge><p className="text-xs text-slate-400">{date(v[d.key])}</p></> : <span className="text-slate-400">—</span>}</td>;
                })}
                <td className={td}>{canWrite && <form action={toggleVehicle}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="active" value={v.active ? "0" : "1"} /><button className={btn.small}>{v.active ? "Desactivar" : "Activar"}</button></form>}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Nuevo vehículo">
            <ActionForm action={saveVehicleAction} className="space-y-3">
              <Field label="Placa *"><input name="plate" required className={`${input} uppercase`} /></Field>
              <Field label="Tipo"><select name="type" className={input}>{opsOptions("vehicleType")}</select></Field>
              {VEHICLE_DOCS.map((d) => <Field key={d.key} label={`Vence ${d.label}`}><input type="date" name={d.key} className={input} /></Field>)}
              <SubmitButton className={btn.primary}>Crear</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
