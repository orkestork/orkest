import "dotenv/config";
import { prisma } from "@/lib/core/prisma";
import { tenantDb } from "@/lib/core/db";
import type { ExecContext, OrgContext } from "@/lib/core/context";
import { ensureBaseRoles, applyTemplate } from "@/lib/templates/apply";
import { createWarehouse, quickMove, validateTransfer, qtyAt } from "@/lib/apps/stock";
import { createProduct } from "@/lib/apps/inventory";
import { createPurchaseOrder, createRequisition, rfqFromRequisition } from "@/lib/apps/purchasing";
import { runReplenishment } from "@/lib/apps/replenishment";
import { executeTransition, getWorkflow } from "@/lib/core/workflow";
import { decideApproval } from "@/lib/core/approvals";

async function main() {
  await prisma.organization.deleteMany({ where: { slug: "test-f1" } });
  const o = await prisma.organization.create({ data: { slug: "test-f1", name: "Test F1", status: "ACTIVE" } });
  const u = await prisma.user.upsert({ where: { email: "test-f1@x.co" }, update: {}, create: { email: "test-f1@x.co", name: "Tester", passwordHash: "x" } });
  const base: ExecContext = { orgId: o.id, db: tenantDb(o.id), actorId: u.id };
  await ensureBaseRoles(base);
  const role = await base.db.role.findFirstOrThrow({ where: { key: "OWNER" } });
  await base.db.membership.create({ data: { organizationId: o.id, userId: u.id, roleId: role.id } });
  const ctx = { ...base, user: { ...u, isPlatformAdmin: false }, role: { id: role.id, key: "OWNER", name: "x" }, can: () => true, hasModule: () => true } as unknown as OrgContext;
  const mp = await createWarehouse(ctx, { code: "MP", name: "Materia prima" });
  await applyTemplate(ctx, "manufacturing");
  const pt = await createWarehouse(ctx, { code: "PT", name: "Producto terminado" });
  const sup = await ctx.db.supplier.create({ data: { organizationId: o.id, name: "Proveedor X" } });
  const lam = await createProduct(ctx, { sku: "LAM", name: "Lámina", cost: 500000, stock: 10, defaultSupplierId: sup.id });
  console.log("1. existencia inicial MP:", await qtyAt(ctx, lam.id, mp.stockLocationId!), "| product.stock:", Number((await ctx.db.product.findUniqueOrThrow({ where: { id: lam.id } })).stock));

  // Traslado MP→PT parcial con backorder
  const op = await ctx.db.operationType.findFirstOrThrow({ where: { warehouseId: pt.id, kind: "INTERNAL" } });
  const { createTransfer } = await import("@/lib/apps/stock");
  const t = await createTransfer(ctx, { operationTypeId: op.id, srcLocationId: mp.stockLocationId!, destLocationId: pt.stockLocationId!, lines: [{ productId: lam.id, quantity: 6 }] });
  const line = (await ctx.db.transferLine.findFirstOrThrow({ where: { transferId: t.id } }));
  const r = await validateTransfer(ctx, t.id, { [line.id]: 4 });
  console.log("2. traslado parcial → MP:", await qtyAt(ctx, lam.id, mp.stockLocationId!), "PT:", await qtyAt(ctx, lam.id, pt.stockLocationId!), "backorder:", !!r.backorderId);
  try { await quickMove(ctx, lam.id, "OUT", 999); } catch (e) { console.log("3. salida sin stock bloqueada:", (e as Error).message.slice(0, 60)); }

  // Regla de reabastecimiento BUY en MP
  await ctx.db.reorderRule.create({ data: { organizationId: o.id, productId: lam.id, locationId: mp.stockLocationId!, minQty: 10, maxQty: 30, action: "BUY" } });
  const rr = await runReplenishment(ctx, { manual: true });
  console.log("4. reabastecimiento:", rr.map((x) => `${x.qty} → ${x.document ?? x.skipped}`));
  const rr2 = await runReplenishment(ctx, { manual: true });
  console.log("5. segunda corrida no duplica:", rr2.length === 0);

  // Requisición → aprobación → SdC → OC > 2M requiere aprobación → aprobar → recepción
  const rq = await createRequisition(ctx, { area: "Producción", lines: [{ productId: lam.id, description: "Lámina", quantity: 8 }] });
  const wfR = await getWorkflow(ctx.db, "requisition");
  await executeTransition(ctx, "requisition", rq.id, wfR!.transitions.find((x) => x.toKey === "submitted")!.id);
  await executeTransition(ctx, "requisition", rq.id, wfR!.transitions.find((x) => x.toKey === "approved")!.id);
  const po = await rfqFromRequisition(ctx, rq.id, sup.id);
  console.log("6. SdC desde RQ:", po.number, "total", Number(po.total), "| RQ:", (await ctx.db.requisition.findUniqueOrThrow({ where: { id: rq.id } })).status);
  const wfP = await getWorkflow(ctx.db, "purchase_order");
  const conf = wfP!.transitions.find((x) => x.fromKey === "draft" && x.toKey === "purchase")!;
  const res = await executeTransition(ctx, "purchase_order", po.id, conf.id);
  console.log("7. confirmar OC grande → aprobación pendiente:", res.pendingApproval, (await ctx.db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status);
  const ap = await ctx.db.approval.findFirstOrThrow({ where: { entityId: po.id, status: "PENDING" } });
  await decideApproval(ctx, ap.id, true, "ok");
  const rec = await ctx.db.transfer.findFirst({ where: { sourceType: "purchase_order", sourceId: po.id } });
  console.log("8. aprobada → estado:", (await ctx.db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status, "| recepción:", rec?.number, rec?.status);
  await validateTransfer(ctx, rec!.id);
  const po2 = await ctx.db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
  console.log("9. recibida →", po2.status, po2.receiptStatus, "| RQ:", (await ctx.db.requisition.findUniqueOrThrow({ where: { id: rq.id } })).status, "| MP:", await qtyAt(ctx, lam.id, mp.stockLocationId!));
  // OC pequeña no requiere aprobación
  const small = await createPurchaseOrder(ctx, { supplierId: sup.id, warehouseId: mp.id, lines: [{ productId: lam.id, description: "Lámina", quantity: 1, unitPrice: 100000 }] });
  const r2 = await executeTransition(ctx, "purchase_order", small.id, conf.id);
  console.log("10. OC pequeña confirmada directo:", !r2.pendingApproval, (await ctx.db.purchaseOrder.findUniqueOrThrow({ where: { id: small.id } })).status);
  const ev = await ctx.db.domainEvent.groupBy({ by: ["status"], _count: true });
  console.log("11. eventos:", ev);
  await prisma.organization.delete({ where: { id: o.id } });
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
