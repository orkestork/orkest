"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/core/prisma";
import { actionContext } from "@/lib/core/context";
import { hashPassword } from "@/lib/core/auth";
import { hasPermission } from "@/lib/core/permissions";
import { audit } from "@/lib/core/notify";
import { generateApiKey } from "@/lib/core/api-auth";
import { attemptDelivery, newWebhookSecret } from "@/lib/core/webhooks";
import { getModule, missingDependencies } from "@/lib/modules/registry";
import { enableModules } from "@/lib/templates/apply";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveCompany(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("org.settings.manage");
    const color = s(form, "primaryColor");
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { error: "Color inválido (usa #RRGGBB)" };
    const settings = {
      ...ctx.org.settings,
      radar: {
        staleOpportunityDays: Number(s(form, "staleOpportunityDays") || 14),
        approvalPendingDays: Number(s(form, "approvalPendingDays") || 2),
        repeatedNcThreshold: Number(s(form, "repeatedNcThreshold") || 3),
        repeatedNcWindowDays: 90,
      },
    };
    await prisma.organization.update({
      where: { id: ctx.orgId },
      data: {
        name: s(form, "name") || ctx.org.name, legalName: s(form, "legalName") || null, taxId: s(form, "taxId") || null,
        currency: s(form, "currency") || "COP", timezone: s(form, "timezone") || "America/Bogota",
        branding: { primaryColor: color || undefined, displayName: s(form, "displayName") || undefined, logoUrl: s(form, "logoUrl") || undefined },
        settings,
      },
    });
    await audit(ctx, "OrganizationUpdated", "organization", ctx.orgId, {});
    revalidatePath("/", "layout");
    return { ok: "Configuración guardada" };
  });
}

export async function inviteUser(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("org.users.manage");
    const email = s(form, "email").toLowerCase();
    const role = await ctx.db.role.findUnique({ where: { id: s(form, "roleId") } });
    if (!email || !role) return { error: "Email y rol son obligatorios" };
    if (role.key === "OWNER" && ctx.role.key !== "OWNER") return { error: "Solo un propietario puede asignar el rol Propietario" };
    let user = await prisma.user.findUnique({ where: { email } });
    let tempPassword: string | null = null;
    if (!user) {
      tempPassword = Math.random().toString(36).slice(2, 10);
      user = await prisma.user.create({ data: { email, name: s(form, "name") || email.split("@")[0], passwordHash: await hashPassword(tempPassword) } });
    }
    const exists = await ctx.db.membership.findFirst({ where: { userId: user.id } });
    if (exists) return { error: "El usuario ya pertenece a esta organización" };
    await ctx.db.membership.create({ data: { organizationId: ctx.orgId, userId: user.id, roleId: role.id, title: s(form, "title") || null } });
    await audit(ctx, "UserInvited", "user", user.id, { email, role: role.key });
    revalidatePath("/settings/users");
    return { ok: tempPassword ? `Usuario creado. Contraseña temporal: ${tempPassword}` : "Usuario existente agregado a la organización" };
  });
}

export async function updateMembership(form: FormData) {
  const ctx = await actionContext("org.users.manage");
  const m = await ctx.db.membership.findUniqueOrThrow({ where: { id: s(form, "id") }, include: { role: true } });
  if (m.userId === ctx.user.id) throw new Error("No puedes modificar tu propio acceso");
  if (m.role.key === "OWNER" && ctx.role.key !== "OWNER") throw new Error("Solo un propietario puede modificar a otro propietario");
  const roleId = s(form, "roleId");
  const status = s(form, "status");
  if (roleId) {
    const target = await ctx.db.role.findUniqueOrThrow({ where: { id: roleId } });
    if (target.key === "OWNER" && ctx.role.key !== "OWNER") throw new Error("Solo un propietario puede asignar el rol Propietario");
  }
  await ctx.db.membership.update({ where: { id: m.id }, data: { ...(roleId ? { roleId } : {}), ...(status ? { status } : {}) } });
  await audit(ctx, "MembershipUpdated", "membership", m.id, { roleId, status });
  revalidatePath("/settings/users");
}

export async function saveRole(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("org.roles.manage");
    const permissions = form.getAll("permissions").map(String);
    // Nadie puede otorgar permisos que no tiene (anti-escalamiento)
    const escalated = permissions.filter((p) => !hasPermission(ctx.permissions, p));
    if (escalated.length) return { error: `No puedes otorgar permisos que no tienes: ${escalated.join(", ")}` };
    const id = s(form, "id");
    if (id) {
      const role = await ctx.db.role.findUniqueOrThrow({ where: { id } });
      if (role.isSystem) return { error: "El rol Propietario no se puede modificar" };
      await ctx.db.role.update({ where: { id }, data: { name: s(form, "name") || role.name, permissions } });
    } else {
      const key = s(form, "key").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      if (!key || !s(form, "name")) return { error: "Clave y nombre son obligatorios" };
      if (await ctx.db.role.findFirst({ where: { key } })) return { error: "Ya existe un rol con esa clave" };
      await ctx.db.role.create({ data: { organizationId: ctx.orgId, key, name: s(form, "name"), permissions } });
    }
    await audit(ctx, "RoleSaved", "role", id || null, { permissions });
    revalidatePath("/settings/roles");
    return { ok: "Rol guardado" };
  });
}

