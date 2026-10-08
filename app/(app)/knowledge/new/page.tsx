import { requireModule } from "@/lib/core/context";
import { orgUsers } from "@/lib/core/members";
import { CRITICALITY, KNOWLEDGE_TYPES } from "@/lib/apps/knowledge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader, SEVERITY_LABEL } from "@/components/ui";
import { saveKnowledge } from "../actions";

export default async function NewKnowledge() {
  const ctx = await requireModule("knowledge", "knowledge.write");
  const [users, depts] = await Promise.all([orgUsers(ctx), ctx.db.orgUnit.findMany({ where: { kind: "DEPARTMENT" } })]);
  return (
    <>
      <PageHeader title="Nuevo conocimiento" crumbs={[{ label: "Conocimiento", href: "/knowledge" }, { label: "Nuevo" }]} />
      <Card>
        <ActionForm action={saveKnowledge} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Tipo"><select name="type" className={input}>{KNOWLEDGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
            <Field label="Dueño"><select name="ownerId" defaultValue={ctx.user.id} className={input}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            <Field label="Criticidad"><select name="criticality" defaultValue="MEDIUM" className={input}>{CRITICALITY.map((c) => <option key={c} value={c}>{SEVERITY_LABEL[c]}</option>)}</select></Field>
            <Field label="Departamento"><select name="departmentId" className={input}><option value="">—</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          </div>
          <Field label="Título *"><input name="title" required className={input} /></Field>
          <Field label="Contenido"><textarea name="body" rows={12} className={`${input} font-mono`} /></Field>
          <SubmitButton className={btn.primary}>Crear (borrador)</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
