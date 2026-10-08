import type { ExecContext } from "@/lib/core/context";
import { getEntity } from "@/lib/core/entities";
import { getFieldDefs, validateField, validateCustomFields } from "@/lib/core/custom-fields";
import { CustomerInput, createCustomer } from "@/lib/apps/crm";
import { ProductInput, createProduct } from "@/lib/apps/inventory";

/**
 * Import Engine: CSV/XLSX → mapeo de columnas → validación completa → importación.
 * Nunca inserta datos inválidos silenciosamente: si hay errores el usuario los ve
 * fila por fila y debe decidir explícitamente importar solo las filas válidas.
 */
export const IMPORTABLE = ["customer", "product", "supplier", "contact", "employee"] as const;

export type RowError = { row: number; field: string; message: string };

/** Parser CSV con comillas, separador , o ; (autodetectado). */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const records: string[][] = [];
  let field = "", row: string[] = [], quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field); records.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); records.push(row); }
  const nonEmpty = records.filter((r) => r.some((v) => v.trim() !== ""));
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim());
  return { headers, rows: nonEmpty.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}

export async function targetFields(ctx: ExecContext, entityType: string) {
  const def = getEntity(entityType);
  const base = def.fields.filter((f) => f.importable).map((f) => ({ key: f.key, label: f.label, required: !!f.required }));
  const custom = def.customizable
    ? (await getFieldDefs(ctx.db, entityType)).map((f) => ({ key: `cf.${f.key}`, label: `${f.label} (personalizado)`, required: f.required }))
    : [];
  return [...base, ...custom];
}

/** Sugerencia automática de mapeo por similitud de nombre. */
export function suggestMapping(headers: string[], fields: { key: string; label: string }[]) {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const f = fields.find((x) => norm(x.key.replace("cf.", "")) === norm(h) || norm(x.label).startsWith(norm(h)) || norm(h).startsWith(norm(x.label.split(" ")[0])));
    if (f) mapping[h] = f.key;
  }
  return mapping;
}

function buildRecord(row: Record<string, string>, mapping: Record<string, string>) {
  const rec: Record<string, unknown> = { customFields: {} as Record<string, unknown> };
  for (const [col, target] of Object.entries(mapping)) {
    if (!target) continue;
    if (target.startsWith("cf.")) (rec.customFields as Record<string, unknown>)[target.slice(3)] = row[col];
    else rec[target] = row[col];
  }
  return rec;
}

export async function validateRows(ctx: ExecContext, entityType: string, rows: Record<string, string>[], mapping: Record<string, string>) {
  const errors: RowError[] = [];
  const valid: number[] = [];
  const defs = getEntity(entityType).customizable ? await getFieldDefs(ctx.db, entityType) : [];
  const fields = await targetFields(ctx, entityType);
  const mapped = new Set(Object.values(mapping));
  for (const f of fields.filter((f) => f.required && !f.key.startsWith("cf."))) {
    if (!mapped.has(f.key)) errors.push({ row: 0, field: f.label, message: "Campo obligatorio sin columna asignada" });
  }
  if (errors.length) return { errors, valid };

  const seenKeys = new Set<string>();
  const existingSkus = entityType === "product" ? new Set((await ctx.db.product.findMany({ select: { sku: true } })).map((p) => p.sku)) : new Set<string>();

  rows.forEach((row, idx) => {
    const n = idx + 2; // fila 1 = encabezados
    const rec = buildRecord(row, mapping);
    const rowErrors: RowError[] = [];
    const schema = entityType === "customer" ? CustomerInput : entityType === "product" ? ProductInput : null;
    if (schema) {
      const r = schema.safeParse(rec);
      if (!r.success) r.error.issues.forEach((i) => rowErrors.push({ row: n, field: String(i.path[0] ?? ""), message: i.message }));
    } else if (!String(rec.name ?? "").trim()) {
      rowErrors.push({ row: n, field: "name", message: "Nombre obligatorio" });
    }
    for (const d of defs) {
      const [, err] = validateField(d, (rec.customFields as Record<string, unknown>)[d.key]);
      if (err) rowErrors.push({ row: n, field: d.label, message: err });
    }
    if (entityType === "product") {
      const sku = String(rec.sku ?? "");
      if (existingSkus.has(sku)) rowErrors.push({ row: n, field: "sku", message: `SKU ${sku} ya existe` });
      if (seenKeys.has(sku)) rowErrors.push({ row: n, field: "sku", message: `SKU ${sku} duplicado en el archivo` });
      seenKeys.add(sku);
    }
    if (rowErrors.length) errors.push(...rowErrors);
    else valid.push(idx);
  });
  return { errors, valid };
}

export async function importRows(ctx: ExecContext, entityType: string, rows: Record<string, string>[], mapping: Record<string, string>, indexes: number[]) {
  let imported = 0;
  const defs = getEntity(entityType).customizable ? await getFieldDefs(ctx.db, entityType) : [];
  for (const i of indexes) {
    const rec = buildRecord(rows[i], mapping);
    if (entityType === "customer") await createCustomer(ctx, rec);
    else if (entityType === "product") await createProduct(ctx, rec);
    else {
      const cf = validateCustomFields(defs, rec.customFields as Record<string, unknown>);
      const base = { organizationId: ctx.orgId, name: String(rec.name), email: (rec.email as string) || null, phone: (rec.phone as string) || null, customFields: cf.values as object };
      if (entityType === "supplier") await ctx.db.supplier.create({ data: { ...base, taxId: (rec.taxId as string) || null } });
      else if (entityType === "contact") await ctx.db.contact.create({ data: { ...base, position: (rec.position as string) || null } });
      else if (entityType === "employee") await ctx.db.employee.create({ data: { organizationId: ctx.orgId, name: base.name, email: base.email, position: (rec.position as string) || null, customFields: base.customFields } });
    }
    imported++;
  }
  return imported;
}

export async function parseXlsx(buf: Buffer): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const { readSheet } = await import("read-excel-file/node");
  const data = (await readSheet(buf)) as unknown[][];
  const cell = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? "" : String(v).trim());
  const nonEmpty = data.filter((r) => r.some((v) => cell(v) !== ""));
  const headers = (nonEmpty.shift() ?? []).map(cell);
  return { headers, rows: nonEmpty.map((r) => Object.fromEntries(headers.map((h, i) => [h, cell(r[i])]))) };
}
