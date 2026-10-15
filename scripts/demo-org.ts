import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/core/prisma";
import { tenantDb } from "@/lib/core/db";
import type { ExecContext } from "@/lib/core/context";
import { hashPassword } from "@/lib/core/auth";
import { applyTemplate, ensureBaseRoles } from "@/lib/templates/apply";
import { createWarehouse } from "@/lib/apps/stock";

/**
 * Empresa de demostración vacía para el acceso público /demo (PUBLIC_DEMO_EMAIL=demo@orkezt.com).
 * Solo configuración: todos los módulos, roles y plantilla, sin clientes, productos ni documentos.
 * Idempotente: si ya existe, no hace nada.
 */
const SLUG = "demo";
const EMAIL = "demo@orkezt.com";

async function main() {
  if (await prisma.organization.findUnique({ where: { slug: SLUG } })) {
    console.log("La empresa demo ya existe.");
    return;
  }
  const o = await prisma.organization.create({
    data: { slug: SLUG, name: "Empresa Demo", status: "ACTIVE", onboardingStep: 11, industry: "Manufactura", branding: { displayName: "Empresa Demo" } },
  });
  const ctx = { orgId: o.id, db: tenantDb(o.id), actorId: null } as ExecContext;
  await prisma.subscription.create({ data: { organizationId: o.id, planKey: "enterprise", status: "TRIAL" } });
  await ensureBaseRoles(ctx);
  await createWarehouse(ctx, { code: "PRI", name: "Bodega principal" });
  await applyTemplate(ctx, "manufacturing");

  // Clave aleatoria que nadie conoce: solo se entra por /demo.
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: "Usuario Demo", passwordHash: await hashPassword(randomBytes(24).toString("hex")) },
  });
  const owner = await ctx.db.role.findFirstOrThrow({ where: { key: "OWNER" } });
  await ctx.db.membership.create({ data: { organizationId: o.id, userId: user.id, roleId: owner.id, title: "Demo" } });
  console.log(`✔ Empresa demo creada. En Vercel: PUBLIC_DEMO_EMAIL=${EMAIL}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
