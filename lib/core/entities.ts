import type { TenantDb } from "./db";

/**
 * Registro de entidades de negocio. Es el contrato que usan los motores genéricos
 * (Custom Fields, Workflows, Rules, Automations, Import, Search, Radar, Intelligence)
 * para trabajar con cualquier entidad sin conocerla de antemano.
 */
export type FieldMeta = {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "date" | "email" | "phone" | "boolean";
  required?: boolean;
  importable?: boolean;
};

export type EntityDef = {
  type: string;
  label: string;
  labelPlural: string;
  module: string;
  readPermission: string;
  writePermission: string;
  /** Admite campos personalizados (columna JSON `customFields`). */
  customizable: boolean;
  /** Tiene ciclo de vida gobernado por el Workflow Engine (columna `status`). */
  hasWorkflow: boolean;
  fields: FieldMeta[];
  path: (id: string) => string;
  /** Eventos de dominio emitidos al llegar a cierto estado. */
  statusEvents?: Record<string, string>;
  load: (db: TenantDb, id: string) => Promise<Record<string, unknown> | null>;
  setStatus?: (db: TenantDb, id: string, status: string) => Promise<void>;
  title: (row: Record<string, unknown>) => string;
  search?: (db: TenantDb, q: string) => Promise<{ id: string; title: string; subtitle?: string }[]>;
};

/** Convierte Decimals y fechas a valores planos para condiciones y JSON. */
export function plain<T>(row: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row, (_k, v) => (v && typeof v === "object" && "toNumber" in v ? v.toNumber() : v)));
}

const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

