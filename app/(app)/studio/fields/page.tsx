import { requirePermission } from "@/lib/core/context";
import { CUSTOMIZABLE_ENTITIES } from "@/lib/core/entities";
import { FIELD_TYPES, fieldOptions } from "@/lib/core/custom-fields";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader } from "@/components/ui";
import { saveField, toggleField } from "../actions";

export const metadata = { title: "Custom Fields" };
const TYPE = Object.fromEntries(FIELD_TYPES.map((t) => [t.type, t.label]));

const RELATION_TARGETS = [["customer", "Cliente"], ["product", "Producto"], ["supplier", "Proveedor"], ["employee", "Empleado"], ["user", "Usuario"]];

export default async function Fields({ searchParams }: PageProps<"/studio/fields">) {
  const ctx = await requirePermission("studio.manage");
  const { entity } = await searchParams;
  const customs = await ctx.db.customEntity.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const entities = [
    ...customs.flatMap((c) => [
      { type: `x:${c.key}`, labelPlural: `${c.labelPlural} (objeto)`, label: c.label },
      ...(c.hasLines ? [{ type: `x:${c.key}:line`, labelPlural: `${c.labelPlural} · líneas`, label: `${c.label} · línea` }] : []),
    ]),
    ...CUSTOMIZABLE_ENTITIES.filter((e) => ctx.hasModule(e.module)),
  ];
  const defs = await ctx.db.customFieldDefinition.findMany({ orderBy: [{ entityType: "asc" }, { position: "asc" }] });
  return (
    <>
      <PageHeader title="Custom Fields" crumbs={[{ label: "Studio", href: "/studio" }, { label: "Custom Fields" }]} subtitle="Los campos se guardan por organización y aparecen automáticamente en formularios, detalle, listas, importación y condiciones de reglas (customFields.clave)." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {entities.map((e) => {
            const list = defs.filter((d) => d.entityType === e.type);
            return (
              <Card key={e.type} title={e.labelPlural} padded={false}>
                {list.length === 0 ? <p className="px-5 py-4 text-sm text-slate-400">Sin campos personalizados.</p> : (
                  <ul className="divide-y divide-slate-100">
                    {list.map((d) => (
                      <li key={d.id} className={`flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm ${d.active ? "" : "opacity-50"}`}>
                        <span className="font-medium">{d.label}</span>
                        <code className="text-xs text-slate-400">customFields.{d.key}</code>
                        <Badge tone="blue">{TYPE[d.type]}</Badge>
                        {d.required && <Badge tone="amber">Obligatorio</Badge>}
                        {fieldOptions(d).length > 0 && <span className="text-xs text-slate-500">{fieldOptions(d).map((o) => o.label).join(", ")}</span>}
                        <form action={toggleField} className="ml-auto"><input type="hidden" name="id" value={d.id} /><button className={btn.ghost}>{d.active ? "Desactivar" : "Activar"}</button></form>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
        <Card title="Nuevo campo">
          <ActionForm action={saveField} className="space-y-3">
            <Field label="Entidad"><select name="entityType" defaultValue={typeof entity === "string" ? entity : undefined} className={input}>{entities.map((e) => <option key={e.type} value={e.type}>{e.label}</option>)}</select></Field>
            <Field label="Etiqueta *"><input name="label" required className={input} placeholder="Zona comercial" /></Field>
            <Field label="Clave *" hint="Minúsculas y guiones bajos. No se puede cambiar."><input name="key" required className={input} placeholder="commercial_zone" /></Field>
            <Field label="Tipo"><select name="type" className={input}>{FIELD_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</select></Field>
            <Field label="Relación con (tipo Relación)"><select name="relationTarget" className={input}>{RELATION_TARGETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Opciones (listas)" hint="Una por línea. Formato valor:Etiqueta o solo Etiqueta."><textarea name="options" rows={3} className={input} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Mínimo"><input name="min" type="number" className={input} /></Field>
              <Field label="Máximo"><input name="max" type="number" className={input} /></Field>
            </div>
            <Field label="Longitud máxima"><input name="maxLength" type="number" className={input} /></Field>
            <Field label="Patrón (regex)"><input name="pattern" className={input} placeholder="^[A-Z]{3}-\d+$" /></Field>
            <Field label="Mensaje si no cumple el patrón"><input name="patternMessage" className={input} /></Field>
            <Field label="Ayuda"><input name="helpText" className={input} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" /> Obligatorio</label>
            <SubmitButton className={btn.primary}>Crear campo</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
