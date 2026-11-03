import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { OpsBadge, opsOptions } from "@/components/ops";
import { btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { date } from "@/lib/ui/format";
import Link from "@/components/plink";
import { equipmentStatus, saveEquipment } from "../actions";

export const metadata = { title: "Equipos" };

export default async function Equipment() {
  const ctx = await requireModule("maintenance", "maintenance.read");
  const [equipment, centers, molds, orders] = await Promise.all([
    ctx.db.equipment.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
    ctx.db.workCenter.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    ctx.db.mold.findMany({ orderBy: { code: "asc" } }),
    ctx.db.maintenanceOrder.findMany({ select: { equipmentId: true, status: true, completedAt: true } }),
  ]);
  const wc = new Map(centers.map((c) => [c.id, c]));
  const mold = new Map(molds.map((m) => [m.id, m]));
  const canWrite = ctx.can("maintenance.write");
  return (
    <>
      <PageHeader title="Equipos" subtitle="Máquinas, moldes, herramientas e infraestructura con su historial de mantenimiento." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Código", "Equipo", "Tipo", "Vinculado a", "Órdenes", "Último cierre", "Estado"]} empty={equipment.length === 0}>
            {equipment.map((e) => {
              const mine = orders.filter((o) => o.equipmentId === e.id);
              const last = mine.filter((o) => o.completedAt).sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];
              const open = mine.filter((o) => ["PENDING", "IN_PROGRESS"].includes(o.status)).length;
              return (
                <tr key={e.id}>
                  <td className={`${td} font-mono text-xs`}>{e.code}</td>
                  <td className={td}>{e.name}{e.location && <p className="text-xs text-slate-400">{e.location}</p>}</td>
                  <td className={td}><OpsBadge kind="equipmentType" value={e.type} /></td>
                  <td className={td}>{e.workCenterId ? wc.get(e.workCenterId)?.name : e.moldId ? `Molde ${mold.get(e.moldId)?.code ?? ""}` : "—"}</td>
                  <td className={td}>{mine.length}{open > 0 && <Link href={`/maintenance?status=PENDING`} className="ml-1 text-xs text-[var(--ork-pink)]">({open} abiertas)</Link>}</td>
                  <td className={td}>{date(last?.completedAt)}</td>
                  <td className={td}>
                    {canWrite ? (
                      <form action={equipmentStatus} className="flex gap-1">
                        <input type="hidden" name="id" value={e.id} />
                        <select name="status" defaultValue={e.status} className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs">{opsOptions("equipmentStatus")}</select>
                        <button className={btn.small}>OK</button>
                      </form>
                    ) : <OpsBadge kind="equipmentStatus" value={e.status} />}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Nuevo equipo">
            <ActionForm action={saveEquipment} className="space-y-3">
              <Field label="Código *"><input name="code" required className={input} /></Field>
              <Field label="Nombre *"><input name="name" required className={input} /></Field>
              <Field label="Tipo"><select name="type" defaultValue="MACHINE" className={input}>{opsOptions("equipmentType")}</select></Field>
              <Field label="Máquina / centro de trabajo"><select name="workCenterId" className={input}><option value="">—</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
              <Field label="Molde"><select name="moldId" className={input}><option value="">—</option>{molds.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select></Field>
              <Field label="Ubicación"><input name="location" className={input} /></Field>
              <SubmitButton className={btn.primary}>Crear</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
