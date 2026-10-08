import type { OrgContext } from "@/lib/core/context";
import { MODULES } from "@/lib/modules/registry";

/**
 * Lanzador de apps (pantalla de inicio estilo cuadrícula).
 * Se deriva de: apps activas de la organización ∩ permisos del rol ∩ feature flags.
 */
export type LauncherApp = {
  key: string;
  name: string;
  icon: string;
  href: string;
  /** Prefijos de ruta que pertenecen a la app (para la barra superior). */
  match: string[];
  nav: { label: string; href: string }[];
};

const MODULE_LABEL: Record<string, string> = {
  crm: "CRM", sales: "Ventas", products: "Productos", inventory: "Inventario", purchasing: "Compras",
  quality: "Calidad", invoicing: "Facturación", knowledge: "Conocimiento", sonar: "Sonar", radar: "Radar",
  analytics: "Analytics", automations: "Automatizaciones", manufacturing: "Manufactura",
};

const MODULE_MATCH: Record<string, string[]> = {
  crm: ["/crm"], sales: ["/sales"], products: ["/products"], inventory: ["/inventory"], purchasing: ["/purchasing"],
  quality: ["/quality"], invoicing: ["/invoicing"], knowledge: ["/knowledge"], sonar: ["/sonar"], radar: ["/radar"],
  analytics: ["/analytics"], automations: ["/studio/automations"], manufacturing: ["/manufacturing"],
};

export function launcherApps(ctx: OrgContext, customs: { key: string; labelPlural: string; icon: string }[] = []): LauncherApp[] {
  const apps: LauncherApp[] = [
    { key: "dashboard", name: "Tableros", icon: "dashboard", href: "/dashboard", match: ["/dashboard"], nav: [] },
  ];
  if (ctx.flags.has("intelligence.ask") && ctx.can("intelligence.ask")) {
    apps.push({ key: "ask", name: "Ask ORKEST", icon: "ask", href: "/ask", match: ["/ask"], nav: [] });
  }
  apps.push(
    { key: "approvals", name: "Aprobaciones", icon: "approvals", href: "/approvals", match: ["/approvals"], nav: [] },
    { key: "tasks", name: "Tareas", icon: "tasks", href: "/tasks", match: ["/tasks"], nav: [] },
  );

  for (const m of MODULES) {
    if (m.status !== "available" || !ctx.hasModule(m.key)) continue;
    const nav = m.nav.filter((n) => !n.permission || ctx.can(n.permission)).map(({ label, href }) => ({ label, href }));
    if (nav.length === 0) continue;
    apps.push({ key: m.key, name: MODULE_LABEL[m.key] ?? m.name, icon: m.key, href: nav[0].href, match: MODULE_MATCH[m.key] ?? [nav[0].href], nav: nav.length > 1 ? nav : [] });
  }

  for (const c of customs) {
    if (ctx.can(`custom.${c.key}.read`)) apps.push({ key: `x:${c.key}`, name: c.labelPlural, icon: c.icon, href: `/x/${c.key}`, match: [`/x/${c.key}`], nav: [] });
  }

  if (ctx.can("studio.manage")) {
    apps.push({
      key: "studio", name: "Studio", icon: "studio", href: "/studio", match: ["/studio"],
      nav: [
        { label: "Objetos", href: "/studio/objects" }, { label: "Campos", href: "/studio/fields" }, { label: "Workflows", href: "/studio/workflows" },
        ...(ctx.hasModule("automations") ? [{ label: "Reglas", href: "/studio/automations" }] : []),
        { label: "Tableros", href: "/studio/dashboards" }, { label: "Plantillas", href: "/studio/templates" },
      ],
    });
  }
  if (ctx.can("import.run")) apps.push({ key: "import", name: "Importar", icon: "import", href: "/import", match: ["/import"], nav: [] });

  const settingsNav = [
    { label: "Empresa", href: "/settings", p: "org.settings.manage" },
    { label: "Apariencia", href: "/settings/appearance", p: "org.settings.manage" },
    { label: "Usuarios", href: "/settings/users", p: "org.users.manage" },
    { label: "Roles", href: "/settings/roles", p: "org.roles.manage" },
    { label: "API y webhooks", href: "/settings/integrations", p: "integrations.manage" },
    { label: "Auditoría", href: "/settings/audit", p: "audit.read" },
  ].filter((n) => ctx.can(n.p)).map(({ label, href }) => ({ label, href }));
  if (ctx.can("org.modules.manage")) {
    apps.push({ key: "apps", name: "Aplicaciones", icon: "apps", href: "/settings/modules", match: ["/settings/modules"], nav: [] });
  }
  if (settingsNav.length) {
    apps.push({ key: "settings", name: "Ajustes", icon: "settings", href: settingsNav[0].href, match: ["/settings"], nav: settingsNav });
  }
  return apps;
}

/** App activa según la ruta (prefijo más largo). */
export function currentApp(apps: LauncherApp[], pathname: string) {
  let best: { app: LauncherApp; len: number } | null = null;
  for (const app of apps) {
    for (const m of app.match) {
      if ((pathname === m || pathname.startsWith(`${m}/`)) && (!best || m.length > best.len)) best = { app, len: m.length };
    }
  }
  return best?.app ?? null;
}
