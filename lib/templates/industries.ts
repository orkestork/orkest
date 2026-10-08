import type { ConditionGroup } from "@/lib/core/conditions";
import type { ActionSpec } from "@/lib/core/automations";
import type { TransitionApproval } from "@/lib/core/workflow";

/**
 * Industry Templates: configuración inicial (apps, roles, campos, workflows,
 * automatizaciones, dashboards y plantillas de documento). Una plantilla se APLICA
 * una vez; después cada empresa la modifica libremente desde Studio.
 */

export type RoleTemplate = { key: string; name: string; description: string; permissions: string[] };
export type FieldTemplate = {
  entityType: string; key: string; label: string; type: string;
  options?: { value: string; label: string }[]; required?: boolean; helpText?: string; validation?: object;
};
export type WorkflowTemplate = {
  entityType: string; key: string; name: string;
  states: { key: string; label: string; color: string; isInitial?: boolean; isFinal?: boolean }[];
  transitions: {
    from: string; to: string; label: string; permission?: string;
    guard?: ConditionGroup; approval?: TransitionApproval; actions?: ActionSpec[];
  }[];
};
export type AutomationTemplate = {
  name: string; description: string; kind: "RULE" | "AUTOMATION"; trigger: string;
  conditions: ConditionGroup; actions: ActionSpec[];
};
export type WidgetTemplate = { type: "kpi" | "insights" | "approvals" | "tasks"; metric?: string; title: string };

export type IndustryTemplate = {
  key: string; name: string; description: string; status: "available" | "planned";
  modules: string[];
  fields: FieldTemplate[];
  workflows: WorkflowTemplate[];
  automations: AutomationTemplate[];
  dashboard: WidgetTemplate[];
  documentTemplates: { entityType: string; name: string; body: string }[];
};

// ─────────── Roles base (Core) ───────────
export const BASE_ROLES: RoleTemplate[] = [
  { key: "OWNER", name: "Propietario", description: "Control total de la organización", permissions: ["*"] },
  {
    key: "ADMIN", name: "Administrador", description: "Administra usuarios, apps y configuración",
    permissions: ["org.*", "studio.*", "integrations.*", "audit.*", "import.*", "intelligence.*", "automations.*", "custom.*", "approvals.override",
      "crm.*", "sales.*", "products.*", "inventory.*", "purchasing.*", "quality.*", "invoicing.*", "knowledge.*", "sonar.*", "radar.*", "analytics.*", "hr.*", "manufacturing.*", "accounting.*", "documents.*", "website.*"],
  },
  {
    key: "MANAGEMENT", name: "Gerencia", description: "Visibilidad total y aprobaciones de alto valor",
    permissions: ["crm.*", "sales.*", "products.read", "inventory.read", "purchasing.read", "purchasing.approve", "purchasing.requisitions.read",
      "manufacturing.read", "quality.read", "invoicing.read", "knowledge.*", "sonar.*", "radar.*", "analytics.read", "intelligence.ask", "audit.read", "custom.*"],
  },
  {
    key: "SALES", name: "Comercial", description: "Clientes, oportunidades y cotizaciones",
    permissions: ["crm.*", "sales.quotes.read", "sales.quotes.write", "products.read", "inventory.read", "purchasing.requisitions.*", "knowledge.read", "radar.read", "intelligence.ask"],
  },
  {
    key: "INVENTORY", name: "Inventario y compras", description: "Productos, existencias y proveedores",
    permissions: ["products.*", "inventory.*", "purchasing.read", "purchasing.write", "purchasing.requisitions.*", "manufacturing.read", "quality.read", "knowledge.read", "radar.read", "intelligence.ask"],
  },
  {
    key: "FINANCE", name: "Finanzas", description: "Facturación y cartera",
    permissions: ["invoicing.*", "accounting.*", "crm.customers.read", "sales.quotes.read", "purchasing.read", "radar.read", "analytics.read", "intelligence.ask"],
  },
  {
    key: "QUALITY", name: "Calidad", description: "No conformidades y conocimiento",
    permissions: ["quality.*", "purchasing.read", "purchasing.requisitions.*", "products.read", "manufacturing.read", "knowledge.*", "sonar.*", "radar.read", "intelligence.ask"],
  },
  {
    key: "PRODUCTION", name: "Producción", description: "Órdenes de producción, BoM y consumo de materiales",
    permissions: ["manufacturing.*", "inventory.*", "products.read", "quality.*", "purchasing.requisitions.*", "knowledge.read", "radar.read", "intelligence.ask"],
  },
  {
    key: "VIEWER", name: "Consulta", description: "Solo lectura",
    permissions: ["crm.customers.read", "crm.opportunities.read", "sales.quotes.read", "products.read", "inventory.read", "knowledge.read", "radar.read"],
  },
];

