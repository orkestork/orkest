import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { assignableOrders, logisticsKpis } from "@/lib/apps/logistics";
import { rangeFrom, todayKey } from "@/lib/apps/ops-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { OpsBadge, RangeFilter } from "@/components/ops";
import { btn, Card, Field, input, PageHeader, Stat, Table, td } from "@/components/ui";
import { date, money } from "@/lib/ui/format";
import { saveRoute } from "./actions";

export const metadata = { title: "Logística" };

export default async function Routes({ searchParams }: PageProps<"/logistics">) {
  const ctx = await requireModule("logistics", "logistics.read");
  const { from, to, where } = rangeFrom(await searchParams);
  const canWrite = ctx.can("logistics.write");
  const [routes, vehicles, drivers, kpis, pending] = await Promise.all([
    ctx.db.deliveryRoute.findMany({ where: { date: where }, include: { stops: { select: { status: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    ctx.db.vehicle.findMany({ where: { active: true }, orderBy: { plate: "asc" } }),
    ctx.db.driver.findMany({ where: { active: true }, orderBy: { fullName: "asc" } }),
    logisticsKpis(ctx, where),
    canWrite ? assignableOrders(ctx) : Promise.resolve([]),
  ]);
  const vName = new Map(vehicles.map((v) => [v.id, v.plate]));
  const dName = new Map(drivers.map((d) => [d.id, d.fullName]));

  return (
    <>
      <PageHeader title="Rutas de entrega" subtitle={`${kpis.rutasTotal} rutas en el periodo · ${kpis.novedadesAbiertas} novedades abiertas`} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Rutas" value={kpis.rutasTotal} />
        <Stat label="Finalizadas" value={kpis.rutasFinalizadas} />
        <Stat label="Paradas" value={kpis.paradasEnRuta} />
        <Stat label="Entregadas" value={kpis.paradasEntregadas} hint={kpis.paradasEnRuta ? `${Math.round((kpis.paradasEntregadas / kpis.paradasEnRuta) * 100)} % de cumplimiento` : undefined} />
        <Stat label="Costo de transporte" value={money(kpis.costoTotal, ctx.org.currency)} href="/logistics/costs" />
        <Stat label="Novedades abiertas" value={kpis.novedadesAbiertas} href="/logistics/incidents" />
      </div>
      <RangeFilter from={from} to={to} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Ruta", "Fecha", "Vehículo", "Conductor", "Paradas", "Estado"]} empty={routes.length === 0}>
            {routes.map((r) => (
              <tr key={r.id} className="hover:bg-[var(--ork-lavender)]/10">
                <td className={`${td} font-mono text-xs`}><Link href={`/logistics/routes/${r.id}`} className="font-semibold text-[var(--ork-violet)] underline">{r.number}</Link></td>
                <td className={td}>{date(r.date)}</td>
                <td className={td}>{vName.get(r.vehicleId) ?? "—"}</td>
                <td className={td}>{dName.get(r.driverId) ?? "—"}</td>
                <td className={`${td} tabular-nums`}>{r.stops.filter((s) => s.status === "DELIVERED").length}/{r.stops.length}</td>
                <td className={td}><OpsBadge kind="routeStatus" value={r.status} /></td>
              </tr>
            ))}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Nueva ruta">
            {vehicles.length === 0 || drivers.length === 0 ? (
              <p className="text-sm text-slate-500">Registra al menos un <Link href="/logistics/vehicles" className="underline">vehículo</Link> y un <Link href="/logistics/drivers" className="underline">conductor</Link>.</p>
            ) : (
              <ActionForm action={saveRoute} className="space-y-3">
                <Field label="Fecha"><input type="date" name="date" defaultValue={todayKey()} required className={input} /></Field>
                <Field label="Vehículo"><select name="vehicleId" className={input}>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></Field>
                <Field label="Conductor"><select name="driverId" className={input}>{drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}</select></Field>
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-600">Pedidos por entregar ({pending.length})</span>
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {pending.length === 0 && <p className="text-xs text-slate-400">No hay pedidos pendientes sin ruta.</p>}
                    {pending.map((o) => (
                      <label key={o.id} className="flex items-start gap-2 text-xs">
                        <input type="checkbox" name="salesOrderIds" value={o.id} className="mt-0.5" />
                        <span><strong className="font-mono">{o.number}</strong> · {o.customer.name}<span className="block text-slate-400">{o.customer.address || "sin dirección"}{o.customer.city ? ` · ${o.customer.city}` : ""}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
                <Field label="Notas"><textarea name="notes" rows={2} className={input} /></Field>
                <SubmitButton className={btn.primary}>Crear ruta</SubmitButton>
              </ActionForm>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
