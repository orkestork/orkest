import type { ExecContext } from "@/lib/core/context";
import { json, nextNumber } from "@/lib/core/db";
import { emitEvent } from "@/lib/core/events";
import { getFieldDefs, validateCustomFields } from "@/lib/core/custom-fields";
import { getWorkflow, initialState } from "@/lib/core/workflow";
import { audit } from "@/lib/core/notify";
import { ValidationError } from "./crm";

/**
 * Objetos personalizados (Studio): cada organización crea sus propias entidades
 * — p. ej. "Visita técnica", "Requisición de mantenimiento" — con campos, líneas,
 * workflow, permisos, reglas y automatizaciones, sin escribir código.
 * entityType = "x:<clave>"  ·  campos de línea = "x:<clave>:line"
 */
export const CUSTOM_ICONS = ["wrench", "clipboard", "truck", "calendar", "flask", "people", "tasks", "approvals", "quality", "inventory", "purchasing", "studio"];
const COLORS = ["slate", "blue", "indigo", "amber", "violet", "emerald"];

export const entityType = (key: string) => `x:${key}`;
export const lineType = (key: string) => `x:${key}:line`;

export async function createCustomEntity(ctx: ExecContext, d: {
  key: string; label: string; labelPlural: string; icon?: string; prefix?: string; hasLines?: boolean; states?: string[];
}) {
  const key = d.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!key || !d.label.trim() || !d.labelPlural.trim()) throw new ValidationError({ key: "Clave, nombre y plural son obligatorios" });
  if (await ctx.db.customEntity.findFirst({ where: { key } })) throw new ValidationError({ key: `Ya existe un objeto con la clave ${key}` });
  const prefix = (d.prefix?.trim() || key.slice(0, 3)).toUpperCase();
  const ent = await ctx.db.customEntity.create({
    data: { organizationId: ctx.orgId, key, label: d.label.trim(), labelPlural: d.labelPlural.trim(), icon: CUSTOM_ICONS.includes(d.icon ?? "") ? d.icon! : "studio", prefix, hasLines: !!d.hasLines },
  });

  // Workflow lineal configurable: estados en orden + cancelación
  const names = (d.states?.length ? d.states : ["Borrador", "En proceso", "Completado"]).map((s) => s.trim()).filter(Boolean);
  const states = names.map((label, i) => ({ key: i === 0 ? "draft" : `s${i}`, label, color: COLORS[i % COLORS.length], isInitial: i === 0, isFinal: i === names.length - 1, position: i }));
  states.push({ key: "canceled", label: "Cancelado", color: "rose", isInitial: false, isFinal: true, position: states.length });
  const perm = `custom.${key}.write`;
  await ctx.db.workflow.create({
    data: {
      organizationId: ctx.orgId, entityType: entityType(key), key: `x_${key}_default`, name: `Flujo · ${ent.label}`, isDefault: true,
      states: { create: states },
      transitions: {
        create: [
          ...states.slice(0, names.length - 1).map((s, i) => ({ fromKey: s.key, toKey: states[i + 1].key, label: states[i + 1].label, permission: perm, actions: json([]), position: i })),
          ...states.slice(0, names.length - 1).map((s, i) => ({ fromKey: s.key, toKey: "canceled", label: "Cancelar", permission: perm, actions: json([]), position: 100 + i })),
        ],
      },
    },
  });
  await audit(ctx, "CustomEntityCreated", "custom_entity", ent.id, { key });
  return ent;
}

export async function getCustomEntity(ctx: ExecContext, key: string) {
  return ctx.db.customEntity.findFirst({ where: { key, active: true } });
}

export async function createRecord(ctx: ExecContext, key: string, values: Record<string, unknown>, lines: Record<string, unknown>[] = []) {
  const ent = await getCustomEntity(ctx, key);
  if (!ent) throw new ValidationError({ entity: "Objeto no encontrado" });
  const cf = validateCustomFields(await getFieldDefs(ctx.db, entityType(key)), values);
  if (!cf.ok) throw new ValidationError(cf.errors);
  const lineDefs = ent.hasLines ? await getFieldDefs(ctx.db, lineType(key)) : [];
  const cleanLines: object[] = [];
  for (const [i, l] of lines.entries()) {
    const r = validateCustomFields(lineDefs, l);
    if (!r.ok) throw new ValidationError(Object.fromEntries(Object.entries(r.errors).map(([k, v]) => [`línea ${i + 1} · ${k}`, v])));
    if (Object.keys(r.values).length) cleanLines.push(r.values);
  }
  const wf = await getWorkflow(ctx.db, entityType(key));
  const rec = await ctx.db.customRecord.create({
    data: {
      organizationId: ctx.orgId, entityKey: key, number: await nextNumber(ctx.db, ctx.orgId, ent.prefix), status: initialState(wf, "draft"),
      data: cf.values as object, ownerId: ctx.actorId, lines: { create: cleanLines.map((data, position) => ({ data, position })) },
    },
  });
  await emitEvent(ctx, "CustomRecordCreated", entityType(key), rec.id, { number: rec.number, object: ent.label });
  return rec;
}

/** Opciones para campos tipo relación (cliente, producto, proveedor, empleado, usuario). */
export async function relationChoices(ctx: ExecContext) {
  const [customers, products, suppliers, employees, members] = await Promise.all([
    ctx.db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    ctx.db.product.findMany({ select: { id: true, name: true, sku: true }, orderBy: { name: "asc" }, take: 1000 }),
    ctx.db.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ctx.db.employee.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ctx.db.membership.findMany({ include: { user: true } }),
  ]);
  return {
    customer: customers, supplier: suppliers, employee: employees,
    product: products.map((p) => ({ id: p.id, name: `${p.sku} · ${p.name}` })),
    user: members.map((m) => ({ id: m.userId, name: m.user.name })),
  } as Record<string, { id: string; name: string }[]>;
}