// ─────────── Workflows reutilizables ───────────
const QUOTE_WORKFLOW = (approvalThreshold: number): WorkflowTemplate => ({
  entityType: "quote", key: "quote_default", name: "Ciclo de cotización",
  states: [
    { key: "draft", label: "Borrador", color: "slate", isInitial: true },
    { key: "sent", label: "Enviada", color: "blue" },
    { key: "pending_approval", label: "Requiere aprobación", color: "amber" },
    { key: "approved", label: "Aprobada", color: "emerald" },
    { key: "rejected", label: "Rechazada", color: "rose", isFinal: true },
    { key: "converted", label: "Convertida en pedido", color: "violet", isFinal: true },
  ],
  transitions: [
    { from: "draft", to: "sent", label: "Enviar al cliente", permission: "sales.quotes.write", guard: { all: [{ field: "total", op: "gt", value: 0 }] } },
    {
      from: "sent", to: "approved", label: "Registrar aceptación", permission: "sales.quotes.write",
      approval: { when: { all: [{ field: "total", op: "gt", value: approvalThreshold }] }, role: "MANAGEMENT", pendingState: "pending_approval", reason: `Cotización superior a ${approvalThreshold.toLocaleString("es-CO")} requiere aprobación de Gerencia` },
    },
    { from: "sent", to: "rejected", label: "Marcar rechazada", permission: "sales.quotes.write" },
    {
      from: "approved", to: "converted", label: "Convertir en pedido", permission: "sales.quotes.write",
      actions: [
        { type: "CREATE_SALES_ORDER" },
        { type: "NOTIFY", to: { role: "INVENTORY" }, title: "Cotización {{number}} convertida en pedido", body: "Cliente {{customer.name}}" },
      ],
    },
    { from: "rejected", to: "draft", label: "Reabrir", permission: "sales.quotes.write" },
  ],
});

const OPPORTUNITY_PIPELINE: WorkflowTemplate = {
  entityType: "opportunity", key: "opportunity_pipeline", name: "Pipeline comercial",
  states: [
    { key: "new", label: "Nuevo", color: "slate", isInitial: true },
    { key: "qualified", label: "Calificado", color: "blue" },
    { key: "proposal", label: "Propuesta", color: "indigo" },
    { key: "negotiation", label: "Negociación", color: "amber" },
    { key: "won", label: "Ganada", color: "emerald", isFinal: true },
    { key: "lost", label: "Perdida", color: "rose", isFinal: true },
  ],
  transitions: [
    { from: "new", to: "qualified", label: "Calificar", permission: "crm.opportunities.write" },
    { from: "qualified", to: "proposal", label: "Enviar propuesta", permission: "crm.opportunities.write" },
    { from: "proposal", to: "negotiation", label: "Negociar", permission: "crm.opportunities.write" },
    { from: "negotiation", to: "won", label: "Ganar", permission: "crm.opportunities.write" },
    { from: "negotiation", to: "lost", label: "Perder", permission: "crm.opportunities.write" },
    { from: "proposal", to: "lost", label: "Perder", permission: "crm.opportunities.write" },
    { from: "qualified", to: "lost", label: "Descartar", permission: "crm.opportunities.write" },
    { from: "lost", to: "new", label: "Reactivar", permission: "crm.opportunities.write" },
  ],
};

