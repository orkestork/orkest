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
