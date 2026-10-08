import { notFound, redirect } from "next/navigation";
import { requireContext } from "@/lib/core/context";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { entityType, lineType, relationChoices } from "@/lib/apps/custom-objects";
import { orgUsers } from "@/lib/core/members";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CustomFieldInputs } from "@/components/custom-fields";
import { CustomLines } from "@/components/custom-lines";
import { btn, Card, Empty, PageHeader } from "@/components/ui";
import { saveRecord } from "../../actions";

export default async function NewCustomRecord({ params }: PageProps<"/x/[entity]/new">) {
  const ctx = await requireContext();
  const { entity: key } = await params;
  const ent = await ctx.db.customEntity.findFirst({ where: { key, active: true } });
  if (!ent) notFound();
  if (!ctx.can(`custom.${key}.write`)) redirect(`/forbidden?p=custom.${key}.write`);
  const [defs, lineDefs, relations, users] = await Promise.all([
    getFieldDefs(ctx.db, entityType(key)), ent.hasLines ? getFieldDefs(ctx.db, lineType(key)) : [], relationChoices(ctx), orgUsers(ctx),
  ]);
  return (
    <>
      <PageHeader title={`Nuevo · ${ent.label}`} crumbs={[{ label: ent.labelPlural, href: `/x/${key}` }, { label: "Nuevo" }]} />
      <Card>
        {defs.length === 0 ? <Empty title="Este objeto aún no tiene campos">Defínelos en Studio → Campos.</Empty> : (
          <ActionForm action={saveRecord} className="space-y-6">
            <input type="hidden" name="entityKey" value={key} />
            <CustomFieldInputs defs={defs} users={users} relations={relations} legend={null} />
            {ent.hasLines && <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Líneas</p><CustomLines defs={lineDefs.map((d) => ({ key: d.key, label: d.label, type: d.type, options: d.options, required: d.required }))} relations={relations} /></div>}
            <SubmitButton className={btn.primary}>Crear</SubmitButton>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
