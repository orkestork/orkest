import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { describe, type ConditionGroup } from "@/lib/core/conditions";
import { EVENT_MAP } from "@/lib/core/event-catalog";
import { ACTION_TYPES } from "@/lib/core/automations";
import { Badge, btn, Card, PageHeader } from "@/components/ui";
import { ago } from "@/lib/ui/format";
import { toggleAutomation } from "../actions";

export const metadata = { title: "Automatizaciones" };
const ACTION = Object.fromEntries(ACTION_TYPES.map((a) => [a.type, a.label]));

export default async function Automations() {
  const ctx = await requireModule("automations", "automations.manage");
  const items = await ctx.db.automation.findMany({ orderBy: [{ kind: "asc" }, { priority: "asc" }] });
  const runs = await ctx.db.automationRun.findMany({ where: { matched: true }, include: { automation: true }, orderBy: { createdAt: "desc" }, take: 10 });
  return (
    <>
      <PageHeader title="Business Rules & Automations" crumbs={[{ label: "Studio", href: "/studio" }, { label: "Automatizaciones" }]}
        subtitle="WHEN evento · IF condiciones · THEN acciones. Se ejecutan solo sobre los datos de esta organización."
        actions={<Link href="/studio/automations/new" className={btn.primary}>Nueva regla</Link>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {items.map((a) => (
            <Card key={a.id} className={a.enabled ? "" : "opacity-60"}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/studio/automations/${a.id}`} className="font-semibold hover:underline">{a.name}</Link>
                    <Badge tone={a.kind === "RULE" ? "violet" : "blue"}>{a.kind === "RULE" ? "Regla de negocio" : "Automatización"}</Badge>
                  </div>
                  <div className="mt-2 space-y-0.5 font-mono text-xs">
                    <p><span className="text-violet-600">WHEN</span> {a.trigger} <span className="text-slate-400">({EVENT_MAP.get(a.trigger)?.label})</span></p>
                    <p><span className="text-violet-600">IF</span> {describe(a.conditions as ConditionGroup)}</p>
                    <p><span className="text-violet-600">THEN</span> {(a.actions as { type: string }[]).map((x) => ACTION[x.type] ?? x.type).join(" · ")}</p>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{a.runCount} ejecuciones{a.lastRunAt ? ` · última ${ago(a.lastRunAt)}` : ""}</p>
                </div>
                <form action={toggleAutomation}><input type="hidden" name="id" value={a.id} /><button className={btn.small}>{a.enabled ? "Desactivar" : "Activar"}</button></form>
              </div>
            </Card>
          ))}
        </div>
        <Card title="Últimas ejecuciones" padded={false}>
          <ul className="divide-y divide-slate-100 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="px-5 py-2.5">
                <p className="font-medium">{r.automation.name}</p>
                <p className="text-xs text-slate-500">{(r.result as string[]).join(" · ") || r.error}</p>
                <p className="text-xs text-slate-400">{ago(r.createdAt)}</p>
              </li>
            ))}
            {runs.length === 0 && <li className="px-5 py-4 text-slate-400">Aún no hay ejecuciones.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
