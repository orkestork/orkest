import { requireContext } from "@/lib/core/context";
import { launcherApps } from "@/lib/launcher";
import { TopBar } from "@/components/top-bar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireContext();
  const [unread, pendingApprovals] = await Promise.all([
    ctx.db.notification.count({ where: { userId: ctx.user.id, readAt: null } }),
    ctx.db.approval.count({ where: { status: "PENDING", ...(ctx.can("approvals.override") ? {} : { requiredRoleKey: ctx.role.key }) } }),
  ]);
  const orgColor = ctx.org.branding.primaryColor ?? "#6f35b5";

  return (
    <div className="ork-canvas min-h-screen" style={{ ["--org" as string]: orgColor }}>
      <TopBar
        apps={launcherApps(ctx, await ctx.db.customEntity.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }))}
        org={{ id: ctx.orgId, name: ctx.org.branding.displayName ?? ctx.org.name, color: orgColor }}
        memberships={ctx.memberships}
        user={{ name: ctx.user.name, email: ctx.user.email, role: ctx.role.name, isPlatformAdmin: ctx.user.isPlatformAdmin }}
        unread={unread}
        pendingApprovals={pendingApprovals}
      />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
