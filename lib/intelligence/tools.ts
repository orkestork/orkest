import type { OrgContext } from "@/lib/core/context";

/**
 * ORKEST Intelligence — herramientas de consulta seguras.
 *
 * Principio: el asistente (hoy un planificador por intención; mañana un LLM) NUNCA
 * escribe SQL ni accede a la BD directamente. Solo puede invocar herramientas de este
 * catálogo, y solo las que el usuario puede usar (app activa + permiso). Cada herramienta
 * consulta con `ctx.db`, que está restringido a la organización activa.
 */
export type ToolResult = {
  answer: string;
  table?: { columns: string[]; rows: (string | number)[][] };
  links?: { label: string; href: string }[];
};

export type Tool = {
  key: string;
  description: string;
  module: string;
  permission: string;
  /** Palabras clave para el planificador por intención (fallback sin LLM). */
  keywords: string[][];
  run: (ctx: OrgContext) => Promise<ToolResult>;
};

const money = (v: number, currency = "COP") =>
  v.toLocaleString("es-CO", { style: "currency", currency, maximumFractionDigits: 0 });
const num = (v: unknown) => Number(v ?? 0);

export const TOOLS: Tool[] = [
  {
    key: "sales_this_month",
    description: "Ventas facturadas en el mes en curso",
    module: "invoicing", permission: "invoicing.read",
    keywords: [["vend"], ["venta"], ["factur", "mes"]],
    async run(ctx) {
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const agg = await ctx.db.invoice.aggregate({ where: { issuedAt: { gte: start }, status: { not: "void" } }, _sum: { total: true }, _count: true });
      const byCustomer = await ctx.db.invoice.groupBy({
        by: ["customerId"], where: { issuedAt: { gte: start }, status: { not: "void" } }, _sum: { total: true },
        orderBy: { _sum: { total: "desc" } }, take: 5,
      });
      const customers = await ctx.db.customer.findMany({ where: { id: { in: byCustomer.map((b) => b.customerId) } } });
      return {
        answer: `Este mes se han facturado ${money(num(agg._sum.total), ctx.org.currency)} en ${agg._count} factura(s).`,
        table: {
          columns: ["Cliente", "Facturado"],
          rows: byCustomer.map((b) => [customers.find((c) => c.id === b.customerId)?.name ?? "—", money(num(b._sum.total), ctx.org.currency)]),
        },
        links: [{ label: "Ver facturación", href: "/invoicing" }],
      };
    },
  },
  {
    key: "stock_risk",
    description: "Productos con riesgo de agotarse (existencia bajo el mínimo)",
    module: "inventory", permission: "inventory.read",
    keywords: [["agot"], ["stock"], ["inventario", "riesgo"], ["existencia"]],
    async run(ctx) {
      const products = await ctx.db.product.findMany({ where: { active: true, minStock: { gt: 0 } } });
      const risky = products.filter((p) => num(p.stock) < num(p.minStock)).sort((a, b) => num(a.stock) / num(a.minStock) - num(b.stock) / num(b.minStock));
      return {
        answer: risky.length ? `${risky.length} producto(s) están por debajo del stock mínimo.` : "Ningún producto está por debajo del mínimo.",
        table: { columns: ["SKU", "Producto", "Existencia", "Mínimo"], rows: risky.map((p) => [p.sku, p.name, num(p.stock), num(p.minStock)]) },
        links: [{ label: "Ver inventario", href: "/inventory" }],
      };
    },
  },
  {
    key: "opportunities_followup",
    description: "Oportunidades abiertas que necesitan seguimiento",
    module: "crm", permission: "crm.opportunities.read",
    keywords: [["oportunidad"], ["seguimiento"], ["pipeline"]],
    async run(ctx) {
      const limit = new Date(Date.now() - 7 * 86400000);
      const opps = await ctx.db.opportunity.findMany({
        where: { status: { notIn: ["won", "lost"] }, lastActivityAt: { lt: limit } },
        include: { customer: true }, orderBy: { amount: "desc" }, take: 20,
      });
      return {
        answer: opps.length ? `${opps.length} oportunidad(es) llevan más de 7 días sin actividad.` : "Todas las oportunidades tienen actividad reciente.",
        table: {
          columns: ["Oportunidad", "Cliente", "Valor", "Días sin actividad"],
          rows: opps.map((o) => [o.title, o.customer?.name ?? "—", money(num(o.amount), ctx.org.currency), Math.floor((Date.now() - o.lastActivityAt.getTime()) / 86400000)]),
        },
        links: [{ label: "Ver oportunidades", href: "/crm/opportunities" }],
      };
    },
  },
  {
    key: "supplier_nonconformities",
    description: "Proveedores con más no conformidades",
    module: "quality", permission: "quality.read",
    keywords: [["proveedor"], ["no conformidad"], ["calidad"]],
    async run(ctx) {
      const groups = await ctx.db.nonconformity.groupBy({
        by: ["supplierId"], where: { supplierId: { not: null } }, _count: { _all: true },
        orderBy: { _count: { supplierId: "desc" } }, take: 5,
      });
      const sups = await ctx.db.supplier.findMany({ where: { id: { in: groups.map((g) => g.supplierId!) } } });
      const top = groups[0];
      return {
        answer: top
          ? `El proveedor con más no conformidades es ${sups.find((s) => s.id === top.supplierId)?.name} con ${top._count._all}.`
          : "No hay no conformidades asociadas a proveedores.",
        table: { columns: ["Proveedor", "No conformidades"], rows: groups.map((g) => [sups.find((s) => s.id === g.supplierId)?.name ?? "—", g._count._all]) },
        links: [{ label: "Ver calidad", href: "/quality" }],
      };
    },
  },
  {
    key: "overdue_receivables",
    description: "Cartera vencida",
    module: "invoicing", permission: "invoicing.read",
    keywords: [["cartera"], ["vencid"], ["cobrar"], ["deuda"]],
    async run(ctx) {
      const inv = await ctx.db.invoice.findMany({
        where: { status: "issued", dueDate: { lt: new Date() }, balance: { gt: 0 } }, include: { customer: true }, orderBy: { dueDate: "asc" },
      });
      const total = inv.reduce((s, i) => s + num(i.balance), 0);
      return {
        answer: `La cartera vencida es de ${money(total, ctx.org.currency)} en ${inv.length} factura(s).`,
        table: {
          columns: ["Factura", "Cliente", "Saldo", "Días vencida"],
          rows: inv.map((i) => [i.number, i.customer.name, money(num(i.balance), ctx.org.currency), Math.floor((Date.now() - i.dueDate.getTime()) / 86400000)]),
        },
        links: [{ label: "Ver cartera", href: "/invoicing" }],
      };
    },
  },
  {
    key: "radar_summary",
    description: "Resumen de riesgos y alertas abiertas en Radar",
    module: "radar", permission: "radar.read",
    keywords: [["riesgo"], ["alerta"], ["radar"], ["pendiente"]],
    async run(ctx) {
      const { visibleInsightWhere } = await import("@/lib/radar/visibility");
      const items = await ctx.db.insight.findMany({ where: { ...visibleInsightWhere(ctx), status: { not: "RESOLVED" } }, orderBy: { detectedAt: "desc" }, take: 15 });
      return {
        answer: `Radar tiene ${items.length} alerta(s) abiertas.`,
        table: { columns: ["Severidad", "Alerta", "Acción recomendada"], rows: items.map((i) => [i.severity, i.title, i.recommendedAction ?? ""]) },
        links: [{ label: "Abrir Radar", href: "/radar" }],
      };
    },
  },
];