const REQUISITION_WORKFLOW: WorkflowTemplate = {
  entityType: "requisition", key: "requisition_default", name: "Requisición de compra",
  states: [
    { key: "draft", label: "RQ generada", color: "slate", isInitial: true },
    { key: "submitted", label: "Por aprobar", color: "amber" },
    { key: "approved", label: "RQ aprobada", color: "blue" },
    { key: "ordered", label: "Orden de compra", color: "indigo" },
    { key: "received", label: "Entregado", color: "emerald", isFinal: true },
    { key: "rejected", label: "Rechazada", color: "rose", isFinal: true },
  ],
  transitions: [
    { from: "draft", to: "submitted", label: "Enviar a aprobación", permission: "purchasing.requisitions.write" },
    { from: "submitted", to: "approved", label: "Aprobar", permission: "purchasing.approve" },
    { from: "submitted", to: "rejected", label: "Rechazar", permission: "purchasing.approve" },
    { from: "rejected", to: "draft", label: "Reabrir", permission: "purchasing.requisitions.write" },
  ],
};

/** Doble validación: por encima del umbral la OC queda "Por aprobar" hasta que Gerencia apruebe. */
const PURCHASE_WORKFLOW = (approvalThreshold: number): WorkflowTemplate => {
  const confirm = {
    label: "Confirmar orden", permission: "purchasing.write",
    approval: { when: { all: [{ field: "total", op: "gt" as const, value: approvalThreshold }] }, role: "MANAGEMENT", pendingState: "to_approve", reason: `Orden de compra superior a ${approvalThreshold.toLocaleString("es-CO")} requiere aprobación de Gerencia` },
    actions: [{ type: "CREATE_RECEIPT" as const }],
  };
  return {
    entityType: "purchase_order", key: "purchase_order_default", name: "Ciclo de compra",
    states: [
      { key: "draft", label: "Solicitud de cotización", color: "slate", isInitial: true },
      { key: "sent", label: "SdC enviada", color: "blue" },
      { key: "to_approve", label: "Por aprobar", color: "amber" },
      { key: "purchase", label: "Orden de compra", color: "indigo" },
      { key: "received", label: "Recibida", color: "emerald", isFinal: true },
      { key: "canceled", label: "Cancelada", color: "rose", isFinal: true },
    ],
    transitions: [
      { from: "draft", to: "sent", label: "Enviar SdC al proveedor", permission: "purchasing.write" },
      { from: "draft", to: "purchase", ...confirm },
      { from: "sent", to: "purchase", ...confirm },
      { from: "draft", to: "canceled", label: "Cancelar", permission: "purchasing.write" },
      { from: "sent", to: "canceled", label: "Cancelar", permission: "purchasing.write" },
      { from: "canceled", to: "draft", label: "Volver a borrador", permission: "purchasing.write" },
    ],
  };
};

const PRODUCTION_WORKFLOW: WorkflowTemplate = {
  entityType: "production", key: "production_default", name: "Orden de producción",
  states: [
    { key: "draft", label: "Borrador", color: "slate", isInitial: true },
    { key: "confirmed", label: "Confirmada", color: "blue" },
    { key: "in_progress", label: "En proceso", color: "amber" },
    { key: "done", label: "Terminada", color: "emerald", isFinal: true },
    { key: "canceled", label: "Cancelada", color: "rose", isFinal: true },
  ],
  transitions: [
    { from: "draft", to: "confirmed", label: "Confirmar", permission: "manufacturing.write" },
    { from: "confirmed", to: "in_progress", label: "Iniciar producción", permission: "manufacturing.write" },
    { from: "draft", to: "canceled", label: "Cancelar", permission: "manufacturing.write" },
    { from: "confirmed", to: "canceled", label: "Cancelar", permission: "manufacturing.write" },
  ],
};

const SALES_ORDER_WORKFLOW: WorkflowTemplate = {
  entityType: "sales_order", key: "sales_order_default", name: "Pedido de venta",
  states: [
    { key: "confirmed", label: "Confirmado", color: "blue", isInitial: true },
    { key: "done", label: "Completado", color: "emerald", isFinal: true },
    { key: "canceled", label: "Cancelado", color: "rose", isFinal: true },
  ],
  transitions: [
    { from: "confirmed", to: "canceled", label: "Cancelar pedido", permission: "sales.quotes.write", guard: { all: [{ field: "deliveryStatus", op: "eq", value: "none" }, { field: "invoiceStatus", op: "neq", value: "invoiced" }] } },
  ],
};

