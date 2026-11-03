import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { orgPeople } from "@/lib/core/members";
import { moldKpis } from "@/lib/apps/plant";
import { rangeFrom } from "@/lib/apps/ops-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { OpsBadge, RangeFilter } from "@/components/ops";
import { btn, Card, Field, input, PageHeader, Stat, Table, td } from "@/components/ui";
import { dateTime } from "@/lib/ui/format";
import { moldStep, mountMoldAction, saveMold } from "../plant-actions";

export const metadata = { title: "Moldes" };

const dur = (a: Date, b: Date | null) => {
  const m = Math.round(((b ?? new Date()).getTime() - a.getTime()) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

/** Moldes y montajes: un molde montado por máquina; enviar a reparación abre la orden de mantenimiento. */
export default async function Molds({ searchParams }: PageProps<"/manufacturing/molds">) {
  const ctx = await requireModule("manufacturing", "manufacturing.read");
  const { from, to, where } = rangeFrom(await searchParams);
  const [molds, machines, open, changes, kpis, people] = await Promise.all([
    ctx.db.mold.findMany({ orderBy: [{ status: "asc" }, { code: "asc" }], include: { _count: { select: { changes: true } } } }),
    ctx.db.workCenter.findMany({ where: { kind: "MACHINE", active: true }, orderBy: { code: "asc" } }),
    ctx.db.moldChange.findMany({ where: { finishedAt: null }, include: { mold: true } }),
    ctx.db.moldChange.findMany({ where: { startedAt: where }, include: { mold: true }, orderBy: { startedAt: "desc" }, take: 300 }),
    moldKpis(ctx, where),
    orgPeople(ctx),
  ]);
  const mName = new Map(machines.map((m) => [m.id, `${m.code} · ${m.name}`]));
  const who = new Map(people.map((p) => [p.id, p.name]));
  const openByMold = new Map(open.map((o) => [o.moldId, o]));
  const busy = new Set(open.map((o) => o.workCenterId));
  const canWrite = ctx.can("manufacturing.write");
  const step = (fields: Record<string, string>, label: string) => (
    <form action={moldStep}>{Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}<button className={btn.small}>{label}</button></form>
  );

  return (
    <>
      <PageHeader title="Moldes" subtitle={`${kpis.moldesEnUso} de ${kpis.moldesTotal} en uso · ${kpis.cambiosAbiertos} montajes abiertos`} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cambios completados" value={kpis.cambiosCompletados} hint="en el periodo" />
        <Stat label="Promedio por cambio" value={`${kpis.tiempoPromedioCambioMin} min`} />
        <Stat label="Tiempo total de cambio" value={`${kpis.tiempoTotalCambioMin} min`} />
        <Stat label="Moldes en uso" value={`${kpis.moldesEnUso}/${kpis.moldesTotal}`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false} title="Moldes">
            <Table head={["Código", "Nombre", "Estado", "Montado en", "Montajes", ""]} empty={molds.length === 0}>
              {molds.map((m) => {
                const o = openByMold.get(m.id);
                return (
                  <tr key={m.id}>
                    <td className={`${td} font-mono text-xs`}>{m.code}</td>
                    <td className={td}>{m.name}</td>
                    <td className={td}><OpsBadge kind="moldStatus" value={m.status} /></td>
                    <td className={td}>{o ? <>{mName.get(o.workCenterId) ?? "—"}<p className="text-xs text-slate-400">desde {dateTime(o.startedAt)} · {dur(o.startedAt, null)}</p></> : "—"}</td>
                    <td className={`${td} tabular-nums`}>{m._count.changes}</td>
                    <td className={td}>
                      {canWrite && (
                        <div className="flex gap-1">
                          {o && step({ op: "unmount", changeId: o.id }, "Desmontar")}
                          {!o && m.status === "AVAILABLE" && step({ op: "repair", moldId: m.id }, "Enviar a reparación")}
                          {!o && m.status === "MAINTENANCE" && step({ op: "available", moldId: m.id }, "Marcar disponible")}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
          <RangeFilter from={from} to={to} />
          <Card padded={false} title="Historial de montajes">
            <Table head={["Molde", "Máquina", "Inicio", "Fin", "Duración", "Responsable", "Notas"]} empty={changes.length === 0}>
              {changes.map((c) => (
                <tr key={c.id}>
                  <td className={td}>{c.mold.code}</td>
                  <td className={td}>{mName.get(c.workCenterId) ?? "—"}</td>
                  <td className={td}>{dateTime(c.startedAt)}</td>
                  <td className={td}>{c.finishedAt ? dateTime(c.finishedAt) : <span className="text-[var(--ork-violet)]">montado</span>}</td>
                  <td className={td}>{dur(c.startedAt, c.finishedAt)}</td>
                  <td className={td}>{who.get(c.changedById) ?? "—"}</td>
                  <td className={td}>{c.notes ?? ""}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        {canWrite && (
          <div className="space-y-6">
            <Card title="Montar molde">
              {machines.length === 0 ? <p className="text-sm text-slate-500">Crea un <Link href="/manufacturing/workcenters" className="underline">centro de trabajo</Link> de tipo «Máquina de inyección».</p> : (
                <ActionForm action={mountMoldAction} className="space-y-3">
                  <Field label="Máquina"><select name="workCenterId" className={input}>{machines.map((m) => <option key={m.id} value={m.id} disabled={busy.has(m.id)}>{m.code} · {m.name}{busy.has(m.id) ? " (ocupada)" : ""}</option>)}</select></Field>
                  <Field label="Molde"><select name="moldId" className={input}>{molds.filter((m) => m.status === "AVAILABLE").map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select></Field>
                  <Field label="Notas"><input name="notes" className={input} /></Field>
                  <SubmitButton className={btn.primary}>Montar</SubmitButton>
                </ActionForm>
              )}
            </Card>
            <Card title="Nuevo molde">
              <ActionForm action={saveMold} className="space-y-3">
                <Field label="Código *"><input name="code" required className={input} /></Field>
                <Field label="Nombre *"><input name="name" required className={input} /></Field>
                <SubmitButton className={btn.secondary}>Crear</SubmitButton>
              </ActionForm>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
