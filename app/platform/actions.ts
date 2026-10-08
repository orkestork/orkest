"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/core/prisma";
import { requirePlatformAdmin } from "@/lib/core/context";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Acciones de OR-K sobre organizaciones: estado y plan. Quedan en la auditoría de plataforma. */
export async function platformOrgAction(form: FormData) {
  const admin = await requirePlatformAdmin();
  const orgId = s(form, "orgId");
  const op = s(form, "op");
  if (op === "status") {
    const status = s(form, "status");
    if (!["ACTIVE", "SUSPENDED"].includes(status)) throw new Error("Estado inválido");
    await prisma.organization.update({ where: { id: orgId }, data: { status } });
  } else if (op === "plan") {
    const planKey = s(form, "planKey");
    await prisma.subscription.upsert({ where: { organizationId: orgId }, create: { organizationId: orgId, planKey, status: "ACTIVE" }, update: { planKey } });
  } else if (op === "flag") {
    const flagKey = s(form, "flagKey");
    const enabled = s(form, "enabled") === "1";
    await prisma.organizationFeatureFlag.upsert({ where: { organizationId_flagKey: { organizationId: orgId, flagKey } }, create: { organizationId: orgId, flagKey, enabled }, update: { enabled } });
  }
  await prisma.platformAuditLog.create({ data: { actorId: admin.id, action: `org.${op}`, targetOrg: orgId, details: Object.fromEntries(form.entries()) as object } });
  revalidatePath("/platform");
}