export async function toggleModule(form: FormData) {
  const ctx = await actionContext("org.modules.manage");
  const key = s(form, "key");
  const mod = getModule(key);
  if (!mod || mod.status !== "available") throw new Error("Módulo no disponible");
  const wasOn = ctx.modules.has(key);
  if (wasOn) {
    const dependents = [...ctx.modules].filter((k) => getModule(k)?.dependsOn?.includes(key));
    if (dependents.length) throw new Error(`Primero desactiva: ${dependents.join(", ")}`);
    await ctx.db.organizationModule.updateMany({ where: { moduleKey: key }, data: { enabled: false } });
  } else {
    await enableModules(ctx, [key, ...missingDependencies(key, ctx.modules)]);
  }
  await audit(ctx, wasOn ? "ModuleDisabled" : "ModuleEnabled", "module", key);
  revalidatePath("/", "layout");
}

export async function createWebhook(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("integrations.manage");
    try { new URL(s(form, "url")); } catch { return { error: "URL inválida" }; }
    const events = s(form, "events").split(",").map((e) => e.trim()).filter(Boolean);
    if (!events.length) return { error: "Indica al menos un evento (o *)" };
    const secret = newWebhookSecret();
    await ctx.db.webhookEndpoint.create({ data: { organizationId: ctx.orgId, url: s(form, "url"), description: s(form, "description") || null, events, secret } });
    await audit(ctx, "WebhookCreated", "webhook", null, { url: s(form, "url"), events });
    revalidatePath("/settings/integrations");
    return { ok: `Webhook creado. Secreto de firma: ${secret}` };
  });
}

export async function toggleWebhook(form: FormData) {
  const ctx = await actionContext("integrations.manage");
  const w = await ctx.db.webhookEndpoint.findUniqueOrThrow({ where: { id: s(form, "id") } });
  await ctx.db.webhookEndpoint.update({ where: { id: w.id }, data: { active: !w.active } });
  revalidatePath("/settings/integrations");
}

export async function retryDelivery(form: FormData) {
  const ctx = await actionContext("integrations.manage");
  const d = await ctx.db.webhookDelivery.findUniqueOrThrow({ where: { id: s(form, "id") } });
  await ctx.db.webhookDelivery.update({ where: { id: d.id }, data: { status: "PENDING", nextAttemptAt: new Date() } });
  await attemptDelivery(d.id);
  revalidatePath("/settings/integrations");
}

export async function createApiKey(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("integrations.manage");
    const scopes = form.getAll("scopes").map(String).filter((p) => hasPermission(ctx.permissions, p));
    if (!scopes.length) return { error: "Selecciona al menos un permiso" };
    const k = generateApiKey();
    await ctx.db.apiKey.create({ data: { organizationId: ctx.orgId, name: s(form, "name") || "API key", prefix: k.prefix, keyHash: k.hash, scopes, createdById: ctx.user.id } });
    await audit(ctx, "ApiKeyCreated", "api_key", null, { prefix: k.prefix, scopes });
    revalidatePath("/settings/integrations");
    return { ok: `Copia la llave ahora, no se volverá a mostrar: ${k.token}` };
  });
}

export async function revokeApiKey(form: FormData) {
  const ctx = await actionContext("integrations.manage");
  await ctx.db.apiKey.update({ where: { id: s(form, "id") }, data: { revokedAt: new Date() } });
  revalidatePath("/settings/integrations");
}

/**
 * Genera una contraseña temporal para un miembro (p. ej. vendedores traídos de Odoo, que llegan sin acceso).
 * Por seguridad solo aplica a usuarios que pertenecen ÚNICAMENTE a esta organización: así un administrador
 * nunca puede tomar control de una cuenta que también usa otra empresa.
 */
export async function resetMemberPassword(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("org.users.manage");
    const m = await ctx.db.membership.findUniqueOrThrow({ where: { id: s(form, "id") }, include: { role: true, user: true } });
    if (m.userId === ctx.user.id) return { error: "Cambia tu propia contraseña desde tu perfil" };
    if (m.role.key === "OWNER" && ctx.role.key !== "OWNER") return { error: "Solo un propietario puede hacerlo con otro propietario" };
    const orgs = await prisma.membership.count({ where: { userId: m.userId } });
    if (orgs > 1 || m.user.isPlatformAdmin) return { error: "Este usuario también pertenece a otra organización: debe cambiar su contraseña él mismo" };
    const temp = Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 8);
    await prisma.user.update({ where: { id: m.userId }, data: { passwordHash: await hashPassword(temp) } });
    await audit(ctx, "MemberPasswordReset", "membership", m.id, {});
    return { ok: `Contraseña temporal para ${m.user.email}: ${temp}` };
  });
}
