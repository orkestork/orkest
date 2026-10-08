import type { OrgContext } from "./context";

/**
 * Qué se necesita para abrir cada ruta: app activa + permiso.
 * Se evalúa en orden: la regla más específica primero.
 */
const RULES: { prefix: string; module?: string; permission?: string }[] = [
  { prefix: "/sales/quotes/new", module: "sales", permission: "sales.quotes.write" },
  { prefix: "/sales/orders/new", module: "sales", permission: "sales.quotes.write" },
  { prefix: "/sales/pricelists", module: "sales", permission: "sales.quotes.write" },
  { prefix: "/sales", module: "sales", permission: "sales.quotes.read" },
  { prefix: "/crm/customers/new", module: "crm", permission: "crm.customers.write" },
  { prefix: "/crm/opportunities", module: "crm", permission: "crm.opportunities.read" },
  { prefix: "/crm", module: "crm", permission: "crm.customers.read" },
  { prefix: "/products/new", module: "products", permission: "products.write" },
  { prefix: "/products", module: "products", permission: "products.read" },
  { prefix: "/inventory/transfers/new", module: "inventory", permission: "inventory.write" },
  { prefix: "/inventory", module: "inventory", permission: "inventory.read" },
  { prefix: "/purchasing/requisitions/new", module: "purchasing", permission: "purchasing.requisitions.write" },
  { prefix: "/purchasing/requisitions", module: "purchasing", permission: "purchasing.requisitions.read" },
  { prefix: "/purchasing/orders/new", module: "purchasing", permission: "purchasing.write" },
  { prefix: "/purchasing", module: "purchasing", permission: "purchasing.read" },
  { prefix: "/manufacturing/orders/new", module: "manufacturing", permission: "manufacturing.write" },
  { prefix: "/manufacturing/boms/new", module: "manufacturing", permission: "manufacturing.write" },
  { prefix: "/manufacturing", module: "manufacturing", permission: "manufacturing.read" },
  { prefix: "/invoicing/config", module: "invoicing", permission: "invoicing.write" },
  { prefix: "/invoicing", module: "invoicing", permission: "invoicing.read" },
  { prefix: "/quality", module: "quality", permission: "quality.read" },
  { prefix: "/knowledge/new", module: "knowledge", permission: "knowledge.write" },
  { prefix: "/knowledge", module: "knowledge", permission: "knowledge.read" },
  { prefix: "/sonar", module: "sonar", permission: "sonar.read" },
  { prefix: "/radar", module: "radar", permission: "radar.read" },
  { prefix: "/analytics", module: "analytics", permission: "analytics.read" },
  { prefix: "/studio/automations", module: "automations", permission: "automations.manage" },
  { prefix: "/studio", permission: "studio.manage" },
  { prefix: "/import", permission: "import.run" },
  { prefix: "/settings/users", permission: "org.users.manage" },
  { prefix: "/settings/roles", permission: "org.roles.manage" },
  { prefix: "/settings/modules", permission: "org.modules.manage" },
  { prefix: "/settings/integrations", permission: "integrations.manage" },
  { prefix: "/settings/audit", permission: "audit.read" },
  { prefix: "/settings", permission: "org.settings.manage" },
];

export function canOpen(ctx: OrgContext, href: string): boolean {
  if (!href.startsWith("/")) return true;
  const path = href.split(/[?#]/)[0];
  if (path.startsWith("/x/")) return ctx.can(`custom.${path.split("/")[2]}.read`);
  if (path.startsWith("/platform")) return ctx.user.isPlatformAdmin;
  const rule = RULES.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`) || (r.prefix.endsWith("/new") ? false : path.startsWith(r.prefix)));
  if (!rule) return true;
  return (!rule.module || ctx.hasModule(rule.module)) && (!rule.permission || ctx.can(rule.permission));
}
