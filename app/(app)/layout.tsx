import { requireContext } from "@/lib/core/context";
import { launcherApps } from "@/lib/launcher";
import { TopBar } from "@/components/top-bar";
import { normalizeTheme, themeVars } from "@/lib/ui/theme";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireContext();
  const [unread, pendingApprovals] = await Promise.all([
    ctx.db.notification.count({ where: { userId: ctx.user.id, readAt: null } }),
    ctx.db.approval.count({ where: { status: "PENDING", ...(ctx.can("approvals.override") ? {} : { requiredRoleKey: ctx.role.key }) } }),
  ]);
  // Apariencia de la organización: colores, fondo, tarjetas y paquete de íconos
  const theme = normalizeTheme(ctx.org.branding.theme, ctx.org.branding.primaryColor);
  const orgColor = theme.accent;

  return (
    <div className="ork-canvas min-h-screen" style={themeVars(theme)} data-canvas={theme.canvas} data-tiles={theme.tiles} data-icons={theme.iconPack}>
      <TopBar
        apps={launcherApps(ctx, await ctx.db.customEntity.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }))}
        org={{ id: ctx.orgId, name: ctx.org.branding.displayName ?? ctx.org.name, color: orgColor, logoUrl: ctx.org.branding.logoUrl }}
        memberships={ctx.memberships}
        user={{ name: ctx.user.name, email: ctx.user.email, role: ctx.role.name, isPlatformAdmin: ctx.user.isPlatformAdmin }}
        unread={unread}
        pendingApprovals={pendingApprovals}
      />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