const COMMON_AUTOMATIONS: AutomationTemplate[] = [
  {
    name: "Cotizaciones de alto valor", kind: "RULE", trigger: "QuoteCreated",
    description: "WHEN QuoteCreated IF total > 50M THEN notificar a Gerencia y registrar actividad",
    conditions: { all: [{ field: "total", op: "gt", value: 50_000_000 }] },
    actions: [
      { type: "NOTIFY", to: { role: "MANAGEMENT" }, title: "Cotización de alto valor: {{number}}", body: "{{customer.name}} · total {{total}}" },
      { type: "ADD_ACTIVITY", content: "Regla de negocio: cotización de alto valor. Requerirá aprobación de Gerencia al ser aceptada." },
    ],
  },
  {
    name: "Reposición por stock mínimo", kind: "AUTOMATION", trigger: "InventoryBelowMinimum",
    description: "Avisa a Inventario y crea tarea de reposición",
    conditions: { all: [] },
    actions: [
      { type: "NOTIFY", to: { role: "INVENTORY" }, title: "Stock bajo el mínimo: {{name}}", body: "Existencia {{stock}} · mínimo {{minStock}}" },
      { type: "CREATE_TASK", title: "Reponer {{sku}} · {{name}}", assignTo: { role: "INVENTORY" }, dueInDays: 2 },
    ],
  },
  {
    name: "Celebrar oportunidad ganada", kind: "AUTOMATION", trigger: "OpportunityWon",
    description: "Notifica a Gerencia cuando se gana una oportunidad",
    conditions: { all: [] },
    actions: [{ type: "NOTIFY", to: { role: "MANAGEMENT" }, title: "Oportunidad ganada: {{title}}", body: "Valor {{amount}}" }],
  },
  {
    name: "Pago recibido", kind: "AUTOMATION", trigger: "PaymentReceived",
    description: "Notifica a Finanzas",
    conditions: { all: [] },
    actions: [{ type: "NOTIFY", to: { role: "FINANCE" }, title: "Pago recibido · factura {{number}}", body: "{{customer.name}}" }],
  },
];

const QUALITY_AUTOMATION: AutomationTemplate = {
  name: "No conformidad grave", kind: "RULE", trigger: "NonconformityCreated",
  description: "WHEN NonconformityCreated IF severity = HIGH THEN notificar a Calidad y crear tarea",
  conditions: { any: [{ field: "severity", op: "in", value: "HIGH,CRITICAL" }] },
  actions: [
    { type: "NOTIFY", to: { role: "QUALITY" }, title: "No conformidad grave {{code}}", body: "{{title}}" },
    { type: "CREATE_TASK", title: "Análisis de causa raíz {{code}}", assignTo: { role: "QUALITY" }, dueInDays: 5 },
  ],
};

const DEFAULT_DASHBOARD: WidgetTemplate[] = [
  { type: "kpi", metric: "sales_month", title: "Facturado este mes" },
  { type: "kpi", metric: "pipeline_value", title: "Pipeline abierto" },
  { type: "kpi", metric: "overdue_receivables", title: "Cartera vencida" },
  { type: "kpi", metric: "stock_alerts", title: "Productos bajo mínimo" },
  { type: "kpi", metric: "orders_to_deliver", title: "Pedidos por entregar" },
  { type: "kpi", metric: "production_open", title: "Órdenes de producción abiertas" },
  { type: "insights", title: "Radar" },
  { type: "approvals", title: "Aprobaciones pendientes" },
  { type: "tasks", title: "Mis tareas" },
];

