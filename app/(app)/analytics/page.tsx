import { requireModule } from "@/lib/core/context";
import { METRICS } from "@/lib/analytics/metrics";
import { Card, PageHeader, Stat } from "@/components/ui";
import { money, num } from "@/lib/ui/format";

export const metadata = { title: "Analytics" };

export default async function Analytics() {
  const ctx = await requireModule("analytics", "analytics.read");
  const metrics = METRICS.filter((m) => ctx.hasModule(m.module) && ctx.can(m.permission));
  const values = await Promise.all(metrics.map((m) => m.compute(ctx)));

  const byStatus = ctx.hasModule("sales") && ctx.can("sales.quotes.read")
    ? await ctx.db.quote.groupBy({ by: ["status"], _sum: { total: true }, _count: true }) : [];
  const max = Math.max(1, ...byStatus.map((s) => Number(s._sum.total ?? 0)));
  const events = await ctx.db.domainEvent.groupBy({ by: ["type"], _count: true, orderBy: { _count: { type: "desc" } }, take: 10 });

  return (
    <>
      <PageHeader title="Analytics" subtitle="Indicadores calculados solo sobre las apps activas y los permisos de tu rol." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {metrics.map((m, i) => <Stat key={m.key} label={m.label} value={m.format === "money" ? money(values[i], ctx.org.currency) : num(values[i])} />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {byStatus.length > 0 && (
          <Card title="Cotizaciones por estado">
            <ul className="space-y-3">
              {byStatus.map((s) => (
                <li key={s.status}>
                  <div className="mb-1 flex justify-between text-sm"><span>{s.status} · {s._count}</span><span className="font-medium">{money(s._sum.total, ctx.org.currency)}</span></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[var(--brand)]" style={{ width: `${(Number(s._sum.total ?? 0) / max) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="Actividad del negocio (eventos)">
          <ul className="space-y-1.5 text-sm">
            {events.map((e) => <li key={e.type} className="flex justify-between"><span className="font-mono text-xs">{e.type}</span><span>{e._count}</span></li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
