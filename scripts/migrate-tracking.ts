import "dotenv/config";
import { prisma } from "@/lib/core/prisma";

/** Convierte "Estado: a → b (fuente)" (formato antiguo) en "Estado: Etiqueta A → Etiqueta B · fuente" tipo TRACKING. */
async function main() {
  const acts = await prisma.activity.findMany({ where: { content: { startsWith: "Estado: " }, type: "SYSTEM" } });
  const wfs = await prisma.workflow.findMany({ include: { states: true } });
  let n = 0;
  for (const a of acts) {
    const m = a.content.match(/^Estado: (\S+) → (\S+) \((.+)\)$/);
    if (!m) continue;
    const wf = wfs.find((w) => w.organizationId === a.organizationId && w.entityType === a.entityType);
    const label = (k: string) => wf?.states.find((s) => s.key === k)?.label ?? k;
    await prisma.activity.update({ where: { id: a.id }, data: { type: "TRACKING", content: `Estado: ${label(m[1])} → ${label(m[2])} · ${m[3]}` } });
    n++;
  }
  console.log("migradas:", n);
}
main().finally(() => prisma.$disconnect());