const QUOTE_DOC = {
  entityType: "quote", name: "Cotización estándar",
  body: "COTIZACIÓN {{number}}\nCliente: {{customer.name}} (NIT {{customer.taxId}})\n\nSubtotal: {{subtotal}}\nIVA: {{tax}}\nTOTAL: {{total}}\n\nValidez: 30 días.",
};

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    key: "manufacturing", name: "Manufactura", status: "available",
    description: "Fabricantes con ventas B2B, inventario de materias primas, calidad y proveedores.",
    modules: ["crm", "sales", "products", "inventory", "purchasing", "manufacturing", "quality", "invoicing", "knowledge", "sonar", "radar", "analytics", "automations"],
    fields: [
      { entityType: "product", key: "material", label: "Material", type: "text" },
      { entityType: "product", key: "lead_time_days", label: "Lead time (días)", type: "number", validation: { min: 0, max: 365 } },
      { entityType: "supplier", key: "approved_supplier", label: "Proveedor homologado", type: "boolean" },
    ],
    workflows: [QUOTE_WORKFLOW(50_000_000), OPPORTUNITY_PIPELINE, SALES_ORDER_WORKFLOW, REQUISITION_WORKFLOW, PURCHASE_WORKFLOW(2_000_000), PRODUCTION_WORKFLOW],
    automations: [...COMMON_AUTOMATIONS, QUALITY_AUTOMATION],
    dashboard: DEFAULT_DASHBOARD,
    documentTemplates: [QUOTE_DOC],
  },
  {
    key: "distribution", name: "Distribución", status: "available",
    description: "Distribuidores mayoristas con alta rotación de inventario y cartera.",
    modules: ["crm", "sales", "products", "inventory", "purchasing", "invoicing", "radar", "analytics", "automations"],
    fields: [
      { entityType: "customer", key: "channel", label: "Canal", type: "select", options: [
        { value: "wholesale", label: "Mayorista" }, { value: "retail", label: "Minorista" }, { value: "online", label: "Online" }] },
      { entityType: "customer", key: "delivery_route", label: "Ruta de entrega", type: "text" },
    ],
    workflows: [QUOTE_WORKFLOW(30_000_000), OPPORTUNITY_PIPELINE, SALES_ORDER_WORKFLOW, REQUISITION_WORKFLOW, PURCHASE_WORKFLOW(5_000_000)],
    automations: COMMON_AUTOMATIONS,
    dashboard: DEFAULT_DASHBOARD,
    documentTemplates: [QUOTE_DOC],
  },
  {
    key: "services", name: "Servicios", status: "available",
    description: "Empresas de servicios profesionales basadas en conocimiento.",
    modules: ["crm", "sales", "products", "invoicing", "knowledge", "sonar", "radar", "analytics", "automations"],
    fields: [
      { entityType: "customer", key: "contract_type", label: "Tipo de contrato", type: "select", options: [
        { value: "project", label: "Proyecto" }, { value: "retainer", label: "Iguala mensual" }, { value: "hourly", label: "Por horas" }] },
    ],
    workflows: [QUOTE_WORKFLOW(20_000_000), OPPORTUNITY_PIPELINE, SALES_ORDER_WORKFLOW],
    automations: COMMON_AUTOMATIONS.filter((a) => a.trigger !== "InventoryBelowMinimum"),
    dashboard: DEFAULT_DASHBOARD.filter((w) => w.metric !== "stock_alerts"),
    documentTemplates: [QUOTE_DOC],
  },
  {
    key: "retail", name: "Retail", status: "available",
    description: "Comercio minorista con catálogo amplio y control de existencias.",
    modules: ["crm", "sales", "products", "inventory", "invoicing", "radar", "analytics", "automations"],
    fields: [{ entityType: "product", key: "brand", label: "Marca", type: "text" }],
    workflows: [QUOTE_WORKFLOW(10_000_000), OPPORTUNITY_PIPELINE, SALES_ORDER_WORKFLOW],
    automations: COMMON_AUTOMATIONS,
    dashboard: DEFAULT_DASHBOARD,
    documentTemplates: [QUOTE_DOC],
  },
  {
    key: "healthcare", name: "Salud", status: "planned",
    description: "IPS y proveedores de salud (próximamente).",
    modules: ["crm", "invoicing", "knowledge", "radar"], fields: [], workflows: [], automations: [], dashboard: DEFAULT_DASHBOARD, documentTemplates: [],
  },
  {
    key: "construction", name: "Construcción", status: "planned",
    description: "Constructoras y contratistas por proyecto (próximamente).",
    modules: ["crm", "sales", "purchasing", "invoicing", "radar"], fields: [], workflows: [], automations: [], dashboard: DEFAULT_DASHBOARD, documentTemplates: [],
  },
];

export const getTemplate = (key: string) => INDUSTRY_TEMPLATES.find((t) => t.key === key);
