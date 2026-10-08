import { prisma } from "@/lib/core/prisma";
import { tenantDb } from "@/lib/core/db";
import type { ExecContext } from "@/lib/core/context";
import { usersWithRole } from "@/lib/core/notify";

/**
 * ORKEST Radar — capa inteligente transversal.
 * Cada detector analiza datos/eventos de una organización y produce Insights:
 *   kind · severity · entity · recommendedAction · responsibleUser
 * Los insights se deduplican por `fingerprint`; si la condición desaparece se resuelven solos.
 * Un detector solo corre si su app está activa en la organización.
 */
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type InsightKind = "RISK" | "OPPORTUNITY" | "EXCEPTION" | "DELAY" | "ANOMALY" | "PENDING_ACTION";

export type DetectedInsight = {
  fingerprint: string;
  kind: InsightKind;
  severity: Severity;
  title: string;
  detail?: string;
  entityType?: string;
  entityId?: string;
  recommendedAction: string;
  responsibleUserId?: string | null;
};

export type Detector = {
  key: string;
  label: string;
  module: string;
  /** Eventos que disparan una re-evaluación inmediata. */
  triggers: string[];
  detect: (ctx: ExecContext, settings: RadarSettings) => Promise<DetectedInsight[]>;
};

export type RadarSettings = {
  staleOpportunityDays: number;
  approvalPendingDays: number;
  repeatedNcThreshold: number;
  repeatedNcWindowDays: number;
};

export const DEFAULT_RADAR_SETTINGS: RadarSettings = {
  staleOpportunityDays: 14,
  approvalPendingDays: 2,
  repeatedNcThreshold: 3,
  repeatedNcWindowDays: 90,
};

const DAY = 86400000;
const n = (v: unknown) => Number(v ?? 0);

async function firstUserOfRole(ctx: ExecContext, ...roles: string[]) {
  for (const r of roles) {
    const [u] = await usersWithRole(ctx, r);
    if (u) return u;
  }
  return null;
}

