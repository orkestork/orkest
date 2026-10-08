import Link from "@/components/plink";
import { requirePermission } from "@/lib/core/context";
import { getEntityOrNull } from "@/lib/core/entities";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Workflows" };

export default async function Workflows() {
  const ctx = await requirePermission("studio.manage");
  const wfs = await ctx.db.workflow.findMany({ include: { _count: { select: { states: true, transitions: true } } }, orderBy: { entityType: "asc" } });
  const customs = new Map((await ctx.db.customEntity.findMany()).map((c) => [`x:${c.key}`, c.labelPlural]));
  const label = (t: string) => customs.get(t) ?? getEntityOrNull(t)?.labelPlural ?? t;
  return (
    <>
      <PageHeader title="Workflows" crumbs={[{ label: "Studio", href: "/studio" }, { label: "Workflows" }]} subtitle="Cada entidad con ciclo de vida usa el workflow por defecto de la organización. Pipelines y estados personalizados se definen aquí." />
      <div className="grid gap-4 sm:grid-cols-2">
        {wfs.filter((w) => ctx.hasModule(getEntityOrNull(w.entityType)?.module ?? "")).map((w) => (
          <Link key={w.id} href={`/studio/workflows/${w.id}`}>
            <Card className="transition hover:border-[var(--brand)]">
              <p className="font-semibold">{w.name}</p>
              <p className="text-sm text-slate-500">{label(w.entityType)} · {w._count.states} estados · {w._count.transitions} transiciones</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
