import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { orgPeople, orgUsers } from "@/lib/core/members";
import { maintenanceKpis } from "@/lib/apps/maintenance";
import { rangeFrom } from "@/lib/apps/ops-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { OpsBadge, opsOptions, RangeFilter } from "@/components/ops";
import { btn, Card, Field, input, PageHeader, Stat, Table, td } from "@/components/ui";
import { dateTime, num } from "@/lib/ui/format";
import { saveOrder } from "./actions";

export const metadata = { title: "Mantenimiento" };

export default async function MaintenanceOrders({ searchParams }: PageProps<"/maintenance">) {
  const ctx = await requireModule("maintenance", "maintenance.read");
  const sp = await searchParams;
  const { from, to, where } = rangeFrom(sp);
  const status = typeof sp.status === "string" ? sp.status : "";
  const [orders, equipment, users, people, kpis] = await Promise.all([
    ctx.db.maintenanceOrder.findMany({
      where: { ...(status ? { status } : { OR: [{ status: { in: ["PENDING", "IN_PROGRESS"] } }, { reportedAt: where }] }) },
      include: { equipment: true }, orderBy: [{ reportedAt: "desc" }], take: 300,
    }),
    ctx.db.equipment.findMany({ orderBy: { name: "asc" } }),
    orgUsers(ctx),
    orgPeople(ctx),
    maintenanceKpis(ctx, where),
  ]);
  const who = new Map(people.map((p) => [p.id, p.name]));
  const rank: Record<string, number> = { IN_PROGRESS: 0, PENDING: 1, DONE: 2, CANCELLED: 3 };
  const prio: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  orders.sort((a, b) => rank[a.status] - rank[b.status] || prio[a.priority] - prio[b.priority] || b.reportedAt.getTime() - a.reportedAt.getTime());

  return (
    <>
      <PageHeader title="Órdenes de mantenimiento" subtitle={`${kpis.ordenesAbiertas} abiertas · ${kpis.equiposFueraServicio} equipos fuera de servicio`} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Abiertas" value={kpis.ordenesAbiertas} href="/maintenance?status=PENDING" />
        <Stat label="Preventivas" value={kpis.preventivas} hint="en el periodo" />
        <Stat label="Correctivas" value={kpis.correctivas} hint="en el periodo" />
        <Stat label="Completadas" value={kpis.completadas} />
        <Stat label="Tiempo muerto" value={`${num(kpis.tiempoMuertoMin)} min`} />
        <Stat label="Equipos detenidos" value={kpis.equiposFueraServicio} href="/maintenance/equipment" />
        <Stat label="Repuestos bajo mínimo" value={kpis.itemsBajoMinimo} href="/maintenance/parts" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RangeFilter from={from} to={to} keep={status ? { status } : {}} />
        <div className="mb-4 flex gap-1 text-xs">
          {[["", "Abiertas + periodo"], ["PENDING", "Pendientes"], ["IN_PROGRESS", "En ejecución"], ["DONE", "Completadas"], ["CANCELLED", "Canceladas"]].map(([k, l]) => (
            <Link key={k} href={`/maintenance?from=${from}&to=${to}${k ? `&status=${k}` : ""}`} className={`rounded-full border px-3 py-1 ${status === k ? "border-[var(--ork-violet)] bg-[var(--ork-violet)] text-white" : "border-slate-300 bg-white"}`}>{l}</Link>
          ))}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Número", "Equipo", "Tipo", "Prioridad", "Estado", "Reportada", "Asignada a"]} empty={orders.length === 0}>
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-[var(--ork-lavender)]/10">
                <td className={`${td} font-mono text-xs`}><Link href={`/maintenance/orders/${o.id}`} className="font-semibold text-[var(--ork-violet)] underline">{o.number}</Link></td>
                <td className={td}>{o.equipment.name}<p className="font-mono text-xs text-slate-400">{o.equipment.code}</p></td>
                <td className={td}><OpsBadge kind="maintenanceType" value={o.type} /></td>
                <td className={td}><OpsBadge kind="priority" value={o.priority} /></td>
                <td className={td}><OpsBadge kind="maintenanceStatus" value={o.status} /></td>
                <td className={td}>{dateTime(o.reportedAt)}<p className="text-xs text-slate-400">{who.get(o.reportedById) ?? ""}</p></td>
                <td className={td}>{o.assignedToId ? who.get(o.assignedToId) : "—"}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {ctx.can("maintenance.write") && (
          <Card title="Nueva orden">
            {equipment.length === 0 ? <p className="text-sm text-slate-500">Primero registra un <Link href="/maintenance/equipment" className="underline">equipo</Link>.</p> : (
              <ActionForm action={saveOrder} className="space-y-3">
                <Field label="Equipo *"><select name="equipmentId" required className={input}>{equipment.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</select></Field>
                <Field label="Tipo"><select name="type" defaultValue="CORRECTIVE" className={input}>{opsOptions("maintenanceType")}</select></Field>
                <Field label="Prioridad"><select name="priority" defaultValue="MEDIUM" className={input}>{opsOptions("priority")}</select></Field>
                <Field label="Descripción de la falla o del trabajo *"><textarea name="description" rows={3} required className={input} /></Field>
                <Field label="Asignar a"><select name="assignedToId" className={input}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
                <SubmitButton className={btn.primary}>Crear orden</SubmitButton>
              </ActionForm>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
