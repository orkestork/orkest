import "dotenv/config";
import { prisma } from "@/lib/core/prisma";
async function main() {
  const o = await prisma.organization.findUniqueOrThrow({ where: { slug: "presservac" } });
  const w = { organizationId: o.id };
  const g = async (m: string, by: string) => (await (prisma as any)[m].groupBy({ by: [by], where: w, _count: true })).map((x: any) => `${x[by]}:${x._count}`).join(" ");
  console.log("Transferencias:", await g("transfer", "status"));
  console.log("OC:", await g("purchaseOrder", "status"), "| RQ:", await g("requisition", "status"));
  console.log("OP:", await g("productionOrder", "status"), "| Pedidos:", await g("salesOrder", "deliveryStatus"));
  console.log("Facturas:", await g("invoice", "status"), "| Fact. proveedor:", await g("bill", "status"), "| Pagos:", await prisma.payment.count({ where: w }));
  console.log("Aprobaciones:", await g("approval", "status"));
  console.log("Eventos:", await g("domainEvent", "status"));
  const fails = await prisma.domainEvent.findMany({ where: { ...w, status: "FAILED" }, select: { type: true, error: true }, take: 5 });
  if (fails.length) console.log("FALLOS:", fails);
  console.log("Radar:", (await prisma.insight.findMany({ where: { ...w, status: "OPEN" }, select: { severity: true, title: true } })).map((i) => `[${i.severity}] ${i.title}`).join("\n       "));
  console.log("Visitas:", await prisma.customRecord.count({ where: w }), "| Tareas:", await prisma.task.count({ where: w }));
  const runs = await prisma.automationRun.findMany({ where: { ...w, error: { not: null } }, select: { error: true }, take: 3 });
  if (runs.length) console.log("ERRORES AUTOMATIZACIÓN:", runs);
}
main().finally(() => prisma.$disconnect());
