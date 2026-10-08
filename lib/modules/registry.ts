import type { PermissionDef } from "@/lib/core/permissions";

/**
 * ORKEST Apps. Cada organización activa solo las apps que usa (organization_modules).
 * La navegación, rutas, eventos, detectores de Radar y herramientas de Intelligence
 * consultan este registro: una app desactivada no existe para esa organización.
 */
export type NavItem = { label: string; href: string; permission?: string };

export type ModuleDef = {
  key: string;
  name: string;
  description: string;
  group: "Comercial" | "Operaciones" | "Finanzas" | "Personas" | "Conocimiento" | "Inteligencia" | "Plataforma";
  icon: string; // abreviatura de 2 letras
  status: "available" | "planned";
  dependsOn?: string[];
  nav: NavItem[];
  permissions: PermissionDef[];
};

const rw = (prefix: string, label: string): PermissionDef[] => [
  { key: `${prefix}.read`, label: `Ver ${label}` },
  { key: `${prefix}.write`, label: `Crear / editar ${label}` },
];

export const MODULES: ModuleDef[] = [
  {
    key: "crm", name: "CRM", group: "Comercial", icon: "CR", status: "available",
    description: "Clientes, contactos, oportunidades y actividades.",
    nav: [
      { label: "Clientes", href: "/crm/customers", permission: "crm.customers.read" },
      { label: "Oportunidades", href: "/crm/opportunities", permission: "crm.opportunities.read" },
    ],
    permissions: [...rw("crm.customers", "clientes"), ...rw("crm.opportunities", "oportunidades")],
  },
  {
    key: "sales", name: "Sales", group: "Comercial", icon: "SA", status: "available", dependsOn: ["crm", "products"],
    description: "Cotizaciones con workflow y aprobaciones, pedidos.",
    nav: [
      { label: "Cotizaciones", href: "/sales/quotes", permission: "sales.quotes.read" },
      { label: "Pedidos", href: "/sales/orders", permission: "sales.quotes.read" },
      { label: "Listas de precios", href: "/sales/pricelists", permission: "sales.quotes.write" },
    ],
    permissions: [...rw("sales.quotes", "cotizaciones")],
  },
  {
    key: "products", name: "Products", group: "Operaciones", icon: "PR", status: "available",
    description: "Catálogo de productos y servicios, precios y costos.",
    nav: [{ label: "Productos", href: "/products", permission: "products.read" }],
    permissions: rw("products", "productos"),
  },
  {
    key: "inventory", name: "Inventory", group: "Operaciones", icon: "IN", status: "available", dependsOn: ["products"],
    description: "Almacenes, ubicaciones, transferencias, rutas y reabastecimiento mín/máx.",
    nav: [
      { label: "Existencias", href: "/inventory", permission: "inventory.read" },
      { label: "Transferencias", href: "/inventory/transfers", permission: "inventory.read" },
      { label: "Reabastecimiento", href: "/inventory/replenishment", permission: "inventory.read" },
      { label: "Almacenes", href: "/inventory/warehouses", permission: "inventory.read" },
    ],
    permissions: rw("inventory", "inventario"),
  },
  {
    key: "purchasing", name: "Purchasing", group: "Operaciones", icon: "PU", status: "available",
    description: "Requisiciones, solicitudes de cotización, órdenes de compra con aprobación por monto y recepciones.",
    nav: [
      { label: "Órdenes de compra", href: "/purchasing/orders", permission: "purchasing.read" },
      { label: "Requisiciones", href: "/purchasing/requisitions", permission: "purchasing.requisitions.read" },
      { label: "Proveedores", href: "/purchasing/suppliers", permission: "purchasing.read" },
    ],
    permissions: [
      ...rw("purchasing", "compras y proveedores"),
      { key: "purchasing.approve", label: "Aprobar requisiciones" },
      ...rw("purchasing.requisitions", "requisiciones"),
    ],
  },
  {
    key: "manufacturing", name: "Manufacturing", group: "Operaciones", icon: "MF", status: "available", dependsOn: ["products", "inventory"],
    description: "Listas de materiales (BoM), órdenes de producción, centros de trabajo y planificación de materiales.",
    nav: [
      { label: "Órdenes de producción", href: "/manufacturing/orders", permission: "manufacturing.read" },
      { label: "Listas de materiales", href: "/manufacturing/boms", permission: "manufacturing.read" },
      { label: "Centros de trabajo", href: "/manufacturing/workcenters", permission: "manufacturing.read" },
      { label: "Planificación", href: "/manufacturing/planning", permission: "manufacturing.read" },
    ],
    permissions: rw("manufacturing", "producción"),
  },
  {
    key: "quality", name: "Quality", group: "Operaciones", icon: "QA", status: "available",
    description: "No conformidades, acciones correctivas y desempeño de proveedores.",
    nav: [{ label: "No conformidades", href: "/quality", permission: "quality.read" }],
    permissions: rw("quality", "calidad"),
  },
  {
    key: "hr", name: "Human Resources", group: "Personas", icon: "HR", status: "planned",
    description: "Empleados, cargos, departamentos y novedades.",
    nav: [], permissions: rw("hr", "talento humano"),
  },
  {
    key: "accounting", name: "Accounting", group: "Finanzas", icon: "AC", status: "planned",
    description: "Plan de cuentas, asientos y estados financieros.",
    nav: [], permissions: rw("accounting", "contabilidad"),
  },
  {
    key: "invoicing", name: "Invoicing", group: "Finanzas", icon: "FV", status: "available", dependsOn: ["crm"],
    description: "Facturas, notas crédito, facturas de proveedor, pagos, impuestos y plazos de pago.",
    nav: [
      { label: "Facturas", href: "/invoicing", permission: "invoicing.read" },
      { label: "Proveedores", href: "/invoicing/bills", permission: "invoicing.read" },
      { label: "Pagos", href: "/invoicing/payments", permission: "invoicing.read" },
      { label: "Configuración", href: "/invoicing/config", permission: "invoicing.write" },
    ],
    permissions: rw("invoicing", "facturación"),
  },
  {
    key: "documents", name: "Documents", group: "Conocimiento", icon: "DO", status: "planned",
    description: "Gestión documental con versiones y plantillas.",
    nav: [], permissions: rw("documents", "documentos"),
  },
  {
    key: "knowledge", name: "Knowledge", group: "Conocimiento", icon: "KN", status: "available",
    description: "Artículos, procedimientos, procesos, políticas y manuales con versiones y aprobaciones.",
    nav: [
      { label: "Base de conocimiento", href: "/knowledge", permission: "knowledge.read" },
      { label: "Grafo de conocimiento", href: "/knowledge/graph", permission: "knowledge.read" },
    ],
    permissions: [...rw("knowledge", "conocimiento"), { key: "knowledge.approve", label: "Aprobar conocimiento" }],
  },
  {
    key: "sonar", name: "Sonar", group: "Conocimiento", icon: "SO", status: "available", dependsOn: ["knowledge"],
    description: "Sesiones para convertir conocimiento tácito en capacidades estructuradas.",
    nav: [{ label: "Sesiones Sonar", href: "/sonar", permission: "sonar.read" }],
    permissions: rw("sonar", "Sonar"),
  },
  {
    key: "radar", name: "Radar", group: "Inteligencia", icon: "RA", status: "available",
    description: "Detección transversal de riesgos, oportunidades, retrasos y anomalías.",
    nav: [{ label: "Radar", href: "/radar", permission: "radar.read" }],
    permissions: [{ key: "radar.read", label: "Ver Radar" }, { key: "radar.manage", label: "Gestionar insights" }],
  },
  {
    key: "website", name: "Website", group: "Comercial", icon: "WE", status: "planned",
    description: "Sitio web y formularios conectados al CRM.",
    nav: [], permissions: rw("website", "sitio web"),
  },
  {
    key: "analytics", name: "Analytics", group: "Inteligencia", icon: "AN", status: "available",
    description: "Indicadores, dashboards y reportes.",
    nav: [{ label: "Analytics", href: "/analytics", permission: "analytics.read" }],
    permissions: [{ key: "analytics.read", label: "Ver analytics" }],
  },
  {
    key: "automations", name: "Automations", group: "Inteligencia", icon: "AU", status: "available",
    description: "Motor de automatizaciones y reglas de negocio: WHEN · IF · THEN.",
    nav: [{ label: "Automatizaciones", href: "/studio/automations", permission: "automations.manage" }],
    permissions: [{ key: "automations.manage", label: "Gestionar automatizaciones" }],
  },
];

export const MODULE_MAP = new Map(MODULES.map((m) => [m.key, m]));

export function getModule(key: string) {
  return MODULE_MAP.get(key);
}

/** Devuelve las dependencias faltantes para activar un módulo. */
export function missingDependencies(key: string, enabled: Set<string>): string[] {
  return (getModule(key)?.dependsOn ?? []).filter((d) => !enabled.has(d));
}
