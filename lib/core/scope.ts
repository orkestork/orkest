import type { OrgContext } from "./context";

/** Filtro por responsable cuando el rol solo puede ver sus propios registros del módulo. */
export function ownerScope(ctx: OrgContext, module: "sales") {
  return ctx.restricted(`scope:own:${module}`) ? { ownerId: ctx.user.id } : {};
}

/** ¿Puede ver este registro según el alcance del rol? */
export function canSeeOwned(ctx: OrgContext, module: "sales", ownerId: string | null | undefined) {
  return !ctx.restricted(`scope:own:${module}`) || ownerId === ctx.user.id;
}
