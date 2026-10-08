import { notFound, redirect } from "next/navigation";
import { requireContext } from "@/lib/core/context";
import { formatFieldValue, getFieldDefs } from "@/lib/core/custom-fields";
import { entityType, lineType, relationChoices } from "@/lib/apps/custom-objects";
import { orgUsers } from "@/lib/core/members";
import { getEntity } from "@/lib/core/entities";
import { WorkflowBar } from "@/components/workflow-bar";
import { ActivityTimeline } from "@/components/activity";
import { CustomFieldValues } from "@/components/custom-fields";
import { Card, PageHeader, Table, td } from "@/components/ui";
import { dateTime } from "@/lib/ui/format";

export default async function CustomRecordDetail({ params }: PageProps<"/x/[entity]/[id]">) {
  const ctx = await requireContext();
  const { entity: key, id } = await params;
  const ent = await ctx.db.customEntity.findFirst({ where: { key, active: true } });
  if (!ent) notFound();
  if (!ctx.can(`custom.${key}.read`)) redirect(`/forbidden?p=custom.${key}.read`);
  const rec = await ctx.db.customRecord.findFirst({ where: { id, entityKey: key }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!rec) notFound();
  const [defs, lineDefs, relations, users, facts] = await Promise.all([
    getFieldDefs(ctx.db, entityType(key)), ent.hasLines ? getFieldDefs(ctx.db, lineType(key)) : [], relationChoices(ctx), orgUsers(ctx),
    getEntity(entityType(key)).load(ctx.db, rec.id),
  ]);
  const umap = new Map(users.map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title={`${ent.label} ${rec.number}`} crumbs={[{ label: ent.labelPlural, href: `/x/${key}` }, { label: rec.number }]}
        subtitle={`Creado por ${rec.ownerId ? umap.get(rec.ownerId) : "—"} · ${dateTime(rec.createdAt)}`} />
      <div className="mb-6"><WorkflowBar ctx={ctx} entityType={entityType(key)} entity={facts ?? {}} /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Información"><CustomFieldValues defs={defs} values={rec.data as Record<string, unknown>} users={umap} relations={relations} /></Card>
          {ent.hasLines && (
            <Card title="Líneas" padded={false}>
              <Table head={lineDefs.map((d) => d.label)} empty={rec.lines.length === 0}>
                {rec.lines.map((l) => <tr key={l.id}>{lineDefs.map((d) => <td key={d.id} className={td}>{formatFieldValue(d, (l.data as Record<string, unknown>)[d.key], umap, relations)}</td>)}</tr>)}
              </Table>
            </Card>
          )}
        </div>
        <ActivityTimeline ctx={ctx} entityType={entityType(key)} entityId={rec.id} canWrite={ctx.can(`custom.${key}.write`)} />
      </div>
    </>
  );
}
