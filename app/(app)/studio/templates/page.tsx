import { requirePermission } from "@/lib/core/context";
import { ENTITIES } from "@/lib/core/entities";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { saveDocTemplate } from "../actions";

export const metadata = { title: "Plantillas de documento" };

export default async function Templates() {
  const ctx = await requirePermission("studio.manage");
  const templates = await ctx.db.documentTemplate.findMany({ orderBy: { name: "asc" } });
  const entities = Object.values(ENTITIES).filter((e) => ctx.hasModule(e.module));
  return (
    <>
      <PageHeader title="Document Templates" crumbs={[{ label: "Studio", href: "/studio" }, { label: "Plantillas" }]} subtitle="Variables disponibles: cualquier campo de la entidad, p. ej. {{number}}, {{customer.name}}, {{total}}, {{customFields.clave}}." />
      <div className="space-y-6">
        {templates.map((t) => (
          <Card key={t.id} title={`${t.name} · ${ENTITIES[t.entityType]?.label ?? t.entityType}`}>
            <ActionForm action={saveDocTemplate} className="space-y-3">
              <input type="hidden" name="id" value={t.id} /><input type="hidden" name="entityType" value={t.entityType} />
              <input name="name" defaultValue={t.name} className={input} aria-label="Nombre" />
              <textarea name="body" defaultValue={t.body} rows={8} className={`${input} font-mono text-xs`} aria-label="Contenido" />
              <SubmitButton className={btn.secondary}>Guardar</SubmitButton>
            </ActionForm>
          </Card>
        ))}
        <Card title="Nueva plantilla">
          <ActionForm action={saveDocTemplate} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre"><input name="name" required className={input} /></Field>
              <Field label="Entidad"><select name="entityType" className={input}>{entities.map((e) => <option key={e.type} value={e.type}>{e.label}</option>)}</select></Field>
            </div>
            <textarea name="body" rows={6} className={`${input} font-mono text-xs`} aria-label="Contenido" />
            <SubmitButton className={btn.primary}>Crear</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
