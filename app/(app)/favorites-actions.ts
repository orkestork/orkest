"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { json } from "@/lib/core/db";

const clean = (qs: string) => {
  const p = new URLSearchParams(qs);
  for (const k of ["page", "all"]) p.delete(k);
  return p.toString();
};

export async function saveFavorite(d: { entityType: string; path: string; name: string; qs: string; isDefault: boolean; shared: boolean }) {
  const ctx = await actionContext();
  const name = d.name.trim().slice(0, 80);
  if (!name) return { error: "Escribe un nombre" };
  // Compartir con todos requiere poder administrar la organización
  const shared = d.shared && ctx.can("studio.manage");
  const userId = shared ? null : ctx.user.id;
  if (d.isDefault) await ctx.db.savedView.updateMany({ where: { entityType: d.entityType, userId }, data: { isDefault: false } });
  await ctx.db.savedView.create({ data: { organizationId: ctx.orgId, userId, entityType: d.entityType, name, columns: [], filters: json({ qs: clean(d.qs) }), isDefault: d.isDefault } });
  revalidatePath(d.path);
  return { ok: true };
}

export async function deleteFavorite(id: string, path: string) {
  const ctx = await actionContext();
  const v = await ctx.db.savedView.findUnique({ where: { id } });
  if (!v) return;
  if (v.userId !== ctx.user.id && !(v.userId === null && ctx.can("studio.manage"))) throw new Error("No puedes borrar este favorito");
  await ctx.db.savedView.delete({ where: { id } });
  revalidatePath(path);
}
