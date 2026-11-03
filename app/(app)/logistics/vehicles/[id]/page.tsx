import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { checklistFor, VEHICLE_DOCS } from "@/lib/apps/logistics";
import { dayKey, todayKey } from "@/lib/apps/ops-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { opsOptions } from "@/components/ops";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { money } from "@/lib/ui/format";
import { saveChecklistAction, saveVehicleAction } from "../../actions";

const MARK: Record<string, string> = { B: "text-emerald-700", M: "font-bold text-rose-600", NA: "text-slate-300" };

/** Ficha del vehículo: documentos y planilla mensual de revisión pre-operacional. */
export const metadata = { title: "Vehículo" };

export default async function VehicleDetail({ params, searchParams }: PageProps<"/logistics/vehicles/[id]">) {
  const ctx = await requireModule("logistics", "logistics.read");
  const { id } = await params;
  const sp = await searchParams;
  const v = await ctx.db.vehicle.findUnique({ where: { id } });
  if (!v) notFound();
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayKey().slice(0, 7);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const [entries, drivers, costs] = await Promise.all([
    ctx.db.vehicleChecklistEntry.findMany({ where: { vehicleId: v.id, date: { gte: start, lt: end } }, orderBy: { date: "asc" } }),
    ctx.db.driver.findMany({ where: { active: true }, orderBy: { fullName: "asc" } }),
    ctx.db.transportCost.aggregate({ where: { vehicleId: v.id, date: { gte: start, lt: end } }, _sum: { amount: true } }),
  ]);
  const items = checklistFor(v.type);
  const days = Array.from({ length: Math.round((end.getTime() - start.getTime()) / 86400_000) }, (_, i) => i + 1);
  const byDay = new Map(entries.map((e) => [Number(dayKey(e.date).slice(8)), e]));
  const canWrite = ctx.can("logistics.write");
  const iso = (d: Date | null) => (d ? dayKey(d) : "");

  return (
    <>
      <PageHeader title={`Vehículo ${v.plate}`} crumbs={[{ label: "Vehículos", href: "/logistics/vehicles" }, { label: v.plate }]} subtitle={`Costos del mes: ${money(costs._sum.amount ?? 0, ctx.org.currency)}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={`Revisión pre-operacional · ${month}`} className="lg:col-span-2" actions={<form className="flex gap-1"><input type="month" name="month" defaultValue={month} className="rounded-full border border-slate-300 px-2 py-1 text-xs" /><button className={btn.small}>Ver</button></form>}>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead><tr><th className="sticky left-0 bg-white px-2 py-1 text-left font-medium text-slate-500">Ítem</th>{days.map((d) => <th key={d} className="w-6 px-0.5 text-center font-normal text-slate-400">{d}</th>)}</tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.key} className="border-t border-slate-100">
                    <td className="sticky left-0 whitespace-nowrap bg-white px-2 py-1">{(i === 0 || items[i - 1].category !== it.category) && <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-400">{it.category} ·</span>}{it.label}</td>
                    {days.map((d) => { const m = (byDay.get(d)?.items as Record<string, string> | undefined)?.[it.key]; return <td key={d} className={`text-center ${m ? MARK[m] : ""}`}>{m ?? ""}</td>; })}
                  </tr>
                ))}
                <tr className="border-t border-slate-200"><td className="sticky left-0 bg-white px-2 py-1 text-slate-500">Iniciales</td>{days.map((d) => <td key={d} className="text-center text-[10px]">{byDay.get(d)?.initials ?? ""}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">B = bueno · M = malo · NA = no aplica</p>
        </Card>
        <div className="space-y-6">
          {canWrite && drivers.length > 0 && (
            <Card title="Registrar revisión del día">
              <ActionForm action={saveChecklistAction} className="space-y-3">
                <input type="hidden" name="vehicleId" value={v.id} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Fecha"><input type="date" name="date" defaultValue={todayKey()} required className={input} /></Field>
                  <Field label="Conductor"><select name="driverId" className={input}>{drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}</select></Field>
                </div>
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {items.map((it) => (
                    <div key={it.key} className="flex items-center justify-between gap-2 text-xs">
                      <span>{it.label}</span>
                      <span className="flex gap-2">{["B", "M", "NA"].map((m) => <label key={m} className="flex items-center gap-0.5"><input type="radio" name={`item:${it.key}`} value={m} defaultChecked={m === "B"} />{m}</label>)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Iniciales"><input name="initials" maxLength={5} className={input} /></Field>
                  <Field label="Observaciones" className="col-span-2"><input name="notes" className={input} /></Field>
                </div>
                <SubmitButton className={btn.primary}>Guardar revisión</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {canWrite && (
            <Card title="Datos y documentos">
              <ActionForm action={saveVehicleAction} className="space-y-3">
                <input type="hidden" name="id" value={v.id} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Placa"><input name="plate" defaultValue={v.plate} required className={input} /></Field>
                  <Field label="Tipo"><select name="type" defaultValue={v.type} className={input}>{opsOptions("vehicleType")}</select></Field>
                </div>
                {VEHICLE_DOCS.map((d) => <Field key={d.key} label={`Vence ${d.label}`}><input type="date" name={d.key} defaultValue={iso(v[d.key])} className={input} /></Field>)}
                <SubmitButton className={btn.secondary}>Guardar</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
