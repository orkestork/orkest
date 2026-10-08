import { requireModule } from "@/lib/core/context";
import { OPERATORS, type Condition, type ConditionGroup } from "@/lib/core/conditions";
import { EVENTS } from "@/lib/core/event-catalog";
import { ACTION_TYPES, type ActionSpec } from "@/lib/core/automations";
import { ENTITIES } from "@/lib/core/entities";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { saveAutomation } from "../../actions";
import { AutomationBuilder } from "./builder";

export default async function AutomationEditor({ params }: PageProps<"/studio/automations/[id]">) {
  const ctx = await requireModule("automations", "automations.manage");
  const { id } = await params;
  const existing = id === "new" ? null : await ctx.db.automation.findUnique({ where: { id } });
  const [roles, defs] = await Promise.all([ctx.db.role.findMany({ orderBy: { name: "asc" } }), ctx.db.customFieldDefinition.findMany({ where: { active: true } })]);

  // Solo eventos de apps activas (o del Core)
  const events = EVENTS.filter((e) => !e.module || ctx.hasModule(e.module));
  const fieldsByEntity: Record<string, { value: string; label: string }[]> = {};
  for (const e of Object.values(ENTITIES)) {
    fieldsByEntity[e.type] = [
      ...e.fields.map((f) => ({ value: f.key, label: f.label })),
      ...(e.hasWorkflow ? [{ value: "status", label: "Estado" }] : []),
      ...defs.filter((d) => d.entityType === e.type).map((d) => ({ value: `customFields.${d.key}`, label: `${d.label} (personalizado)` })),
    ];
  }
  if (fieldsByEntity.nonconformity) fieldsByEntity.nonconformity.push({ value: "severity", label: "Severidad" });
  if (fieldsByEntity.product) fieldsByEntity.product.push({ value: "event.stock", label: "Evento: existencia" });

  const cg = (existing?.conditions ?? { all: [] }) as ConditionGroup;
  const mode = cg.any?.length ? "any" : "all";
  const conditions = ((mode === "any" ? cg.any : cg.all) ?? []).filter((c): c is Condition => "field" in c);

  return (
    <>
      <PageHeader title={existing ? existing.name : "Nueva regla / automatización"} crumbs={[{ label: "Studio", href: "/studio" }, { label: "Automatizaciones", href: "/studio/automations" }, { label: existing ? "Editar" : "Nueva" }]} />
      <Card className="max-w-3xl">
        <ActionForm action={saveAutomation} className="space-y-6">
          {existing && <input type="hidden" name="id" value={existing.id} />}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nombre *"><input name="name" required defaultValue={existing?.name} className={input} /></Field>
            <Field label="Tipo"><select name="kind" defaultValue={existing?.kind ?? "AUTOMATION"} className={input}><option value="RULE">Regla de negocio</option><option value="AUTOMATION">Automatización</option></select></Field>
            <Field label="Descripción"><input name="description" defaultValue={existing?.description ?? ""} className={input} /></Field>
          </div>
          <AutomationBuilder
            events={events.map((e) => ({ type: e.type, label: e.label, entityType: e.entityType }))}
            fieldsByEntity={fieldsByEntity}
            operators={OPERATORS}
            actionTypes={ACTION_TYPES.map((a) => ({ value: a.type, label: a.label }))}
            roles={roles.map((r) => ({ value: r.key, label: r.name }))}
            initial={{ trigger: existing?.trigger ?? "", mode, conditions, actions: (existing?.actions ?? []) as ActionSpec[] as never }}
          />
          <SubmitButton className={btn.primary}>Guardar</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