export const ENTITIES: Record<string, EntityDef> = {
  customer: {
    type: "customer", label: "Cliente", labelPlural: "Clientes", module: "crm",
    readPermission: "crm.customers.read", writePermission: "crm.customers.write",
    customizable: true, hasWorkflow: false,
    fields: [
      { key: "name", label: "Nombre / Razón social", type: "text", required: true, importable: true },
      { key: "taxId", label: "NIT / Documento", type: "text", importable: true },
      { key: "email", label: "Email", type: "email", importable: true },
      { key: "phone", label: "Teléfono", type: "phone", importable: true },
      { key: "city", label: "Ciudad", type: "text", importable: true },
    ],
    path: (id) => `/crm/customers/${id}`,
    load: async (db, id) => { const r = await db.customer.findUnique({ where: { id } }); return r && plain(r); },
    title: (r) => String(r.name),
    search: async (db, q) =>
      (await db.customer.findMany({ where: { OR: [{ name: contains(q) }, { taxId: contains(q) }, { email: contains(q) }] }, take: 8 }))
        .map((c) => ({ id: c.id, title: c.name, subtitle: [c.taxId, c.city].filter(Boolean).join(" · ") })),
  },
  contact: {
    type: "contact", label: "Contacto", labelPlural: "Contactos", module: "crm",
    readPermission: "crm.customers.read", writePermission: "crm.customers.write",
    customizable: true, hasWorkflow: false,
    fields: [
      { key: "name", label: "Nombre", type: "text", required: true, importable: true },
      { key: "email", label: "Email", type: "email", importable: true },
      { key: "phone", label: "Teléfono", type: "phone", importable: true },
      { key: "position", label: "Cargo", type: "text", importable: true },
    ],
    path: () => `/crm/customers`,
    load: async (db, id) => { const r = await db.contact.findUnique({ where: { id } }); return r && plain(r); },
    title: (r) => String(r.name),
  },
  opportunity: {
    type: "opportunity", label: "Oportunidad", labelPlural: "Oportunidades", module: "crm",
    readPermission: "crm.opportunities.read", writePermission: "crm.opportunities.write",
    customizable: true, hasWorkflow: true,
    statusEvents: { won: "OpportunityWon", lost: "OpportunityLost" },
    fields: [
      { key: "title", label: "Título", type: "text", required: true },
      { key: "amount", label: "Valor", type: "currency" },
    ],
    path: () => `/crm/opportunities`,
    load: async (db, id) => { const r = await db.opportunity.findUnique({ where: { id }, include: { customer: true } }); return r && plain(r); },
    setStatus: async (db, id, status) => { await db.opportunity.update({ where: { id }, data: { status, lastActivityAt: new Date() } }); },
    title: (r) => String(r.title),
    search: async (db, q) =>
      (await db.opportunity.findMany({ where: { title: contains(q) }, take: 8 })).map((o) => ({ id: o.id, title: o.title })),
  },
  quote: {
    type: "quote", label: "Cotización", labelPlural: "Cotizaciones", module: "sales",
    readPermission: "sales.quotes.read", writePermission: "sales.quotes.write",
    customizable: true, hasWorkflow: true,
    statusEvents: { sent: "QuoteSent", approved: "QuoteApproved", rejected: "QuoteRejected", converted: "SalesOrderConfirmed" },
    fields: [
      { key: "number", label: "Número", type: "text" },
      { key: "total", label: "Total", type: "currency" },
      { key: "subtotal", label: "Subtotal", type: "currency" },
    ],
    path: (id) => `/sales/quotes/${id}`,
    load: async (db, id) => { const r = await db.quote.findUnique({ where: { id }, include: { customer: true, lines: true } }); return r && plain(r); },
    setStatus: async (db, id, status) => { await db.quote.update({ where: { id }, data: { status } }); },
    title: (r) => `Cotización ${r.number}`,
    search: async (db, q) =>
      (await db.quote.findMany({ where: { OR: [{ number: contains(q) }, { customer: { name: contains(q) } }] }, include: { customer: true }, take: 8 }))
        .map((x) => ({ id: x.id, title: `Cotización ${x.number}`, subtitle: x.customer.name })),
  },
  product: {
    type: "product", label: "Producto", labelPlural: "Productos", module: "products",
    readPermission: "products.read", writePermission: "products.write",
    customizable: true, hasWorkflow: false,
    fields: [
      { key: "sku", label: "SKU", type: "text", required: true, importable: true },
      { key: "name", label: "Nombre", type: "text", required: true, importable: true },
      { key: "category", label: "Categoría", type: "text", importable: true },
      { key: "unit", label: "Unidad", type: "text", importable: true },
      { key: "price", label: "Precio", type: "currency", importable: true },
      { key: "cost", label: "Costo", type: "currency", importable: true },
      { key: "stock", label: "Existencia", type: "number", importable: true },
      { key: "minStock", label: "Stock mínimo", type: "number", importable: true },
    ],
    path: (id) => `/products/${id}`,
    load: async (db, id) => { const r = await db.product.findUnique({ where: { id } }); return r && plain(r); },
    title: (r) => `${r.sku} · ${r.name}`,
    search: async (db, q) =>
      (await db.product.findMany({ where: { OR: [{ name: contains(q) }, { sku: contains(q) }] }, take: 8 }))
        .map((p) => ({ id: p.id, title: p.name, subtitle: p.sku })),
  },
  supplier: {
    type: "supplier", label: "Proveedor", labelPlural: "Proveedores", module: "purchasing",
    readPermission: "purchasing.read", writePermission: "purchasing.write",
    customizable: true, hasWorkflow: false,
    fields: [
      { key: "name", label: "Nombre", type: "text", required: true, importable: true },
      { key: "taxId", label: "NIT", type: "text", importable: true },
      { key: "email", label: "Email", type: "email", importable: true },
      { key: "phone", label: "Teléfono", type: "phone", importable: true },
    ],
    path: () => `/purchasing/suppliers`,
    load: async (db, id) => { const r = await db.supplier.findUnique({ where: { id } }); return r && plain(r); },
    title: (r) => String(r.name),
    search: async (db, q) =>
      (await db.supplier.findMany({ where: { name: contains(q) }, take: 8 })).map((s) => ({ id: s.id, title: s.name, subtitle: s.taxId ?? undefined })),
  },
  invoice: {
    type: "invoice", label: "Factura", labelPlural: "Facturas", module: "invoicing",
    readPermission: "invoicing.read", writePermission: "invoicing.write",
    customizable: false, hasWorkflow: false,
    fields: [{ key: "number", label: "Número", type: "text" }, { key: "total", label: "Total", type: "currency" }],
    path: () => `/invoicing`,
    load: async (db, id) => { const r = await db.invoice.findUnique({ where: { id }, include: { customer: true } }); return r && plain(r); },
    title: (r) => `Factura ${r.number}`,
  },
  nonconformity: {
    type: "nonconformity", label: "No conformidad", labelPlural: "No conformidades", module: "quality",
    readPermission: "quality.read", writePermission: "quality.write",
    customizable: true, hasWorkflow: false,
    fields: [{ key: "title", label: "Título", type: "text", required: true }],
    path: () => `/quality`,
    load: async (db, id) => { const r = await db.nonconformity.findUnique({ where: { id }, include: { supplier: true } }); return r && plain(r); },
    title: (r) => `${r.code} · ${r.title}`,
  },
  employee: {
    type: "employee", label: "Empleado", labelPlural: "Empleados", module: "hr",
    readPermission: "hr.read", writePermission: "hr.write",
    customizable: true, hasWorkflow: false,
    fields: [
      { key: "name", label: "Nombre", type: "text", required: true, importable: true },
      { key: "email", label: "Email", type: "email", importable: true },
      { key: "position", label: "Cargo", type: "text", importable: true },
    ],
    path: () => `/`,
    load: async (db, id) => { const r = await db.employee.findUnique({ where: { id } }); return r && plain(r); },
    title: (r) => String(r.name),
  },
  knowledge: {
    type: "knowledge", label: "Conocimiento", labelPlural: "Conocimiento", module: "knowledge",
    readPermission: "knowledge.read", writePermission: "knowledge.write",
    customizable: false, hasWorkflow: false,
    fields: [{ key: "title", label: "Título", type: "text", required: true }],
    path: (id) => `/knowledge/${id}`,
    load: async (db, id) => { const r = await db.knowledgeItem.findUnique({ where: { id } }); return r && plain(r); },
    title: (r) => String(r.title),
    search: async (db, q) =>
      (await db.knowledgeItem.findMany({ where: { OR: [{ title: contains(q) }, { body: contains(q) }] }, take: 8 }))
        .map((k) => ({ id: k.id, title: k.title, subtitle: k.type })),
  },
  requisition: {
    type: "requisition", label: "Requisición", labelPlural: "Requisiciones", module: "purchasing",
    readPermission: "purchasing.requisitions.read", writePermission: "purchasing.requisitions.write",
    customizable: true, hasWorkflow: true,
    statusEvents: { submitted: "RequisitionSubmitted", approved: "RequisitionApproved", rejected: "RequisitionRejected" },
    fields: [{ key: "number", label: "Número", type: "text" }, { key: "area", label: "Área", type: "text" }],
    path: (id) => `/purchasing/requisitions/${id}`,
    load: async (db, id) => { const r = await db.requisition.findUnique({ where: { id }, include: { lines: true } }); return r && plain(r); },
    setStatus: async (db, id, status) => { await db.requisition.update({ where: { id }, data: { status } }); },
    title: (r) => `Requisición ${r.number}`,
    search: async (db, q) => (await db.requisition.findMany({ where: { OR: [{ number: contains(q) }, { area: contains(q) }] }, take: 8 }))
      .map((r) => ({ id: r.id, title: `Requisición ${r.number}`, subtitle: r.area ?? undefined })),
  },
  purchase_order: {
    type: "purchase_order", label: "Orden de compra", labelPlural: "Órdenes de compra", module: "purchasing",
    readPermission: "purchasing.read", writePermission: "purchasing.write",
    customizable: true, hasWorkflow: true,
    statusEvents: { purchase: "PurchaseOrderConfirmed", received: "PurchaseOrderReceived", canceled: "PurchaseOrderCanceled" },
    fields: [{ key: "number", label: "Número", type: "text" }, { key: "total", label: "Total", type: "currency" }, { key: "subtotal", label: "Subtotal", type: "currency" }],
    path: (id) => `/purchasing/orders/${id}`,
    load: async (db, id) => { const r = await db.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, lines: true } }); return r && plain(r); },
    setStatus: async (db, id, status) => { await db.purchaseOrder.update({ where: { id }, data: { status, ...(status === "purchase" ? { confirmedAt: new Date() } : {}) } }); },
    title: (r) => `Orden de compra ${r.number}`,
    search: async (db, q) => (await db.purchaseOrder.findMany({ where: { OR: [{ number: contains(q) }, { supplier: { name: contains(q) } }] }, include: { supplier: true }, take: 8 }))
      .map((r) => ({ id: r.id, title: `OC ${r.number}`, subtitle: r.supplier.name })),
  },
  transfer: {
    type: "transfer", label: "Transferencia", labelPlural: "Transferencias", module: "inventory",
    readPermission: "inventory.read", writePermission: "inventory.write",
    customizable: false, hasWorkflow: false,
    fields: [{ key: "number", label: "Número", type: "text" }],
    path: (id) => `/inventory/transfers/${id}`,
    load: async (db, id) => { const r = await db.transfer.findUnique({ where: { id }, include: { lines: true, operationType: true } }); return r && plain(r); },
    title: (r) => String(r.number),
    search: async (db, q) => (await db.transfer.findMany({ where: { OR: [{ number: contains(q) }, { origin: contains(q) }, { partnerName: contains(q) }] }, take: 8 }))
      .map((r) => ({ id: r.id, title: r.number, subtitle: [r.origin, r.partnerName].filter(Boolean).join(" · ") })),
  },
  production: {
    type: "production", label: "Orden de producción", labelPlural: "Órdenes de producción", module: "manufacturing",
    readPermission: "manufacturing.read", writePermission: "manufacturing.write",
    customizable: true, hasWorkflow: true,
    statusEvents: { confirmed: "ProductionConfirmed", in_progress: "ProductionStarted", done: "ProductionCompleted" },
    fields: [{ key: "number", label: "Número", type: "text" }, { key: "quantity", label: "Cantidad", type: "number" }],
    path: (id) => `/manufacturing/orders/${id}`,
    load: async (db, id) => { const r = await db.productionOrder.findUnique({ where: { id }, include: { components: true } }); return r && plain(r); },
    setStatus: async (db, id, status) => {
      await db.productionOrder.update({ where: { id }, data: { status, ...(status === "in_progress" ? { startedAt: new Date() } : {}), ...(status === "done" ? { doneAt: new Date() } : {}) } });
    },
    title: (r) => `Producción ${r.number}`,
    search: async (db, q) => (await db.productionOrder.findMany({ where: { OR: [{ number: contains(q) }, { origin: contains(q) }] }, take: 8 }))
      .map((r) => ({ id: r.id, title: `Producción ${r.number}`, subtitle: r.origin ?? undefined })),
  },
  sales_order: {
    type: "sales_order", label: "Pedido de venta", labelPlural: "Pedidos de venta", module: "sales",
    readPermission: "sales.quotes.read", writePermission: "sales.quotes.write",
    customizable: true, hasWorkflow: true,
    statusEvents: { done: "SalesOrderDone", canceled: "SalesOrderCanceled" },
    fields: [{ key: "number", label: "Número", type: "text" }, { key: "total", label: "Total", type: "currency" }],
    path: (id) => `/sales/orders/${id}`,
    load: async (db, id) => { const r = await db.salesOrder.findUnique({ where: { id }, include: { customer: true, lines: true } }); return r && plain(r); },
    setStatus: async (db, id, status) => { await db.salesOrder.update({ where: { id }, data: { status } }); },
    title: (r) => `Pedido ${r.number}`,
    search: async (db, q) => (await db.salesOrder.findMany({ where: { OR: [{ number: contains(q) }, { customer: { name: contains(q) } }] }, include: { customer: true }, take: 8 }))
      .map((r) => ({ id: r.id, title: `Pedido ${r.number}`, subtitle: r.customer.name })),
  },
  bill: {
    type: "bill", label: "Factura de proveedor", labelPlural: "Facturas de proveedor", module: "invoicing",
    readPermission: "invoicing.read", writePermission: "invoicing.write",
    customizable: false, hasWorkflow: false,
    fields: [{ key: "number", label: "Número", type: "text" }, { key: "total", label: "Total", type: "currency" }],
    path: () => `/invoicing/bills`,
    load: async (db, id) => { const r = await db.bill.findUnique({ where: { id }, include: { supplier: true } }); return r && plain(r); },
    title: (r) => `Factura proveedor ${r.number}`,
  },
};

