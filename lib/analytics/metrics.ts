import type { OrgContext } from "@/lib/core/context";

/** Métricas reutilizables por dashboards configurables. Cada una exige app + permiso. */
export type Metric = {
  key: string; label: string; module: string; permission: string; format: "money" | "number";
  compute: (ctx: OrgContext) => Promise<number>;
};

const startOfMonth = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };

export const METRICS: Metric[] = [
  {
    key: "sales_month", label: "Facturado este mes", module: "invoicing", permission: "invoicing.read", format: "money",
    compute: async (ctx) => Number((await ctx.db.invoice.aggregate({ where: { issuedAt: { gte: startOfMonth() }, status: { not: "void" } }, _sum: { total: true } }))._sum.total ?? 0),
  },
  {
    key: "pipeline_value", label: "Pipeline abierto", module: "crm", permission: "crm.opportunities.read", format: "money",
    compute: async (ctx) => Number((await ctx.db.opportunity.aggregate({ where: { status: { notIn: ["won", "lost"] } }, _sum: { amount: true } }))._sum.amount ?? 0),
  },
  {
    key: "overdue_receivables", label: "Cartera vencida", module: "invoicing", permission: "invoicing.read", format: "money",
    compute: async (ctx) => Number((await ctx.db.invoice.aggregate({ where: { status: "issued", dueDate: { lt: new Date() } }, _sum: { balance: true } }))._sum.balance ?? 0),
  },
  {
    key: "stock_alerts", label: "Productos bajo mínimo", module: "inventory", permission: "inventory.read", format: "number",
    compute: async (ctx) => (await ctx.db.product.findMany({ where: { minStock: { gt: 0 } }, select: { stock: true, minStock: true } })).filter((p) => Number(p.stock) < Number(p.minStock)).length,
  },
  {
    key: "quotes_open", label: "Cotizaciones abiertas", module: "sales", permission: "sales.quotes.read", format: "number",
    compute: (ctx) => ctx.db.quote.count({ where: { status: { in: ["draft", "sent", "pending_approval", "approved"] } } }),
  },
  {
    key: "open_nonconformities", label: "No conformidades abiertas", module: "quality", permission: "quality.read", format: "number",
    compute: (ctx) => ctx.db.nonconformity.count({ where: { status: "open" } }),
  },
  {
    key: "orders_to_deliver", label: "Pedidos por entregar", module: "sales", permission: "sales.quotes.read", format: "number",
    compute: (ctx) => ctx.db.salesOrder.count({ where: { status: "confirmed", deliveryStatus: { not: "full" } } }),
  },
  {
    key: "production_open", label: "Órdenes de producción abiertas", module: "manufacturing", permission: "manufacturing.read", format: "number",
    compute: (ctx) => ctx.db.productionOrder.count({ where: { status: { in: ["draft", "confirmed", "in_progress"] } } }),
  },
  {
    key: "purchases_pending", label: "Compras por recibir", module: "purchasing", permission: "purchasing.read", format: "money",
    compute: async (ctx) => Number((await ctx.db.purchaseOrder.aggregate({ where: { status: "purchase" }, _sum: { total: true } }))._sum.total ?? 0),
  },
  {
    key: "payables", label: "Cuentas por pagar", module: "invoicing", permission: "invoicing.read", format: "money",
    compute: async (ctx) => Number((await ctx.db.bill.aggregate({ where: { status: "posted" }, _sum: { balance: true } }))._sum.balance ?? 0),
  },
];

export const METRIC_MAP = new Map(METRICS.map((m) => [m.key, m]));
