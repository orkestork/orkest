"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { json } from "@/lib/core/db";
import { FIELD_TYPES } from "@/lib/core/custom-fields";
import { CUSTOMIZABLE_ENTITIES } from "@/lib/core/entities";
import { EVENT_MAP } from "@/lib/core/event-catalog";
import { audit } from "@/lib/core/notify";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ─── Custom fields ───
export async function saveField(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("studio.manage");
    const entityType = s(form, "entityType");
    const key = s(form, "key").toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const type = s(form, "type");
    const custom = entityType.startsWith("x:") ? await ctx.db.customEntity.findFirst({ where: { key: entityType.split(":")[1] } }) : null;
    if (!CUSTOMIZABLE_ENTITIES.some((e) => e.type === entityType) && !custom) return { error: "Entidad no personalizable" };
    if (!FIELD_TYPES.some((t) => t.type === type)) return { error: "Tipo inválido" };
    if (!key || !s(form, "label")) return { error: "Clave y etiqueta son obligatorias" };
    const listOptions = s(form, "options").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [value, label] = l.includes(":") ? l.split(":").map((x) => x.trim()) : [l.toLowerCase().replace(/\s+/g, "_"), l];
      return { value, label };
    });
    if ((type === "select" || type === "multiselect") && listOptions.length === 0) return { error: "Define al menos una opción" };
    const options = type === "relation" ? { entityType: s(form, "relationTarget") || "customer" } : listOptions;
    const num = (k: string) => (s(form, k) === "" ? undefined : Number(s(form, k)));
    const validation = Object.fromEntries(Object.entries({
      min: num("min"), max: num("max"), maxLength: num("maxLength"), pattern: s(form, "pattern") || undefined, patternMessage: s(form, "patternMessage") || undefined,
    }).filter(([, v]) => v !== undefined));
    if (validation.pattern) { try { new RegExp(String(validation.pattern)); } catch { return { error: "Expresión regular inválida" }; } }
    const exists = await ctx.db.customFieldDefinition.findFirst({ where: { entityType, key } });
    if (exists) return { error: `Ya existe el campo "${key}" en esta entidad` };
    const position = await ctx.db.customFieldDefinition.count({ where: { entityType } });
    await ctx.db.customFieldDefinition.create({
      data: { organizationId: ctx.orgId, entityType, key, label: s(form, "label"), type, options, validation, required: form.get("required") === "on", helpText: s(form, "helpText") || null, position },
    });
    await audit(ctx, "CustomFieldCreated", "custom_field", null, { entityType, key, type });
    revalidatePath("/studio/fields");
    return { ok: `Campo "${s(form, "label")}" creado` };
  });
}

export async function toggleField(form: FormData) {
  const ctx = await actionContext("studio.manage");
  const f = await ctx.db.customFieldDefinition.findUniqueOrThrow({ where: { id: s(form, "id") } });
  await ctx.db.customFieldDefinition.update({ where: { id: f.id }, data: { active: !f.active } });
  revalidatePath("/studio/fields");
}

// ─── Workflows ───
export async function addState(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("studio.manage");
    const wf = await ctx.db.workflow.findUniqueOrThrow({ where: { id: s(form, "workflowId") }, include: { states: true } });
    const key = s(form, "key").toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!key || !s(form, "label")) return { error: "Clave y nombre son obligatorios" };
    if (wf.states.some((x) => x.key === key)) return { error: "Ya existe ese estado" };
    await ctx.db.workflow.update({ where: { id: wf.id }, data: { states: { create: { key, label: s(form, "label"), color: s(form, "color") || "slate", isFinal: form.get("isFinal") === "on", position: wf.states.length } } } });
    revalidatePath(`/studio/workflows/${wf.id}`);
    return { ok: "Estado agregado" };
  });
}