/**
 * Objetos personalizados de Studio (entityType "x:<clave>"): una definición genérica
 * sirve para todos; la etiqueta real vive en CustomEntity.
 */
function customEntityDef(type: string): EntityDef {
  const key = type.slice(2);
  return {
    type, label: "Registro", labelPlural: "Registros", module: "core",
    readPermission: `custom.${key}.read`, writePermission: `custom.${key}.write`,
    customizable: true, hasWorkflow: true,
    statusEvents: {},
    fields: [{ key: "number", label: "Número", type: "text" }],
    path: (id) => `/x/${key}/${id}`,
    load: async (db, id) => {
      const r = await db.customRecord.findUnique({ where: { id }, include: { lines: true } });
      // Los campos personalizados viven en `data`; se exponen también como customFields para reglas
      return r && { ...plain(r), customFields: r.data, ...(r.data as object) };
    },
    setStatus: async (db, id, status) => { await db.customRecord.update({ where: { id }, data: { status } }); },
    title: (r) => String(r.number),
  };
}

export function getEntityOrNull(type: string): EntityDef | null {
  if (type.startsWith("x:")) return customEntityDef(type);
  return ENTITIES[type] ?? null;
}

export function getEntity(type: string): EntityDef {
  const e = getEntityOrNull(type);
  if (!e) throw new Error(`Entidad desconocida: ${type}`);
  return e;
}

export const CUSTOMIZABLE_ENTITIES = Object.values(ENTITIES).filter((e) => e.customizable);
export const WORKFLOW_ENTITIES = Object.values(ENTITIES).filter((e) => e.hasWorkflow);
