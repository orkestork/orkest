import { prisma } from "@/lib/core/prisma";
import type { OrgContext } from "@/lib/core/context";

/** Datos legales de la empresa para documentos (razón social y NIT). */
export async function orgForDocs(ctx: OrgContext) {
  const o = await prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { legalName: true, taxId: true } });
  return { ...ctx.org, legalName: o?.legalName ?? null, taxId: o?.taxId ?? null };
}
