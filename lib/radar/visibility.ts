import type { OrgContext } from "@/lib/core/context";
import { ENTITIES } from "@/lib/core/entities";

/**
 * Un insight solo es visible si el usuario puede ver la entidad a la que se refiere
 * (app activa + permiso de lectura). Los insights sin entidad son visibles para todos con radar.read.
 */
export function visibleInsightWhere(ctx: OrgContext) {
  const allowed = Object.values(ENTITIES).filter((e) => ctx.hasModule(e.module) && ctx.can(e.readPermission)).map((e) => e.type);
  return { OR: [{ entityType: null }, { entityType: { in: allowed } }] };
}
