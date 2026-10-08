import type { TenantDb } from "./db";

/**
 * Custom Fields: cada organización extiende entidades sin tocar el esquema.
 * Definiciones en `CustomFieldDefinition` (por organizationId + entityType);
 * valores en la columna JSON `customFields` de la entidad.
 */
export const FIELD_TYPES = [
  { type: "text", label: "Texto" },
  { type: "textarea", label: "Texto largo" },
  { type: "number", label: "Número" },
  { type: "currency", label: "Moneda" },
  { type: "date", label: "Fecha" },
  { type: "datetime", label: "Fecha y hora" },
  { type: "boolean", label: "Sí / No" },
  { type: "select", label: "Lista (una opción)" },
  { type: "multiselect", label: "Lista (varias opciones)" },
  { type: "user", label: "Usuario" },
  { type: "relation", label: "Relación con otra entidad" },
  { type: "email", label: "Email" },
  { type: "phone", label: "Teléfono" },
  { type: "url", label: "URL" },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number]["type"];
export type FieldOption = { value: string; label: string };
export type FieldValidation = {
  min?: number; max?: number; minLength?: number; maxLength?: number; pattern?: string; patternMessage?: string;
};

export type FieldDef = {
  key: string; label: string; type: string; required: boolean;
  options: unknown; validation: unknown; helpText?: string | null;
};

export async function getFieldDefs(db: TenantDb, entityType: string) {
  return db.customFieldDefinition.findMany({ where: { entityType, active: true }, orderBy: { position: "asc" } });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d][\d\s()-]{5,}$/;

export function fieldOptions(def: FieldDef): FieldOption[] {
  return Array.isArray(def.options) ? (def.options as FieldOption[]) : [];
}

/** Valida y normaliza un valor. Devuelve [valor, error]. */
export function validateField(def: FieldDef, raw: unknown): [unknown, string | null] {
  const v = (def.validation ?? {}) as FieldValidation;
  const empty = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);
  if (empty) {
    if (def.type === "boolean") return [false, null];
    return def.required ? [null, `${def.label} es obligatorio`] : [null, null];
  }
  const s = String(raw).trim();
  switch (def.type) {
    case "number":
    case "currency": {
      const n = Number(s.replace(/[$\s]/g, "").replace(/,/g, ""));
      if (!Number.isFinite(n)) return [null, `${def.label} debe ser numérico`];
      if (v.min !== undefined && n < v.min) return [null, `${def.label} debe ser ≥ ${v.min}`];
      if (v.max !== undefined && n > v.max) return [null, `${def.label} debe ser ≤ ${v.max}`];
      return [n, null];
    }
    case "boolean":
      return [["true", "1", "on", "si", "sí", "yes"].includes(s.toLowerCase()), null];
    case "date":
    case "datetime": {
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return [null, `${def.label} no es una fecha válida`];
      return [def.type === "date" ? d.toISOString().slice(0, 10) : d.toISOString(), null];
    }
    case "email":
      return EMAIL.test(s) ? [s.toLowerCase(), null] : [null, `${def.label} no es un email válido`];
    case "phone":
      return PHONE.test(s) ? [s, null] : [null, `${def.label} no es un teléfono válido`];
    case "url":
      try { new URL(s); return [s, null]; } catch { return [null, `${def.label} no es una URL válida`]; }
    case "select": {
      const opts = fieldOptions(def);
      const match = opts.find((o) => o.value === s || o.label.toLowerCase() === s.toLowerCase());
      return match ? [match.value, null] : [null, `${def.label}: "${s}" no es una opción válida`];
    }
    case "multiselect": {
      const opts = fieldOptions(def);
      const vals = (Array.isArray(raw) ? raw.map(String) : s.split(/[,;|]/)).map((x) => x.trim()).filter(Boolean);
      const out: string[] = [];
      for (const x of vals) {
        const m = opts.find((o) => o.value === x || o.label.toLowerCase() === x.toLowerCase());
        if (!m) return [null, `${def.label}: "${x}" no es una opción válida`];
        out.push(m.value);
      }
      if (def.required && out.length === 0) return [null, `${def.label} es obligatorio`];
      return [out, null];
    }
    default: {
      if (v.minLength !== undefined && s.length < v.minLength) return [null, `${def.label} requiere mínimo ${v.minLength} caracteres`];
      if (v.maxLength !== undefined && s.length > v.maxLength) return [null, `${def.label} admite máximo ${v.maxLength} caracteres`];
      if (v.pattern) {
        try {
          if (!new RegExp(v.pattern).test(s)) return [null, v.patternMessage ?? `${def.label} no tiene el formato esperado`];
        } catch { /* patrón inválido: se ignora */ }
      }
      return [s, null];
    }
  }
}

export function validateCustomFields(defs: FieldDef[], input: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const def of defs) {
    const [val, err] = validateField(def, input[def.key]);
    if (err) errors[def.key] = err;
    else if (val !== null) values[def.key] = val;
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

/** Lee los campos `cf_<key>` de un FormData. */
export function customFieldsFromForm(defs: FieldDef[], form: FormData) {
  const input: Record<string, unknown> = {};
  for (const d of defs) {
    input[d.key] = d.type === "multiselect" ? form.getAll(`cf_${d.key}`).map(String) : form.get(`cf_${d.key}`) ?? undefined;
  }
  return validateCustomFields(defs, input);
}

export function relationTarget(def: FieldDef): string | null {
  const o = def.options as { entityType?: string } | null;
  return o && !Array.isArray(o) && o.entityType ? o.entityType : null;
}

export function formatFieldValue(def: FieldDef, value: unknown, users?: Map<string, string>, relations?: Record<string, { id: string; name: string }[]>): string {
  if (value === null || value === undefined || value === "") return "—";
  const opts = fieldOptions(def);
  switch (def.type) {
    case "boolean": return value ? "Sí" : "No";
    case "currency": return Number(value).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
    case "number": return Number(value).toLocaleString("es-CO");
    case "select": return opts.find((o) => o.value === value)?.label ?? String(value);
    case "multiselect": return (value as string[]).map((x) => opts.find((o) => o.value === x)?.label ?? x).join(", ");
    case "user": return users?.get(String(value)) ?? String(value);
    case "relation": {
      const t = relationTarget(def);
      return (t && relations?.[t]?.find((r) => r.id === value)?.name) ?? String(value);
    }
    case "date": return new Date(String(value)).toLocaleDateString("es-CO");
    case "datetime": return new Date(String(value)).toLocaleString("es-CO");
    default: return String(value);
  }
}
