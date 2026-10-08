import Link from "@/components/plink";
import { requireContext } from "@/lib/core/context";
import { launcherApps } from "@/lib/launcher";
import { AppIcon } from "@/components/app-icons";
import { visibleInsightWhere } from "@/lib/radar/visibility";

export const metadata = { title: "Inicio" };

/** Inicio: lanzador de apps. Cada organización ve solo sus apps activas y permitidas. */
export default async function Home() {
  const ctx = await requireContext();
  const apps = launcherApps(ctx, await ctx.db.customEntity.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }));
  const [alerts, approvals, tasks] = await Promise.all([
    ctx.hasModule("radar") && ctx.can("radar.read") ? ctx.db.insight.count({ where: { ...visibleInsightWhere(ctx), status: "OPEN", severity: { in: ["HIGH", "CRITICAL"] } } }) : 0,
    ctx.db.approval.count({ where: { status: "PENDING", ...(ctx.can("approvals.override") ? {} : { requiredRoleKey: ctx.role.key }) } }),
    ctx.db.task.count({ where: { assigneeId: ctx.user.id, status: "OPEN" } }),
  ]);
  const chips = [
    alerts > 0 && { href: "/radar", label: `${alerts} alertas importantes en Radar`, tone: "bg-[var(--ork-pink)] text-white" },
    approvals > 0 && { href: "/approvals", label: `${approvals} aprobaciones esperan por ti`, tone: "bg-[var(--ork-purple)] text-white" },
    tasks > 0 && { href: "/tasks", label: `${tasks} tareas abiertas`, tone: "bg-white text-[var(--ork-ink)] border border-[var(--ork-rule)]" },
  ].filter(Boolean) as { href: string; label: string; tone: string }[];

  return (
    <div className="mx-auto max-w-[920px] pb-20 pt-6 sm:pt-12">
      {chips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {chips.map((c) => <Link key={c.href} href={c.href} className={`rounded-full px-4 py-1.5 text-sm font-medium transition hover:scale-[1.03] ${c.tone}`}>{c.label} →</Link>)}
        </div>
      )}

      <div className="mt-10 grid grid-cols-3 gap-x-3 gap-y-9 sm:grid-cols-4 md:grid-cols-6">
        {apps.map((a) => (
          <Link key={a.key} href={a.href} className="flex flex-col items-center gap-3 rounded-3xl text-center outline-none">
            <span className="app-tile grid h-[84px] w-[84px] place-items-center sm:h-[96px] sm:w-[96px]">
              <AppIcon name={a.icon} size={58} />
            </span>
            <span className="max-w-[124px] text-[13px] font-medium leading-tight text-stone-800">{a.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
