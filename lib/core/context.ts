import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { prisma } from "./prisma";
import { tenantDb, type TenantDb } from "./db";
import { readSession } from "./auth";
import { hasPermission, isRestricted, type Restriction } from "./permissions";
import { getModule } from "@/lib/modules/registry";

/** Contexto mínimo para ejecutar lógica de negocio (requests, cron, seeds, API). */
export type ExecContext = {
  orgId: string;
  db: TenantDb;
  actorId: string | null;
  /** Profundidad de encadenamiento de eventos (evita bucles de automatizaciones). */
  depth?: number;
};

export type Branding = { primaryColor?: string; logoUrl?: string; displayName?: string; theme?: unknown };

export type OrgContext = ExecContext & {
  user: { id: string; name: string; email: string; isPlatformAdmin: boolean };
  org: {
    id: string; slug: string; name: string; status: string; currency: string; industry: string | null;
    branding: Branding; settings: Record<string, unknown>; onboardingStep: number; templateKey: string | null;
  };
  role: { id: string; key: string; name: string };
  permissions: string[];
  modules: Set<string>;
  flags: Set<string>;
  memberships: { orgId: string; orgName: string; roleName: string }[];
  can: (permission: string) => boolean;
  hasModule: (key: string) => boolean;
  /** Restricción explícita del rol (ocultar costos, no exportar, solo sus registros…) */
  restricted: (key: Restriction) => boolean;
};

export const getSessionUser = cache(async () => {
  const session = await readSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, name: true, email: true, isPlatformAdmin: true },
  });
  return user ? { user, activeOrgId: session.org } : null;
});

/**
 * Resuelve el workspace activo: organización, rol, permisos, módulos, flags y branding.
 * Cambiar de organización (Organization Switcher) cambia todo este contexto.
 */
export const getContext = cache(async (): Promise<OrgContext | null> => {
  const s = await getSessionUser();
  if (!s) return null;

  const memberships = await prisma.membership.findMany({
    where: { userId: s.user.id, status: "ACTIVE", organization: { status: { not: "SUSPENDED" } } },
    include: { organization: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;

  const active = memberships.find((m) => m.organizationId === s.activeOrgId) ?? memberships[0];
  const org = active.organization;

  const [mods, flagDefs, flagOverrides] = await Promise.all([
    prisma.organizationModule.findMany({ where: { organizationId: org.id, enabled: true } }),
    prisma.featureFlag.findMany(),
    prisma.organizationFeatureFlag.findMany({ where: { organizationId: org.id } }),
  ]);

  const modules = new Set(mods.map((m) => m.moduleKey).filter((k) => getModule(k)));
  const overrides = new Map(flagOverrides.map((f) => [f.flagKey, f.enabled]));
  const flags = new Set(flagDefs.filter((f) => overrides.get(f.key) ?? f.defaultEnabled).map((f) => f.key));
  const permissions = active.role.permissions;

  return {
    orgId: org.id,
    db: tenantDb(org.id),
    actorId: s.user.id,
    user: s.user,
    org: {
      id: org.id, slug: org.slug, name: org.name, status: org.status, currency: org.currency,
      industry: org.industry, branding: (org.branding ?? {}) as Branding,
      settings: (org.settings ?? {}) as Record<string, unknown>,
      onboardingStep: org.onboardingStep, templateKey: org.templateKey,
    },
    role: { id: active.role.id, key: active.role.key, name: active.role.name },
    permissions,
    modules,
    flags,
    memberships: memberships.map((m) => ({ orgId: m.organizationId, orgName: m.organization.name, roleName: m.role.name })),
    can: (p) => hasPermission(permissions, p),
    hasModule: (k) => k === "core" || modules.has(k),
    restricted: (k) => isRestricted(permissions, k),
  };
});

/** Para páginas de la app: exige sesión y workspace. */
export async function requireContext(): Promise<OrgContext> {
  const ctx = await getContext();
  if (!ctx) {
    const s = await getSessionUser();
    if (!s) redirect("/login");
    redirect("/onboarding/new");
  }
  return ctx;
}

export async function requirePermission(permission: string): Promise<OrgContext> {
  const ctx = await requireContext();
  if (!ctx.can(permission)) redirect(`/forbidden?p=${encodeURIComponent(permission)}`);
  return ctx;
}

/** Una app desactivada no existe para la organización: 404. */
export async function requireModule(moduleKey: string, permission?: string): Promise<OrgContext> {
  const ctx = await requireContext();
  if (!ctx.hasModule(moduleKey)) notFound();
  if (permission && !ctx.can(permission)) redirect(`/forbidden?p=${encodeURIComponent(permission)}`);
  return ctx;
}

/** Para server actions: lanza error en vez de redirigir. */
export async function actionContext(permission?: string, moduleKey?: string): Promise<OrgContext> {
  const ctx = await getContext();
  if (!ctx) throw new Error("Sesión no válida");
  if (moduleKey && !ctx.hasModule(moduleKey)) throw new Error(`La app ${moduleKey} no está activa`);
  if (permission && !ctx.can(permission)) throw new Error(`Permiso requerido: ${permission}`);
  return ctx;
}

export async function requirePlatformAdmin() {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  if (!s.user.isPlatformAdmin) notFound();
  return s.user;
}