/** Herramientas que ESTE usuario puede usar en ESTA organización. */
export function availableTools(ctx: OrgContext) {
  return TOOLS.filter((t) => ctx.hasModule(t.module) && ctx.can(t.permission));
}

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Planificador por intención. Interfaz pensada para reemplazarse por un LLM con tool-calling. */
export function planTool(question: string): Tool | null {
  const q = normalize(question);
  let best: { tool: Tool; score: number } | null = null;
  for (const tool of TOOLS) {
    const score = tool.keywords.filter((group) => group.every((k) => q.includes(normalize(k)))).length;
    if (score > 0 && (!best || score > best.score)) best = { tool, score };
  }
  return best?.tool ?? null;
}

export async function ask(ctx: OrgContext, question: string): Promise<ToolResult & { tool?: string }> {
  const tool = planTool(question);
  if (!tool) {
    return {
      answer: "Aún no sé responder esa pregunta. Prueba con ventas del mes, stock en riesgo, oportunidades sin seguimiento, no conformidades por proveedor, cartera vencida o alertas de Radar.",
    };
  }
  if (!ctx.hasModule(tool.module)) return { answer: `La app necesaria para responder (${tool.module}) no está activa en ${ctx.org.name}.` };
  if (!ctx.can(tool.permission)) return { answer: "No tienes permiso para consultar esa información." };
  const result = await tool.run(ctx);
  await ctx.db.auditLog.create({
    data: { organizationId: ctx.orgId, actorId: ctx.user.id, action: "IntelligenceQuery", entityType: "intelligence", changes: { question, tool: tool.key } },
  });
  return { ...result, tool: tool.key };
}
