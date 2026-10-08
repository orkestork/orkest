import { prisma } from "@/lib/core/prisma";
import { json } from "@/lib/core/db";
import type { ExecContext } from "@/lib/core/context";
import { getModule } from "@/lib/modules/registry";
import { createWarehouse } from "@/lib/apps/stock";
import { ensureAccountingDefaults } from "@/lib/apps/invoicing";
import { BASE_ROLES, getTemplate, type WorkflowTemplate } from "./industries";

/** Crea los roles base si no existen (no sobrescribe roles editados). */
export async function ensureBaseRoles(ctx: ExecContext) {
  for (const r of BASE_ROLES) {
    await ctx.db.role.upsert({
      where: { organizationId_key: { organizationId: ctx.orgId, key: r.key } },
      update: {},
      create: { organizationId: ctx.orgId, key: r.key, name: r.name, description: r.description, permissions: r.permissions, isSystem: r.key === "OWNER" },
    });
  }
}

/** Activa módulos incluyendo dependencias. */
export async function enableModules(ctx: ExecContext, keys: string[]) {
  const all = new Set<string>();
  const add = (k: string) => {
    if (all.has(k) || !getModule(k)) return;
    all.add(k);
    getModule(k)!.dependsOn?.forEach(add);
  };
  keys.forEach(add);
  for (const moduleKey of all) {
    await ctx.db.organizationModule.upsert({
      where: { organizationId_moduleKey: { organizationId: ctx.orgId, moduleKey } },
      update: { enabled: true },
      create: { organizationId: ctx.orgId, moduleKey, enabled: true },
    });
  }
  return [...all];
}

export async function createWorkflow(ctx: ExecContext, wf: WorkflowTemplate) {
  const exists = await ctx.db.workflow.findFirst({ where: { key: wf.key } });
  if (exists) return exists;
  return ctx.db.workflow.create({
    data: {
      organizationId: ctx.orgId, entityType: wf.entityType, key: wf.key, name: wf.name, isDefault: true,
      states: { create: wf.states.map((s, i) => ({ ...s, position: i })) },
      transitions: {
        create: wf.transitions.map((t, i) => ({
          fromKey: t.from, toKey: t.to, label: t.label, permission: t.permission,
          guard: t.guard ? json(t.guard) : undefined, approval: t.approval ? json(t.approval) : undefined, actions: json(t.actions ?? []), position: i,
        })),
      },
    },
  });
}

/**
 * Aplica una plantilla sectorial. Idempotente: no duplica ni pisa lo que la
 * organización ya personalizó.
 */
export async function applyTemplate(ctx: ExecContext, templateKey: string) {
  const tpl = getTemplate(templateKey);
  if (!tpl) throw new Error("Plantilla no encontrada");

  await ensureBaseRoles(ctx);
  await enableModules(ctx, tpl.modules);

  for (const [i, f] of tpl.fields.entries()) {
    await ctx.db.customFieldDefinition.upsert({
      where: { organizationId_entityType_key: { organizationId: ctx.orgId, entityType: f.entityType, key: f.key } },
      update: {},
      create: {
        organizationId: ctx.orgId, entityType: f.entityType, key: f.key, label: f.label, type: f.type,
        options: f.options ?? [], validation: f.validation ?? {}, required: f.required ?? false, helpText: f.helpText, position: i,
      },
    });
  }

  for (const wf of tpl.workflows) await createWorkflow(ctx, wf);

  for (const a of tpl.automations) {
    const exists = await ctx.db.automation.findFirst({ where: { name: a.name } });
    if (!exists) {
      await ctx.db.automation.create({
        data: { organizationId: ctx.orgId, name: a.name, description: a.description, kind: a.kind, trigger: a.trigger, conditions: json(a.conditions), actions: json(a.actions) },
      });
    }
  }

  if ((await ctx.db.dashboard.count()) === 0) {
    await ctx.db.dashboard.create({ data: { organizationId: ctx.orgId, name: "Inicio", isDefault: true, widgets: json(tpl.dashboard) } });
  }

  for (const d of tpl.documentTemplates) {
    const exists = await ctx.db.documentTemplate.findFirst({ where: { name: d.name } });
    if (!exists) await ctx.db.documentTemplate.create({ data: { organizationId: ctx.orgId, ...d } });
  }

  // Bases operativas: almacén principal y configuración contable
  const enabled = new Set(tpl.modules);
  if ((enabled.has("inventory") || enabled.has("sales")) && (await ctx.db.warehouse.count()) === 0) {
    await createWarehouse(ctx, { code: "WH", name: "Almacén principal" });
  }
  if (enabled.has("invoicing") || enabled.has("sales")) await ensureAccountingDefaults(ctx);

  await prisma.organization.update({ where: { id: ctx.orgId }, data: { templateKey, industry: tpl.name } });
  return tpl;
}
