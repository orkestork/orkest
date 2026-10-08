import "dotenv/config";
import { prisma } from "@/lib/core/prisma";
import { tenantDb } from "@/lib/core/db";
import type { ExecContext } from "@/lib/core/context";
import { archiveWarehouse, createWarehouse, transferBetweenWarehouses, qtyAt } from "@/lib/apps/stock";
import { createProduct } from "@/lib/apps/inventory";

async function main() {
  await prisma.organization.deleteMany({ where: { slug: "test-wh" } });
  const o = await prisma.organization.create({ data: { slug: "test-wh", name: "Test WH", status: "ACTIVE" } });
  const ctx: ExecContext = { orgId: o.id, db: tenantDb(o.id), actorId: null };
  const whs = [];
  for (let i = 1; i <= 10; i++) whs.push(await createWarehouse(ctx, { code: `B${i}`, name: `Bodega ${i}` }));
  try { await createWarehouse(ctx, { code: "B11", name: "Once" }); } catch (e) { console.log("1. límite:", (e as Error).message); }
  const p = await createProduct(ctx, { sku: "X", name: "Producto X", stock: 10 });
  try { await archiveWarehouse(ctx, whs[0].id); } catch (e) { console.log("2. archivar con stock:", (e as Error).message); }
  await transferBetweenWarehouses(ctx, { productId: p.id, fromWarehouseId: whs[0].id, toWarehouseId: whs[1].id, quantity: 4, validate: true });
  console.log("3. traslado 4 → B1:", await qtyAt(ctx, p.id, whs[0].stockLocationId!), "B2:", await qtyAt(ctx, p.id, whs[1].stockLocationId!));
  try { await transferBetweenWarehouses(ctx, { productId: p.id, fromWarehouseId: whs[0].id, toWarehouseId: whs[1].id, quantity: 99, validate: true }); } catch (e) { console.log("4. sin stock:", (e as Error).message.slice(0, 60), "| abiertas:", await ctx.db.transfer.count({ where: { status: { notIn: ["done", "canceled"] } } })); }
  const pend = await transferBetweenWarehouses(ctx, { productId: p.id, fromWarehouseId: whs[1].id, toWarehouseId: whs[2].id, quantity: 1, validate: false });
  console.log("5. pendiente:", pend.number, (await ctx.db.transfer.findUniqueOrThrow({ where: { id: pend.id } })).status);
  await archiveWarehouse(ctx, whs[9].id);
  await createWarehouse(ctx, { code: "B11", name: "Once" });
  console.log("6. tras archivar uno se puede crear otro:", await ctx.db.warehouse.count({ where: { active: true } }), "activos");
  await prisma.organization.delete({ where: { id: o.id } });
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