export const DETECTORS: Detector[] = [
  {
    key: "inventory.below_minimum", label: "Stock bajo el mínimo", module: "inventory",
    triggers: ["StockMoved", "InventoryBelowMinimum", "ProductCreated", "SalesOrderConfirmed"],
    async detect(ctx) {
      const products = await ctx.db.product.findMany({ where: { active: true, minStock: { gt: 0 } } });
      const responsible = await firstUserOfRole(ctx, "INVENTORY", "ADMIN", "OWNER");
      return products
        .filter((p) => n(p.stock) < n(p.minStock))
        .map((p) => ({
          fingerprint: `stock:${p.id}`,
          kind: "RISK" as const,
          severity: n(p.stock) <= 0 ? "CRITICAL" as const : n(p.stock) < n(p.minStock) / 2 ? "HIGH" as const : "MEDIUM" as const,
          title: `Stock bajo: ${p.name}`,
          detail: `Existencia ${n(p.stock)} ${p.unit} · mínimo ${n(p.minStock)}`,
          entityType: "product", entityId: p.id,
          recommendedAction: `Generar orden de compra por al menos ${Math.ceil(n(p.minStock) * 2 - n(p.stock))} ${p.unit}`,
          responsibleUserId: responsible,
        }));
    },
  },
  {
    key: "invoicing.overdue", label: "Facturas vencidas", module: "invoicing",
    triggers: ["InvoiceIssued", "PaymentReceived"],
    async detect(ctx) {
      const now = Date.now();
      const invoices = await ctx.db.invoice.findMany({
        where: { status: "issued", dueDate: { lt: new Date() }, balance: { gt: 0 } },
        include: { customer: true },
      });
      const responsible = await firstUserOfRole(ctx, "FINANCE", "ADMIN", "OWNER");
      return invoices.map((inv) => {
        const days = Math.floor((now - inv.dueDate.getTime()) / DAY);
        return {
          fingerprint: `overdue:${inv.id}`,
          kind: "RISK" as const,
          severity: days > 60 ? "CRITICAL" as const : days > 30 ? "HIGH" as const : "MEDIUM" as const,
          title: `Factura ${inv.number} vencida hace ${days} días`,
          detail: `${inv.customer.name} · saldo ${n(inv.balance).toLocaleString("es-CO")}`,
          entityType: "invoice", entityId: inv.id,
          recommendedAction: days > 30 ? "Escalar a gestión de cartera y suspender crédito" : "Contactar al cliente y acordar fecha de pago",
          responsibleUserId: responsible,
        };
      });
    },
  },
  {
    key: "crm.opportunity_stale", label: "Oportunidades sin actividad", module: "crm",
    triggers: ["OpportunityStatusChanged", "LeadCreated"],
    async detect(ctx, s) {
      const limit = new Date(Date.now() - s.staleOpportunityDays * DAY);
      const opps = await ctx.db.opportunity.findMany({
        where: { status: { notIn: ["won", "lost"] }, lastActivityAt: { lt: limit } },
        include: { customer: true },
      });
      return opps.map((o) => ({
        fingerprint: `stale-opp:${o.id}`,
        kind: "PENDING_ACTION" as const,
        severity: n(o.amount) > 100_000_000 ? "HIGH" as const : "MEDIUM" as const,
        title: `Oportunidad sin actividad: ${o.title}`,
        detail: `${o.customer?.name ?? "Sin cliente"} · ${Math.floor((Date.now() - o.lastActivityAt.getTime()) / DAY)} días sin seguimiento`,
        entityType: "opportunity", entityId: o.id,
        recommendedAction: "Programar llamada o reunión de seguimiento",
        responsibleUserId: o.ownerId,
      }));
    },
  },
  {
    key: "sales.approval_delay", label: "Aprobaciones retrasadas", module: "sales",
    triggers: ["ApprovalRequested", "ApprovalDecided"],
    async detect(ctx, s) {
      const limit = new Date(Date.now() - s.approvalPendingDays * DAY);
      const pending = await ctx.db.approval.findMany({ where: { status: "PENDING", createdAt: { lt: limit } } });
      const out: DetectedInsight[] = [];
      for (const a of pending) {
        out.push({
          fingerprint: `approval-delay:${a.id}`,
          kind: "DELAY", severity: "HIGH",
          title: `Aprobación pendiente hace más de ${s.approvalPendingDays} días`,
          detail: a.reason,
          entityType: a.entityType, entityId: a.entityId,
          recommendedAction: `Decidir la aprobación (rol ${a.requiredRoleKey})`,
          responsibleUserId: await firstUserOfRole(ctx, a.requiredRoleKey),
        });
      }
      return out;
    },
  },
  {
    key: "quality.repeated_issue", label: "Problemas de calidad repetidos", module: "quality",
    triggers: ["NonconformityCreated"],
    async detect(ctx, s) {
      const since = new Date(Date.now() - s.repeatedNcWindowDays * DAY);
      const groups = await ctx.db.nonconformity.groupBy({
        by: ["supplierId"], where: { createdAt: { gte: since }, supplierId: { not: null } }, _count: { _all: true },
      });
      const flagged = groups.filter((g) => g._count._all >= s.repeatedNcThreshold);
      if (flagged.length === 0) return [];
      const suppliers = await ctx.db.supplier.findMany({ where: { id: { in: flagged.map((g) => g.supplierId!) } } });
      const responsible = await firstUserOfRole(ctx, "QUALITY", "ADMIN", "OWNER");
      return flagged.map((g) => {
        const sup = suppliers.find((x) => x.id === g.supplierId);
        return {
          fingerprint: `supplier-nc:${g.supplierId}`,
          kind: "ANOMALY" as const,
          severity: g._count._all >= s.repeatedNcThreshold * 2 ? "CRITICAL" as const : "HIGH" as const,
          title: `Deterioro del proveedor ${sup?.name ?? ""}`,
          detail: `${g._count._all} no conformidades en ${s.repeatedNcWindowDays} días`,
          entityType: "supplier", entityId: g.supplierId!,
          recommendedAction: "Abrir plan de acción con el proveedor y evaluar proveedores alternos",
          responsibleUserId: responsible,
        };
      });
    },
  },
  {
    key: "knowledge.dependency", label: "Dependencia de conocimiento", module: "knowledge",
    triggers: ["KnowledgePublished", "SonarItemCreated"],
    async detect(ctx) {
      // Proceso crítico → DEPENDS_ON → conocimiento → cuyo dueño es una sola persona sin respaldo (BACKUP_FOR)
      const processes = await ctx.db.knowledgeItem.findMany({ where: { type: "PROCESS", criticality: { in: ["HIGH", "CRITICAL"] } } });
      if (processes.length === 0) return [];
      const deps = await ctx.db.graphEdge.findMany({
        where: { fromType: "KNOWLEDGE", fromId: { in: processes.map((p) => p.id) }, relation: "DEPENDS_ON", toType: "KNOWLEDGE" },
      });
      const knowledge = await ctx.db.knowledgeItem.findMany({ where: { id: { in: deps.map((d) => d.toId) } } });
      const backups = await ctx.db.graphEdge.findMany({
        where: { relation: "BACKUP_FOR", toType: "KNOWLEDGE", toId: { in: knowledge.map((k) => k.id) } },
      });
      const users = await prisma.user.findMany({ where: { id: { in: knowledge.map((k) => k.ownerId ?? "").filter(Boolean) } } });
      const out: DetectedInsight[] = [];
      for (const d of deps) {
        const proc = processes.find((p) => p.id === d.fromId)!;
        const k = knowledge.find((x) => x.id === d.toId);
        if (!k) continue;
        const hasBackup = backups.some((b) => b.toId === k.id);
        if (k.ownerId && !hasBackup) {
          const owner = users.find((u) => u.id === k.ownerId);
          out.push({
            fingerprint: `kdep:${proc.id}:${k.id}`,
            kind: "RISK", severity: proc.criticality === "CRITICAL" ? "CRITICAL" : "HIGH",
            title: `"${proc.title}" depende del conocimiento de una sola persona`,
            detail: `Depende de "${k.title}", cuyo único dueño es ${owner?.name ?? "un usuario"} (sin respaldo)`,
            entityType: "knowledge", entityId: proc.id,
            recommendedAction: "Documentar el conocimiento en una sesión Sonar y asignar un respaldo (BACKUP_FOR)",
            responsibleUserId: k.ownerId,
          });
        }
        if (!k.ownerId) {
          out.push({
            fingerprint: `kdep-noowner:${k.id}`,
            kind: "RISK", severity: "MEDIUM",
            title: `Conocimiento crítico sin dueño: ${k.title}`,
            entityType: "knowledge", entityId: k.id,
            recommendedAction: "Asignar un dueño responsable del conocimiento",
          });
        }
      }
      return out;
    },
  },
  {
    key: "purchasing.late_receipt", label: "Compras atrasadas", module: "purchasing",
    triggers: ["PurchaseOrderConfirmed", "TransferDone"],
    async detect(ctx) {
      const pos = await ctx.db.purchaseOrder.findMany({ where: { status: "purchase", receiptStatus: { not: "full" }, expectedAt: { lt: new Date() } }, include: { supplier: true } });
      const responsible = await firstUserOfRole(ctx, "INVENTORY", "ADMIN", "OWNER");
      return pos.map((po) => {
        const days = Math.floor((Date.now() - po.expectedAt!.getTime()) / DAY);
        return {
          fingerprint: `late-po:${po.id}`, kind: "DELAY" as const, severity: days > 10 ? "HIGH" as const : "MEDIUM" as const,
          title: `OC ${po.number} atrasada ${days} días`, detail: `${po.supplier.name} · recepción ${po.receiptStatus === "partial" ? "parcial" : "pendiente"}`,
          entityType: "purchase_order", entityId: po.id, recommendedAction: "Contactar al proveedor y reprogramar la recepción", responsibleUserId: responsible,
        };
      });
    },
  },
  {
    key: "manufacturing.delay", label: "Producción retrasada", module: "manufacturing",
    triggers: ["ProductionStarted", "ProductionCompleted", "ProductionConfirmed"],
    async detect(ctx) {
      const mos = await ctx.db.productionOrder.findMany({ where: { status: { in: ["confirmed", "in_progress"] }, scheduledAt: { lt: new Date(Date.now() - DAY) } } });
      const responsible = await firstUserOfRole(ctx, "PRODUCTION", "ADMIN", "OWNER");
      return mos.map((mo) => ({
        fingerprint: `mo-delay:${mo.id}`, kind: "DELAY" as const, severity: "HIGH" as const,
        title: `Producción ${mo.number} retrasada`, detail: `Programada para ${mo.scheduledAt.toLocaleDateString("es-CO")} · producido ${n(mo.producedQty)}/${n(mo.quantity)}`,
        entityType: "production", entityId: mo.id, recommendedAction: "Revisar disponibilidad de componentes y capacidad del centro de trabajo", responsibleUserId: mo.ownerId ?? responsible,
      }));
    },
  },
  {
    key: "sales.late_delivery", label: "Entregas atrasadas", module: "sales",
    triggers: ["SalesOrderConfirmed", "DeliveryDone"],
    async detect(ctx) {
      const sos = await ctx.db.salesOrder.findMany({ where: { status: "confirmed", deliveryStatus: { not: "full" }, commitmentAt: { lt: new Date() } }, include: { customer: true } });
      return sos.map((so) => ({
        fingerprint: `late-so:${so.id}`, kind: "DELAY" as const, severity: "HIGH" as const,
        title: `Pedido ${so.number} con entrega atrasada`, detail: so.customer.name,
        entityType: "sales_order", entityId: so.id, recommendedAction: "Priorizar el despacho o informar nueva fecha al cliente", responsibleUserId: so.ownerId,
      }));
    },
  },
  {
    key: "inventory.manual_replenishment", label: "Reabastecimiento manual pendiente", module: "inventory",
    triggers: ["StockMoved"],
    async detect(ctx) {
      const { forecastAt } = await import("@/lib/apps/replenishment");
      const rules = await ctx.db.reorderRule.findMany({ where: { active: true, trigger: "MANUAL" } });
      const responsible = await firstUserOfRole(ctx, "INVENTORY", "ADMIN", "OWNER");
      const out: DetectedInsight[] = [];
      for (const r of rules) {
        const { forecast } = await forecastAt(ctx, r.productId, r.locationId);
        if (forecast >= n(r.minQty)) continue;
        const p = await ctx.db.product.findUnique({ where: { id: r.productId } });
        out.push({
          fingerprint: `manual-rr:${r.id}`, kind: "PENDING_ACTION", severity: "MEDIUM",
          title: `Reabastecer ${p?.name ?? ""}`, detail: `Pronóstico ${forecast} < mínimo ${n(r.minQty)}`,
          entityType: "product", entityId: r.productId, recommendedAction: "Ejecutar la regla desde Inventario → Reabastecimiento", responsibleUserId: responsible,
        });
      }
      return out;
    },
  },
];

