import { redirect } from "next/navigation";
import type { OrgContext } from "@/lib/core/context";

/** Favoritos de búsqueda (SavedView): propios del usuario o compartidos (userId = null). */
export type Favorite = { id: string; name: string; qs: string; isDefault: boolean; shared: boolean; mine: boolean };

export async function listFavorites(ctx: OrgContext, entityType: string): Promise<Favorite[]> {
  const rows = await ctx.db.savedView.findMany({
    where: { entityType, OR: [{ userId: ctx.user.id }, { userId: null }] }, orderBy: [{ createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id, name: r.name, qs: String((r.filters as { qs?: string })?.qs ?? ""), isDefault: r.isDefault, shared: r.userId === null, mine: r.userId === ctx.user.id,
  }));
}

/**
 * Al entrar a la lista sin parámetros (desde el menú) aplica el favorito predeterminado,
 * igual que Odoo: primero el del usuario, si no, el compartido.
 */
export function applyDefaultFavorite(favorites: Favorite[], isEmpty: boolean, path: string) {
  if (!isEmpty) return;
  const def = favorites.find((f) => f.isDefault && f.mine) ?? favorites.find((f) => f.isDefault && f.shared);
  if (def?.qs) redirect(`${path}?${def.qs}`);
}
