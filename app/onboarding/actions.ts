"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/core/prisma";
import { tenantDb } from "@/lib/core/db";
import { getSessionUser } from "@/lib/core/context";
import { writeSession } from "@/lib/core/auth";
import { applyTemplate, ensureBaseRoles } from "@/lib/templates/apply";
import { getTemplate } from "@/lib/templates/industries";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const slugify = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Paso 1 del onboarding: crea la organización, aplica la plantilla y deja al usuario como propietario. */
export async function createOrganization(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const session = await getSessionUser();
    if (!session) redirect("/login");
    const name = s(form, "name");
    if (name.length < 2) return { error: "Escribe el nombre de la empresa" };
    const tpl = getTemplate(s(form, "template"));
    if (!tpl || tpl.status !== "available") return { error: "Elige una plantilla de industria" };
    let slug = slugify(name) || "empresa";
    if (await prisma.organization.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const org = await prisma.organization.create({ data: {
      slug, name, legalName: s(form, "legalName") || null, taxId: s(form, "taxId") || null, status: "ACTIVE", onboardingStep: 2,
      branding: { displayName: name, primaryColor: s(form, "color") || "#6f35b5" },
    } });
    const ctx = { orgId: org.id, db: tenantDb(org.id), actorId: session.user.id };
    await ensureBaseRoles(ctx);
    await applyTemplate(ctx, tpl.key);
    const owner = await ctx.db.role.findFirstOrThrow({ where: { key: "OWNER" } });
    await ctx.db.membership.create({ data: { organizationId: org.id, userId: session.user.id, roleId: owner.id, title: "Propietario" } });
    if (await prisma.plan.findUnique({ where: { key: "growth" } })) await prisma.subscription.create({ data: { organizationId: org.id, planKey: "growth", status: "TRIAL" } });
    await writeSession({ sub: session.user.id, org: org.id });
    redirect("/");
  });
}