export async function radarSettings(orgId: string): Promise<RadarSettings> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
  const s = ((org?.settings ?? {}) as { radar?: Partial<RadarSettings> }).radar ?? {};
  return { ...DEFAULT_RADAR_SETTINGS, ...s };
}

async function enabledModules(orgId: string) {
  const mods = await prisma.organizationModule.findMany({ where: { organizationId: orgId, enabled: true } });
  return new Set(mods.map((m) => m.moduleKey));
}

/** Ejecuta detectores y sincroniza insights (crea, actualiza, auto-resuelve). */
export async function runRadar(ctx: ExecContext, onlyKeys?: string[]) {
  const modules = await enabledModules(ctx.orgId);
  if (!modules.has("radar")) return { detected: 0 };
  const settings = await radarSettings(ctx.orgId);
  const detectors = DETECTORS.filter((d) => modules.has(d.module) && (!onlyKeys || onlyKeys.includes(d.key)));
  let detected = 0;

  for (const d of detectors) {
    const found = await d.detect(ctx, settings);
    detected += found.length;
    for (const i of found) {
      await ctx.db.insight.upsert({
        where: { organizationId_fingerprint: { organizationId: ctx.orgId, fingerprint: i.fingerprint } },
        create: { organizationId: ctx.orgId, detectorKey: d.key, ...i },
        update: {
          severity: i.severity, title: i.title, detail: i.detail, recommendedAction: i.recommendedAction,
          responsibleUserId: i.responsibleUserId,
        },
      });
    }
    // Reabre los que volvieron a aparecer tras resolverse
    await ctx.db.insight.updateMany({
      where: { detectorKey: d.key, status: "RESOLVED", fingerprint: { in: found.map((f) => f.fingerprint) } },
      data: { status: "OPEN", resolvedAt: null, detectedAt: new Date() },
    });
    // Auto-resuelve los que ya no se detectan
    await ctx.db.insight.updateMany({
      where: { detectorKey: d.key, status: { not: "RESOLVED" }, fingerprint: { notIn: found.map((f) => f.fingerprint) } },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  }
  return { detected };
}

export async function runRadarForEvent(ctx: ExecContext, eventType: string) {
  const keys = DETECTORS.filter((d) => d.triggers.includes(eventType)).map((d) => d.key);
  if (keys.length) await runRadar(ctx, keys);
}

/** Barrido completo de todas las organizaciones activas (cron). */
export async function runRadarAllOrgs() {
  const orgs = await prisma.organization.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  for (const o of orgs) await runRadar({ orgId: o.id, db: tenantDb(o.id), actorId: null });
  return orgs.length;
}
