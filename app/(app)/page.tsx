import Link from "@/components/plink";
import { requireContext } from "@/lib/core/context";
import { launcherApps } from "@/lib/launcher";
import { AppIcon, familyOf } from "@/components/app-icons";
import { AppGrid } from "@/components/app-grid";
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
    approvals > 0 && { href: "/approvals", label: `${approvals} aprobaciones esperan por ti`, tone: "bg-[var(--ork-violet)] text-white" },
    tasks > 0 && { href: "/tasks", label: `${tasks} tareas abiertas`, tone: "bg-white text-[var(--ork-ink)] border border-[var(--ork-rule)]" },
  ].filter(Boolean) as { href: string; label: string; tone: string }[];

  return (
    <div className="pb-20">
      <section className="wz-hero relative -mx-4 -mt-6 overflow-hidden sm:-mx-6 sm:mt-0 sm:rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen estática de marca */}
        <img src="/brand/workezt-orca.jpg" alt="" className="absolute inset-y-0 right-0 h-full w-auto max-w-none opacity-60 [mask-image:linear-gradient(90deg,transparent,#000_30%)] sm:opacity-100" />
        <div className="relative px-6 py-9 sm:px-10 sm:py-12">
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-[40px]">
            Tu empresa, en arm<span className="text-[#c4a6ff]">onía.</span>
          </h1>
          <p className="mt-2 text-sm tracking-[0.22em] text-white/70 sm:text-base">Understand · Transform · Scale</p>
        </div>
      </section>

      {chips.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {chips.map((c) => <Link key={c.href} href={c.href} className={`rounded-full px-4 py-1.5 text-sm font-medium transition hover:scale-[1.03] ${c.tone}`}>{c.label} →</Link>)}
        </div>
      )}

      <AppGrid
        items={apps.map((a) => ({
          key: a.key,
          family: familyOf(a.icon),
          tile: (
            <Link href={a.href} className="flex flex-col items-center gap-2.5 rounded-3xl text-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--ork-violet)]">
              <span className="app-tile grid h-[84px] w-[84px] place-items-center sm:h-[96px] sm:w-[96px]">
                <AppIcon name={a.icon} size={76} />
              </span>
              <span className="max-w-[124px] text-[13px] font-medium leading-tight text-stone-800">{a.name}</span>
            </Link>
          ),
        }))}
      />
    </div>
  );
}
