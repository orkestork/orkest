import Link from "@/components/plink";
import { requirePermission } from "@/lib/core/context";
import { CUSTOM_ICONS, entityType, lineType } from "@/lib/apps/custom-objects";
import { AppIcon } from "@/components/app-icons";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { saveCustomEntity } from "../../x/actions";

export const metadata = { title: "Objetos personalizados" };

export default async function CustomObjects() {
  const ctx = await requirePermission("studio.manage");
  const ents = await ctx.db.customEntity.findMany({ orderBy: { createdAt: "asc" } });
  const counts = await Promise.all(ents.map((e) => ctx.db.customRecord.count({ where: { entityKey: e.key } })));
  const fields = await ctx.db.customFieldDefinition.groupBy({ by: ["entityType"], where: { entityType: { startsWith: "x:" } }, _count: true });
  const fc = (t: string) => fields.find((f) => f.entityType === t)?._count ?? 0;
  return (
    <>
      <PageHeader title="Objetos personalizados" crumbs={[{ label: "Studio", href: "/studio" }, { label: "Objetos" }]}
        subtitle="Crea entidades propias de la empresa (visitas técnicas, solicitudes internas, inspecciones…) con campos, líneas, workflow, permisos y automatizaciones. Aparecen como una app más en el inicio." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-4 sm:grid-cols-2 lg:col-span-2">
          {ents.map((e, i) => (
            <Card key={e.id}>
              <div className="flex gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-black/5 bg-white shadow-sm"><AppIcon name={e.icon} size={30} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{e.labelPlural}</p>
                  <p className="text-xs text-slate-500"><code>{entityType(e.key)}</code> · prefijo {e.prefix} · {counts[i]} registros</p>
                  <p className="mt-1 text-xs text-slate-500">{fc(entityType(e.key))} campos{e.hasLines ? ` · ${fc(lineType(e.key))} campos de línea` : ""}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Link href={`/x/${e.key}`} className={btn.small}>Abrir</Link>
                    <Link href={`/studio/fields?entity=${encodeURIComponent(entityType(e.key))}`} className={btn.small}>Campos</Link>
                    <Link href="/studio/workflows" className={btn.small}>Workflow</Link>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {ents.length === 0 && <p className="text-sm text-slate-400">Aún no hay objetos personalizados.</p>}
        </div>
        <Card title="Nuevo objeto">
          <ActionForm action={saveCustomEntity} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nombre *"><input name="label" required className={input} placeholder="Visita técnica" /></Field>
              <Field label="Plural *"><input name="labelPlural" required className={input} placeholder="Visitas técnicas" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Clave *" hint="minúsculas"><input name="key" required className={input} placeholder="visita" /></Field>
              <Field label="Prefijo"><input name="prefix" maxLength={5} className={input} placeholder="VT" /></Field>
            </div>
            <Field label="Estados del flujo" hint="En orden, separados por coma. Se agrega «Cancelado»."><input name="states" className={input} placeholder="Programada, En curso, Realizada, Cerrada" /></Field>
            <Field label="Ícono">
              <div className="grid grid-cols-6 gap-1.5">
                {CUSTOM_ICONS.map((ic, i) => (
                  <label key={ic} className="grid cursor-pointer place-items-center rounded-lg border border-slate-200 p-1.5 has-[:checked]:border-[var(--ork-violet)] has-[:checked]:bg-[var(--ork-lavender)]/20">
                    <input type="radio" name="icon" value={ic} defaultChecked={i === 0} className="sr-only" /><AppIcon name={ic} size={24} />
                  </label>
                ))}
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="hasLines" /> Tiene líneas (detalle de productos, ítems…)</label>
            <SubmitButton className={btn.primary}>Crear y definir campos →</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
