import Link from "@/components/plink";
import { notFound, redirect } from "next/navigation";
import { requireContext } from "@/lib/core/context";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { formatFieldValue } from "@/lib/core/custom-fields";
import { entityType, relationChoices } from "@/lib/apps/custom-objects";
import { orgUsers } from "@/lib/core/members";
import { stateLabel } from "@/components/workflow-bar";
import { Badge, btn, Card, PageHeader, Table, td } from "@/components/ui";
import { date } from "@/lib/ui/format";

export default async function CustomList({ params }: PageProps<"/x/[entity]">) {
  const ctx = await requireContext();
  const { entity: key } = await params;
  const ent = await ctx.db.customEntity.findFirst({ where: { key, active: true } });
  if (!ent) notFound();
  if (!ctx.can(`custom.${key}.read`)) redirect(`/forbidden?p=custom.${key}.read`);
  const [records, defs, label, relations, users] = await Promise.all([
    ctx.db.customRecord.findMany({ where: { entityKey: key }, orderBy: { createdAt: "desc" }, take: 300 }),
    getFieldDefs(ctx.db, entityType(key)), stateLabel(ctx, entityType(key)), relationChoices(ctx), orgUsers(ctx),
  ]);
  const cols = defs.slice(0, 4);
  const umap = new Map(users.map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title={ent.labelPlural} actions={ctx.can(`custom.${key}.write`) && <Link href={`/x/${key}/new`} className={btn.primary}>Nuevo · {ent.label}</Link>} />
      <Card padded={false}>
        <Table head={["Número", ...cols.map((c) => c.label), "Creado", "Estado"]} empty={records.length === 0}>
          {records.map((r) => { const s = label(r.status); return (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className={td}><Link href={`/x/${key}/${r.id}`} className="font-medium hover:underline">{r.number}</Link></td>
              {cols.map((d) => <td key={d.id} className={td}>{formatFieldValue(d, (r.data as Record<string, unknown>)[d.key], umap, relations)}</td>)}
              <td className={td}>{date(r.createdAt)}</td>
              <td className={td}><Badge tone={s.color}>{s.label}</Badge></td>
            </tr>
          ); })}
        </Table>
      </Card>
    </>
  );
}
