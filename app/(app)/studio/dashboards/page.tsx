import { requirePermission } from "@/lib/core/context";
import { METRICS } from "@/lib/analytics/metrics";
import type { WidgetTemplate } from "@/lib/templates/industries";
import { btn, Card, PageHeader } from "@/components/ui";
import { saveDashboard } from "../actions";

export const metadata = { title: "Dashboards" };

export default async function Dashboards() {
  const ctx = await requirePermission("studio.manage");
  const dash = await ctx.db.dashboard.findFirst({ where: { isDefault: true } });
  const current = (dash?.widgets ?? []) as WidgetTemplate[];
  const options: WidgetTemplate[] = [
    ...METRICS.filter((m) => ctx.hasModule(m.module)).map((m) => ({ type: "kpi" as const, metric: m.key, title: m.label })),
    ...(ctx.hasModule("radar") ? [{ type: "insights" as const, title: "Radar" }] : []),
    { type: "approvals", title: "Aprobaciones pendientes" },
    { type: "tasks", title: "Mis tareas" },
  ];
  const on = (w: WidgetTemplate) => current.some((c) => c.type === w.type && c.metric === w.metric);
  return (
    <>
      <PageHeader title="Dashboard de inicio" crumbs={[{ label: "Studio", href: "/studio" }, { label: "Dashboards" }]} subtitle="Cada usuario solo verá los widgets de apps activas y para los que su rol tiene permiso." />
      <Card className="max-w-xl">
        <form action={saveDashboard} className="space-y-2">
          {options.map((w) => (
            <label key={`${w.type}:${w.metric ?? ""}`} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input type="checkbox" name="widget" value={JSON.stringify(w)} defaultChecked={on(w)} />
              <span className="flex-1">{w.title}</span>
              <span className="text-xs text-slate-400">{w.type === "kpi" ? "Indicador" : "Panel"}</span>
            </label>
          ))}
          <button className={`${btn.primary} mt-3`}>Guardar dashboard</button>
        </form>
      </Card>
    </>
  );
}
