import { notFound } from "next/navigation";
import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { orgPeople } from "@/lib/core/members";
import { assignableOrders, mapsUrl } from "@/lib/apps/logistics";
import { ActivityTimeline } from "@/components/activity";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { OpsBadge, opsOptions } from "@/components/ops";
import { btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { date } from "@/lib/ui/format";
import { removeRoute, routeStatus, saveStop, stopAction } from "../../actions";

export const metadata = { title: "Ruta de entrega" };

export default async function RouteDetail({ params }: PageProps<"/logistics/routes/[id]">) {
  const ctx = await requireModule("logistics", "logistics.read");
  const { id } = await params;
  const r = await ctx.db.deliveryRoute.findUnique({ where: { id }, include: { stops: { orderBy: { position: "asc" } } } });
  if (!r) notFound();
  const canWrite = ctx.can("logistics.write");
  const [vehicle, driver, people, pending, customers] = await Promise.all([
    ctx.db.vehicle.findUnique({ where: { id: r.vehicleId } }),
    ctx.db.driver.findUnique({ where: { id: r.driverId } }),
    orgPeople(ctx),
    canWrite && r.status !== "DONE" ? assignableOrders(ctx) : Promise.resolve([]),
    canWrite && r.status !== "DONE" ? ctx.db.customer.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, city: true } }) : Promise.resolve([]),
  ]);
  const url = mapsUrl(r.stops.filter((s) => s.status !== "FAILED"));
  const who = people.find((p) => p.id === r.createdById)?.name;

  return (
    <>
      <PageHeader title={`Ruta ${r.number}`} crumbs={[{ label: "Rutas", href: "/logistics" }, { label: r.number }]}
        subtitle={`${date(r.date)} · ${vehicle?.plate ?? "—"} · ${driver?.fullName ?? "—"}${who ? ` · creada por ${who}` : ""}`}
        actions={<>
          {url && <a href={url} target="_blank" rel="noreferrer" className={btn.secondary}>Ver ruta en el mapa</a>}
          {canWrite && (
            <form action={routeStatus} className="flex gap-1">
              <input type="hidden" name="id" value={r.id} />
              <select name="status" defaultValue={r.status} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm">{opsOptions("routeStatus")}</select>
              <button className={btn.primary}>Actualizar</button>
            </form>
          )}
          {canWrite && r.status === "PLANNED" && <form action={removeRoute}><input type="hidden" name="id" value={r.id} /><button className={btn.danger}>Eliminar</button></form>}
        </>} />
      <div className="mb-4"><OpsBadge kind="routeStatus" value={r.status} />{r.notes && <span className="ml-3 text-sm text-slate-600">{r.notes}</span>}</div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Paradas (${r.stops.length})`} padded={false}>
            <Table head={["#", "Destino", "Dirección", "Teléfono", "Estado", ""]} empty={r.stops.length === 0}>
              {r.stops.map((s, i) => (
                <tr key={s.id}>
                  <td className={`${td} tabular-nums text-slate-400`}>{i + 1}</td>
                  <td className={td}>{s.salesOrderId ? <Link href={`/sales/orders/${s.salesOrderId}`} className="hover:underline">{s.name}</Link> : s.name}{s.notes && <p className="text-xs text-slate-400">{s.notes}</p>}</td>
                  <td className={td}>{s.address || <span className="text-[var(--ork-pink)]">sin dirección</span>}<p className="text-xs text-slate-400">{s.city}</p></td>
                  <td className={td}>{s.phone ?? "—"}</td>
                  <td className={td}><OpsBadge kind="stopStatus" value={s.status} /></td>
                  <td className={td}>
                    {canWrite && (
                      <div className="flex gap-1">
                        {s.status !== "DELIVERED" && <form action={stopAction}><input type="hidden" name="routeId" value={r.id} /><input type="hidden" name="stopId" value={s.id} /><input type="hidden" name="status" value="DELIVERED" /><button className={btn.small}>Entregado</button></form>}
                        {s.status === "PENDING" && <form action={stopAction}><input type="hidden" name="routeId" value={r.id} /><input type="hidden" name="stopId" value={s.id} /><input type="hidden" name="status" value="FAILED" /><button className={btn.small}>No entregado</button></form>}
                        {r.status !== "DONE" && <form action={stopAction}><input type="hidden" name="routeId" value={r.id} /><input type="hidden" name="stopId" value={s.id} /><input type="hidden" name="op" value="remove" /><button className={btn.ghost} title="Quitar de la ruta">✕</button></form>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
          {canWrite && r.status !== "DONE" && (
            <Card title="Agregar parada">
              <ActionForm action={saveStop} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="routeId" value={r.id} />
                <Field label="Pedido o cliente" className="sm:col-span-2">
                  <select name="target" required className={input}>
                    <option value="">—</option>
                    {pending.length > 0 && <optgroup label="Pedidos por entregar">{pending.map((o) => <option key={o.id} value={`so:${o.id}`}>{o.number} · {o.customer.name}</option>)}</optgroup>}
                    <optgroup label="Entrega manual a cliente">{customers.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}{c.city ? ` · ${c.city}` : ""}</option>)}</optgroup>
                  </select>
                </Field>
                <Field label="Dirección" hint="Vacío = la del cliente"><input name="address" className={input} /></Field>
                <Field label="Ciudad"><input name="city" className={input} /></Field>
                <Field label="Notas" className="sm:col-span-2"><input name="notes" className={input} /></Field>
                <SubmitButton className={btn.primary}>Agregar</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
        <ActivityTimeline ctx={ctx} entityType="delivery_route" entityId={r.id} canWrite={false} />
      </div>
    </>
  );
}