export async function addTransition(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("studio.manage");
    const wf = await ctx.db.workflow.findUniqueOrThrow({ where: { id: s(form, "workflowId") }, include: { transitions: true } });
    if (!s(form, "label")) return { error: "Nombre de la acción obligatorio" };
    const threshold = s(form, "approvalField") && s(form, "approvalValue") !== "";
    const guardField = s(form, "guardField");
    await ctx.db.workflow.update({
      where: { id: wf.id },
      data: {
        transitions: {
          create: {
            fromKey: s(form, "fromKey"), toKey: s(form, "toKey"), label: s(form, "label"), permission: s(form, "permission") || null,
            guard: guardField ? json({ all: [{ field: guardField, op: s(form, "guardOp"), value: s(form, "guardValue") }] }) : undefined,
            approval: threshold
              ? json({ when: { all: [{ field: s(form, "approvalField"), op: s(form, "approvalOp") || "gt", value: Number(s(form, "approvalValue")) }] }, role: s(form, "approvalRole"), pendingState: s(form, "pendingState") })
              : undefined,
            position: wf.transitions.length,
          },
        },
      },
    });
    await audit(ctx, "WorkflowChanged", "workflow", wf.id, { added: s(form, "label") });
    revalidatePath(`/studio/workflows/${wf.id}`);
    return { ok: "Transición agregada" };
  });
}

export async function deleteTransition(form: FormData) {
  const ctx = await actionContext("studio.manage");
  const wf = await ctx.db.workflow.findUniqueOrThrow({ where: { id: s(form, "workflowId") } });
  await ctx.db.workflow.update({ where: { id: wf.id }, data: { transitions: { delete: { id: s(form, "transitionId") } } } });
  revalidatePath(`/studio/workflows/${wf.id}`);
}

// ─── Automations / Business rules ───
export async function saveAutomation(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("automations.manage", "automations");
    const trigger = s(form, "trigger");
    if (!EVENT_MAP.has(trigger)) return { error: "Evento inválido" };
    let conditions: unknown, actions: unknown;
    try {
      conditions = JSON.parse(s(form, "conditions") || '{"all":[]}');
      actions = JSON.parse(s(form, "actions") || "[]");
    } catch { return { error: "Definición inválida" }; }
    if (!Array.isArray(actions) || actions.length === 0) return { error: "Agrega al menos una acción" };
    if (!s(form, "name")) return { error: "Nombre obligatorio" };
    const data = { name: s(form, "name"), description: s(form, "description") || null, kind: s(form, "kind") || "AUTOMATION", trigger, conditions: json(conditions), actions: json(actions) };
    const id = s(form, "id");
    if (id) await ctx.db.automation.update({ where: { id }, data });
    else await ctx.db.automation.create({ data: { ...data, organizationId: ctx.orgId } });
    await audit(ctx, id ? "AutomationUpdated" : "AutomationCreated", "automation", id || null, { name: data.name, trigger });
    redirect("/studio/automations");
  });
}

export async function toggleAutomation(form: FormData) {
  const ctx = await actionContext("automations.manage", "automations");
  const a = await ctx.db.automation.findUniqueOrThrow({ where: { id: s(form, "id") } });
  await ctx.db.automation.update({ where: { id: a.id }, data: { enabled: !a.enabled } });
  revalidatePath("/studio/automations");
}

// ─── Dashboards / templates ───
export async function saveDashboard(form: FormData) {
  const ctx = await actionContext("studio.manage");
  const dash = await ctx.db.dashboard.findFirst({ where: { isDefault: true } });
  const widgets = form.getAll("widget").map((w) => JSON.parse(String(w)));
  if (dash) await ctx.db.dashboard.update({ where: { id: dash.id }, data: { widgets } });
  else await ctx.db.dashboard.create({ data: { organizationId: ctx.orgId, name: "Inicio", isDefault: true, widgets } });
  revalidatePath("/");
  revalidatePath("/studio/dashboards");
}

export async function saveDocTemplate(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("studio.manage");
    const id = s(form, "id");
    const data = { name: s(form, "name"), entityType: s(form, "entityType"), body: String(form.get("body") ?? "") };
    if (!data.name || !data.body) return { error: "Nombre y contenido son obligatorios" };
    if (id) await ctx.db.documentTemplate.update({ where: { id }, data });
    else await ctx.db.documentTemplate.create({ data: { ...data, organizationId: ctx.orgId } });
    revalidatePath("/studio/templates");
    return { ok: "Plantilla guardada" };
  });
}
