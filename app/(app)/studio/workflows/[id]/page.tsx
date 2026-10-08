import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/core/context";
import { describe, OPERATORS, type ConditionGroup } from "@/lib/core/conditions";
import type { TransitionApproval } from "@/lib/core/workflow";
import { getEntity } from "@/lib/core/entities";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader } from "@/components/ui";
import { addState, addTransition, deleteTransition } from "../../actions";

const COLORS = ["slate", "blue", "indigo", "violet", "emerald", "amber", "rose", "cyan"];

export default async function WorkflowEditor({ params }: PageProps<"/studio/workflows/[id]">) {
  const ctx = await requirePermission("studio.manage");
  const { id } = await params;
  const wf = await ctx.db.workflow.findUnique({ where: { id }, include: { states: { orderBy: { position: "asc" } }, transitions: { orderBy: { position: "asc" } } } });
  if (!wf) notFound();
  const roles = await ctx.db.role.findMany();
  const entity = getEntity(wf.entityType);
  const numericCustom = (await ctx.db.customFieldDefinition.findMany({ where: { entityType: wf.entityType, type: { in: ["number", "currency"] } } })).map((d) => ({ key: `customFields.${d.key}`, label: d.label }));
  const fields = [...entity.fields.filter((f) => f.type === "currency" || f.type === "number"), ...numericCustom, { key: "status", label: "Estado" }];
  const label = (k: string) => k === "*" ? "Cualquiera" : wf.states.find((s) => s.key === k)?.label ?? k;
  const editable = ctx.flags.has("studio.workflow_editor");

  return (
    <>
      <PageHeader title={wf.name} crumbs={[{ label: "Studio", href: "/studio" }, { label: "Workflows", href: "/studio/workflows" }, { label: wf.name }]} subtitle={`Entidad: ${wf.entityType.startsWith("x:") ? "objeto personalizado" : entity.labelPlural}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Estados">
            <div className="flex flex-wrap gap-2">
              {wf.states.map((s) => <Badge key={s.id} tone={s.color}>{s.label}{s.isInitial ? " · inicial" : ""}{s.isFinal ? " · final" : ""}</Badge>)}
            </div>
          </Card>
          <Card title="Transiciones" padded={false}>
            <ul className="divide-y divide-slate-100">
              {wf.transitions.map((t) => {
                const ap = t.approval as TransitionApproval | null;
                return (
                  <li key={t.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t.label}</span>
                      <span className="text-slate-500">{label(t.fromKey)} → {label(t.toKey)}</span>
                      {t.permission && <Badge>{t.permission}</Badge>}
                      {editable && <form action={deleteTransition} className="ml-auto"><input type="hidden" name="workflowId" value={wf.id} /><input type="hidden" name="transitionId" value={t.id} /><button className="text-xs text-rose-600 hover:underline">Eliminar</button></form>}
                    </div>
                    {t.guard && <p className="mt-1 text-xs text-slate-500">Condición: {describe(t.guard as ConditionGroup)}</p>}
                    {ap && <p className="mt-1 text-xs text-amber-700">Aprobación de <b>{ap.role}</b> si {describe(ap.when)} → espera en “{label(ap.pendingState)}”</p>}
                    {Array.isArray(t.actions) && t.actions.length > 0 && <p className="mt-1 text-xs text-slate-500">Acciones: {(t.actions as { type: string }[]).map((a) => a.type).join(", ")}</p>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
        {editable && (
          <div className="space-y-6">
            <Card title="Agregar transición">
              <ActionForm action={addTransition} className="space-y-3">
                <input type="hidden" name="workflowId" value={wf.id} />
                <Field label="Nombre de la acción *"><input name="label" required className={input} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Desde"><select name="fromKey" className={input}><option value="*">Cualquiera</option>{wf.states.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
                  <Field label="Hacia"><select name="toKey" className={input}>{wf.states.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
                </div>
                <Field label="Permiso requerido"><input name="permission" defaultValue={entity.writePermission} className={input} /></Field>
                <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <legend className="px-1 text-xs font-medium text-slate-500">Condición (opcional)</legend>
                  <select name="guardField" className={input}><option value="">Sin condición</option>{fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
                  <div className="grid grid-cols-2 gap-2">
                    <select name="guardOp" className={input}>{OPERATORS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}</select>
                    <input name="guardValue" className={input} placeholder="valor" />
                  </div>
                </fieldset>
                <fieldset className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                  <legend className="px-1 text-xs font-medium text-amber-700">Aprobación (opcional)</legend>
                  <div className="grid grid-cols-3 gap-2">
                    <select name="approvalField" className={input}><option value="">—</option>{fields.filter((f) => f.key !== "status").map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
                    <select name="approvalOp" className={input}><option value="gt">mayor que</option><option value="gte">mayor o igual</option></select>
                    <input name="approvalValue" type="number" className={input} placeholder="50000000" />
                  </div>
                  <select name="approvalRole" className={input}>{roles.map((r) => <option key={r.key} value={r.key}>Aprueba: {r.name}</option>)}</select>
                  <select name="pendingState" className={input}>{wf.states.map((s) => <option key={s.key} value={s.key}>Mientras tanto: {s.label}</option>)}</select>
                </fieldset>
                <SubmitButton className={btn.primary}>Agregar transición</SubmitButton>
              </ActionForm>
            </Card>
            <Card title="Agregar estado">
              <ActionForm action={addState} className="space-y-3">
                <input type="hidden" name="workflowId" value={wf.id} />
                <Field label="Nombre *"><input name="label" required className={input} /></Field>
                <Field label="Clave *"><input name="key" required className={input} /></Field>
                <Field label="Color"><select name="color" className={input}>{COLORS.map((c) => <option key={c}>{c}</option>)}</select></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isFinal" /> Estado final</label>
                <SubmitButton className={btn.secondary}>Agregar estado</SubmitButton>
              </ActionForm>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
