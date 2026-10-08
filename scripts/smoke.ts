import "dotenv/config";
import { prisma } from "@/lib/core/prisma";
async function main() {
  const o = await prisma.organization.findUniqueOrThrow({ where: { slug: "presservac" } });
  const w = { organizationId: o.id };
  const first = async (m: string, extra = {}) => (await (prisma as any)[m].findFirst({ where: { ...w, ...extra } }))?.id;
  const paths = [
    "/", "/dashboard", "/crm/customers", "/crm/opportunities", "/sales/quotes", "/sales/orders", "/sales/orders/new", "/sales/pricelists",
    "/products", "/inventory", "/inventory/transfers", "/inventory/transfers/new", "/inventory/replenishment", "/inventory/warehouses",
    "/purchasing/requisitions", "/purchasing/requisitions/new", "/purchasing/orders", "/purchasing/orders/new", "/purchasing/suppliers",
    "/manufacturing/orders", "/manufacturing/orders/new", "/manufacturing/boms", "/manufacturing/boms/new", "/manufacturing/workcenters", "/manufacturing/planning",
    "/invoicing", "/invoicing/bills", "/invoicing/payments", "/invoicing/config", "/quality", "/knowledge", "/radar", "/analytics", "/approvals", "/tasks",
    "/studio", "/studio/objects", "/studio/fields", "/studio/workflows", "/studio/automations", "/studio/automations/new", "/settings/roles", "/settings/modules",
    "/x/visita", "/x/visita/new", "/import", "/ask?q=cartera", "/search?q=PV",
    `/inventory/transfers/${await first("transfer", { status: "ready" })}`, `/purchasing/orders/${await first("purchaseOrder", { status: "purchase" })}`,
    `/purchasing/requisitions/${await first("requisition")}`, `/manufacturing/orders/${await first("productionOrder", { status: "in_progress" })}`,
    `/sales/orders/${await first("salesOrder")}`, `/invoicing/${await first("invoice")}`, `/x/visita/${await first("customRecord")}`,
    `/studio/workflows/${await first("workflow", { entityType: "x:visita" })}`, `/studio/workflows/${await first("workflow", { entityType: "purchase_order" })}`,
  ];
  console.log(paths.join("\n"));
}
main().finally(() => prisma.$disconnect());
