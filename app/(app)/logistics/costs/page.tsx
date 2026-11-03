import { requireModule } from "@/lib/core/context";
import { rangeFrom, todayKey } from "@/lib/apps/ops-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { OpsBadge, opsOptions, RangeFilter } from "@/components/ops";
import { btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { date, money } from "@/lib/ui/format";
import { deleteCost, saveCost } from "../actions";

export const metadata = { title: "Costos de transporte" };

export default async function Costs({ searchParams }: PageProps<"/logistics/costs">) {
  const ctx = await requireModule("logistics", "logistics.read");
  const { from, to, where } = rangeFrom(await searchParams);
  const [costs, vehicles] = await Promise.all([
    ctx.db.transportCost.findMany({ where: { date: where }, orderBy: { date: "desc" } }),
    ctx.db.vehicle.findMany({ orderBy: { plate: "asc" } }),
  ]);
  const plate = new Map(vehicles.map((v) => [v.id, v.plate]));
  const total = costs.reduce((s, c) => s + Number(c.amount), 0);
  const byVehicle = vehicles.map((v) => ({ plate: v.plate, amount: costs.filter((c) => c.vehicleId === v.id).reduce((s, c) => s + Number(c.amount), 0) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const canWrite = ctx.can("logistics.write");
  return (
    <>
      <PageHeader title="Costos de transporte" subtitle={`Total del periodo ${money(total, ctx.org.currency)}`} />
      <RangeFilter from={from} to={to} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Fecha", "Vehículo", "Categoría", "Monto", "Notas", ""]} empty={costs.length === 0}>
            {costs.map((c) => (
              <tr key={c.id}>
                <td className={td}>{date(c.date)}</td>
                <td className={`${td} font-mono`}>{plate.get(c.vehicleId)}</td>
                <td className={td}><OpsBadge kind="costCategory" value={c.category} /></td>
                <td className={`${td} tabular-nums`}>{money(c.amount, ctx.org.currency)}</td>
                <td className={td}>{c.notes ?? ""}</td>
                <td className={td}>{canWrite && <form action={deleteCost}><input type="hidden" name="id" value={c.id} /><button className={btn.ghost} title="Eliminar">✕</button></form>}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <div className="space-y-6">
          {byVehicle.length > 0 && (
            <Card title="Por vehículo">
              {byVehicle.map((x) => (
                <div key={x.plate} className="mb-2 text-sm">
                  <div className="flex justify-between"><span className="font-mono">{x.plate}</span><span className="tabular-nums">{money(x.amount, ctx.org.currency)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[var(--ork-violet)]" style={{ width: `${(x.amount / byVehicle[0].amount) * 100}%` }} /></div>
                </div>
              ))}
            </Card>
          )}
          {canWrite && vehicles.length > 0 && (
            <Card title="Registrar costo">
              <ActionForm action={saveCost} className="space-y-3">
                <Field label="Vehículo"><select name="vehicleId" className={input}>{vehicles.filter((v) => v.active).map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></Field>
                <Field label="Fecha"><input type="date" name="date" defaultValue={todayKey()} required className={input} /></Field>
                <Field label="Categoría"><select name="category" className={input}>{opsOptions("costCategory")}</select></Field>
                <Field label="Monto *"><input name="amount" type="number" min="1" required className={input} /></Field>
                <Field label="Notas"><input name="notes" className={input} /></Field>
                <SubmitButton className={btn.primary}>Registrar</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
