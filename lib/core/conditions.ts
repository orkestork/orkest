/**
 * Evaluador de condiciones declarativas (JSON) compartido por:
 * Workflow Engine (guards y aprobaciones), Business Rules y Automations.
 *
 *   { "all": [ { "field": "total", "op": "gt", "value": 50000000 },
 *              { "any": [ { "field": "customFields.zona", "op": "eq", "value": "Norte" } ] } ] }
 */
export type Operator =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "contains" | "in" | "not_in" | "is_empty" | "is_not_empty" | "is_true" | "is_false";

export type Condition = { field: string; op: Operator; value?: unknown };
export type ConditionGroup = { all?: ConditionNode[]; any?: ConditionNode[] };
export type ConditionNode = Condition | ConditionGroup;

export const OPERATORS: { op: Operator; label: string; needsValue: boolean }[] = [
  { op: "eq", label: "es igual a", needsValue: true },
  { op: "neq", label: "es distinto de", needsValue: true },
  { op: "gt", label: "mayor que", needsValue: true },
  { op: "gte", label: "mayor o igual que", needsValue: true },
  { op: "lt", label: "menor que", needsValue: true },
  { op: "lte", label: "menor o igual que", needsValue: true },
  { op: "contains", label: "contiene", needsValue: true },
  { op: "in", label: "está en (lista, separada por comas)", needsValue: true },
  { op: "not_in", label: "no está en", needsValue: true },
  { op: "is_empty", label: "está vacío", needsValue: false },
  { op: "is_not_empty", label: "tiene valor", needsValue: false },
  { op: "is_true", label: "es verdadero", needsValue: false },
  { op: "is_false", label: "es falso", needsValue: false },
];

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "toNumber" in v) return (v as { toNumber(): number }).toNumber(); // Prisma Decimal
  return Number(v);
}

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  return String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

function isEmpty(v: unknown) {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

export function evaluateCondition(c: Condition, facts: unknown): boolean {
  const actual = getPath(facts, c.field);
  switch (c.op) {
    case "eq": return String(actual ?? "") === String(c.value ?? "");
    case "neq": return String(actual ?? "") !== String(c.value ?? "");
    case "gt": return toNum(actual) > toNum(c.value);
    case "gte": return toNum(actual) >= toNum(c.value);
    case "lt": return toNum(actual) < toNum(c.value);
    case "lte": return toNum(actual) <= toNum(c.value);
    case "contains":
      return Array.isArray(actual)
        ? actual.map(String).includes(String(c.value))
        : String(actual ?? "").toLowerCase().includes(String(c.value ?? "").toLowerCase());
    case "in": return toList(c.value).includes(String(actual));
    case "not_in": return !toList(c.value).includes(String(actual));
    case "is_empty": return isEmpty(actual);
    case "is_not_empty": return !isEmpty(actual);
    case "is_true": return actual === true || actual === "true";
    case "is_false": return !(actual === true || actual === "true");
    default: return false;
  }
}

export function evaluate(node: ConditionNode | null | undefined, facts: unknown): boolean {
  if (!node) return true;
  if ("field" in node) return evaluateCondition(node, facts);
  if (node.all && !node.all.every((n) => evaluate(n, facts))) return false;
  if (node.any && node.any.length > 0 && !node.any.some((n) => evaluate(n, facts))) return false;
  return true;
}

export function describe(node: ConditionNode | null | undefined): string {
  if (!node) return "siempre";
  if ("field" in node) {
    const label = OPERATORS.find((o) => o.op === node.op)?.label ?? node.op;
    return `${node.field} ${label}${node.value !== undefined && node.value !== "" ? ` ${String(node.value)}` : ""}`;
  }
  const parts: string[] = [];
  if (node.all?.length) parts.push(node.all.map(describe).join(" Y "));
  if (node.any?.length) parts.push(`(${node.any.map(describe).join(" O ")})`);
  return parts.join(" Y ") || "siempre";
}
