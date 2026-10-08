/**
 * Permisos con comodines:
 *   "*"                 → todo dentro de la organización
 *   "crm.*"             → todo lo que empiece por "crm."
 *   "sales.quotes.read" → exacto
 */
export function hasPermission(granted: readonly string[], required: string): boolean {
  for (const g of granted) {
    if (g === "*" || g === required) return true;
    if (g.endsWith(".*") && required.startsWith(g.slice(0, -1))) return true;
  }
  return false;
}

export type PermissionDef = { key: string; label: string };

/** Permisos del Core (no pertenecen a ninguna app). */
export const CORE_PERMISSIONS: PermissionDef[] = [
  { key: "org.settings.manage", label: "Configurar empresa y branding" },
  { key: "org.users.manage", label: "Gestionar usuarios" },
  { key: "org.roles.manage", label: "Gestionar roles y permisos" },
  { key: "org.modules.manage", label: "Activar / desactivar aplicaciones" },
  { key: "studio.manage", label: "Usar ORKEST Studio" },
  { key: "integrations.manage", label: "Integraciones, API keys y webhooks" },
  { key: "audit.read", label: "Ver auditoría" },
  { key: "import.run", label: "Importar datos" },
  { key: "intelligence.ask", label: "Usar Ask ORKEST" },
  { key: "approvals.override", label: "Decidir cualquier aprobación" },
];

/**
 * Restricciones: claves explícitas que QUITAN capacidades a un rol (no se heredan por comodines,
 * así "*" o "sales.*" nunca restringen). Se guardan junto a los permisos del rol.
 */
export const RESTRICTIONS = [
  { key: "deny:costs", label: "Ocultar costos, márgenes y utilidad", hint: "No ve costo de productos ni margen de cotizaciones y pedidos" },
  { key: "deny:export", label: "No puede exportar listas a CSV", hint: "Oculta el botón Exportar en todas las listas" },
] as const;

/** Alcance de registros: con estas claves el rol solo ve los documentos donde es el responsable. */
export const SCOPES = [
  { key: "scope:own:sales", module: "sales", label: "Cotizaciones y pedidos", hint: "Solo los que tiene asignados como vendedor" },
] as const;

export type Restriction = (typeof RESTRICTIONS)[number]["key"] | (typeof SCOPES)[number]["key"];

/** ¿El rol tiene esta restricción? Solo cuenta si está escrita explícitamente. */
export function isRestricted(granted: readonly string[], key: Restriction) {
  return granted.includes(key);
}

/** Las restricciones reducen poder: cualquiera que gestione roles puede asignarlas. */
export const isRestrictionKey = (k: string) => k.startsWith("deny:") || k.startsWith("scope:");
