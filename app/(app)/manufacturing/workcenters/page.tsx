import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { money } from "@/lib/ui/format";
import { saveWorkCenter } from "../actions";

export const metadata = { title: "Centros de trabajo" };

const KIND: Record<string, string> = { GENERAL: "General", MACHINE: "Máquina de inyección", ASSEMBLY: "Estación de ensamble" };

export default async function WorkCenters() {
  const ctx = await requireModule("manufacturing", "manufacturing.read");
  const [centers, wos, mounts] = await Promise.all([
    ctx.db.workCenter.findMany({ orderBy: { code: "asc" } }),
    ctx.db.workOrder.findMany({ where: { status: { not: "done" }, production: { organizationId: ctx.orgId } } }),
    ctx.db.moldChange.findMany({ where: { finishedAt: null }, include: { mold: true } }),
  ]);
  const mounted = new Map(mounts.map((m) => [m.workCenterId, m.mold]));
  return (
    <>
      <PageHeader title="Centros de trabajo" subtitle="Máquinas, estaciones de ensamble y demás centros donde se ejecutan las operaciones." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Código", "Nombre", "Tipo", "Marca / ubicación", "Costo / hora", "Capacidad", "Carga pendiente"]} empty={centers.length === 0}>
            {centers.map((c) => {
              const load = wos.filter((w) => w.workCenterId === c.id).reduce((s, w) => s + w.expectedMinutes, 0);
              const mold = mounted.get(c.id);
              return (
                <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                  <td className={`${td} font-mono text-xs`}>{c.code}</td>
                  <td className={td}>{c.name}{mold && <p className="text-xs text-[var(--ork-violet)]">Molde {mold.code} montado</p>}</td>
                  <td className={td}><Badge tone={c.kind === "MACHINE" ? "violet" : c.kind === "ASSEMBLY" ? "blue" : "slate"}>{KIND[c.kind] ?? c.kind}</Badge></td>
                  <td className={td}>{[c.brand, c.model].filter(Boolean).join(" ") || "—"}{c.location && <p className="text-xs text-slate-400">{c.location}</p>}</td>
                  <td className={td}>{money(c.costPerHour, ctx.org.currency)}</td><td className={td}>{c.capacity}</td><td className={td}>{Math.round(load / 60 * 10) / 10} h</td>
                </tr>
              );
            })}
          </Table>
        </Card>
        {ctx.can("manufacturing.write") && (
          <Card title="Nuevo centro de trabajo">
            <ActionForm action={saveWorkCenter} className="space-y-3">
              <Field label="Código *"><input name="code" required className={input} /></Field>
              <Field label="Nombre *"><input name="name" required className={input} /></Field>
              <Field label="Tipo"><select name="kind" className={input}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Marca"><input name="brand" className={input} /></Field>
                <Field label="Modelo"><input name="model" className={input} /></Field>
              </div>
              <Field label="Ubicación"><input name="location" className={input} /></Field>
              <Field label="Costo por hora"><input name="costPerHour" type="number" min="0" className={input} /></Field>
              <Field label="Capacidad (en paralelo)"><input name="capacity" type="number" min="1" defaultValue={1} className={input} /></Field>
              <SubmitButton className={btn.primary}>Crear</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
