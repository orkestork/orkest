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
    key: "campaigns", name: "Campaigns", group: "Comercial", icon: "CA", status: "available",
    description: "Campañas de pauta por vendedor con matriz diaria, ROAS y calendario de cumplimiento del reporte de ventas.",
    nav: [
      { label: "Campañas", href: "/campaigns", permission: "campaigns.read" },
      { label: "Calendario", href: "/campaigns/calendar", permission: "campaigns.read" },
    ],
    permissions: [...rw("campaigns", "campañas"), { key: "campaigns.manage", label: "Configurar calendario comercial" }],
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
      { label: "Inyección", href: "/manufacturing/runs", permission: "manufacturing.read" },
      { label: "Ensamble", href: "/manufacturing/assembly", permission: "manufacturing.read" },
      { label: "Moldes", href: "/manufacturing/molds", permission: "manufacturing.read" },
      { label: "Informes", href: "/manufacturing/reports", permission: "manufacturing.read" },
    ],
    permissions: rw("manufacturing", "producción"),
  },
  {
    key: "maintenance", name: "Maintenance", group: "Operaciones", icon: "MT", status: "available",
    description: "Equipos, órdenes de mantenimiento preventivo y correctivo con firma, repuestos y cotizaciones.",
    nav: [
      { label: "Órdenes", href: "/maintenance", permission: "maintenance.read" },
      { label: "Equipos", href: "/maintenance/equipment", permission: "maintenance.read" },
      { label: "Repuestos y herramientas", href: "/maintenance/parts", permission: "maintenance.read" },
      { label: "Cotizaciones", href: "/maintenance/quotes", permission: "maintenance.read" },
      { label: "Informes", href: "/maintenance/reports", permission: "maintenance.read" },
    ],
    permissions: rw("maintenance", "mantenimiento"),
  },
  {
    key: "logistics", name: "Logistics", group: "Operaciones", icon: "LG", status: "available", dependsOn: ["crm"],
    description: "Rutas de entrega, conductores, vehículos con revisión pre-operacional, costos de transporte y novedades.",
    nav: [
      { label: "Rutas", href: "/logistics", permission: "logistics.read" },
      { label: "Vehículos", href: "/logistics/vehicles", permission: "logistics.read" },
      { label: "Conductores", href: "/logistics/drivers", permission: "logistics.read" },
      { label: "Costos", href: "/logistics/costs", permission: "logistics.read" },
      { label: "Novedades", href: "/logistics/incidents", permission: "logistics.read" },
      { label: "Informes", href: "/logistics/reports", permission: "logistics.read" },
    ],
    permissions: rw("logistics", "logística"),
  },
  {
    key: "quality", name: "Quality", group: "Operaciones", icon: "QA", status: "available",
    description: "No conformidades, acciones correctivas y desempeño de proveedores.",
    nav: [{ label: "No conformidades", href: "/quality", permission: "quality.read" }],
    permissions: rw("quality", "calidad"),
  },
  {
    key: "hr", name: "Human Resources", group: "Personas", icon: "HR", status: "available",
    description: "Colaboradores, ausencias y vacaciones, horas extras, asistencia, nómina, certificados, centro de solicitudes, dotación, selección, noticias, beneficios y portal del colaborador.",
    nav: [
      { label: "Resumen", href: "/hr", permission: "hr.employees.read" },
      { label: "Colaboradores", href: "/hr/employees", permission: "hr.employees.read" },
      { label: "Bandeja", href: "/hr/inbox", permission: "hr.approve" },
      { label: "Ausencias", href: "/hr/time-off", permission: "hr.timeoff.read" },
      { label: "Nómina", href: "/hr/payroll", permission: "hr.payroll.read" },
      { label: "Solicitudes", href: "/hr/tickets", permission: "hr.tickets.read" },
      { label: "Selección", href: "/hr/recruiting", permission: "hr.recruiting.read" },
      { label: "Comunicación", href: "/hr/news", permission: "hr.comms.read" },
      { label: "Reportes", href: "/hr/reports", permission: "hr.employees.read" },
    ],
    permissions: [
      ...rw("hr.employees", "colaboradores, departamentos, documentos y dotación"),
      ...rw("hr.timeoff", "ausencias, horas extras y asistencia"),
      ...rw("hr.payroll", "nómina, salarios y certificados"),
      ...rw("hr.tickets", "centro de solicitudes"),
      ...rw("hr.recruiting", "selección de personal"),
      ...rw("hr.comms", "noticias y beneficios"),
      { key: "hr.approve", label: "Aprobar solicitudes de colaboradores (vacaciones, permisos, horas extras, beneficios)" },
      { key: "hr.portal", label: "Usar el portal del colaborador" },
    ],
  },
  {
    key: "employee_portal", name: "Employee Portal", group: "Personas", icon: "MP", status: "available", dependsOn: ["hr"],
    description: "Autoservicio del colaborador: vacaciones, permisos, incapacidades, horas extras, solicitudes, nómina, beneficios, documentos, noticias y equipo.",
    nav: [
      { label: "Inicio", href: "/empleado", permission: "hr.portal" },
      { label: "Ausencias", href: "/empleado/ausencias", permission: "hr.portal" },
      { label: "Horas extras", href: "/empleado/horas-extras", permission: "hr.portal" },
      { label: "Solicitudes", href: "/empleado/solicitudes", permission: "hr.portal" },
      { label: "Nómina", href: "/empleado/nomina", permission: "hr.portal" },
      { label: "Beneficios", href: "/empleado/beneficios", permission: "hr.portal" },
      { label: "Documentos", href: "/empleado/documentos", permission: "hr.portal" },
      { label: "Noticias", href: "/empleado/noticias", permission: "hr.portal" },
      { label: "Equipo", href: "/empleado/equipo", permission: "hr.portal" },
      { label: "Mi perfil", href: "/empleado/perfil", permission: "hr.portal" },
    ],
    permissions: [],
  },
  {
    key: "finance", name: "Finance", group: "Finanzas", icon: "FI", status: "available",
    description: "Ingresos, gastos, gastos fijos, presupuesto, flujo del mes y rentabilidad por cliente. Toma facturas, compras, nómina y flota de las demás apps.",
    nav: [
      { label: "Resumen", href: "/finance", permission: "finance.read" },
      { label: "Gastos", href: "/finance/expenses", permission: "finance.read" },
      { label: "Gastos fijos", href: "/finance/fixed", permission: "finance.read" },
      { label: "Ingresos", href: "/finance/income", permission: "finance.read" },
      { label: "Presupuesto", href: "/finance/budget", permission: "finance.read" },
      { label: "Rentabilidad", href: "/finance/profitability", permission: "finance.read" },
    ],
    permissions: rw("finance", "finanzas"),
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
