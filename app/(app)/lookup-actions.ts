"use server";

import { actionContext } from "@/lib/core/context";
import { createCustomer } from "@/lib/apps/crm";

/** Búsqueda de registros para los selectores con autocompletar (máx. 12 resultados). */
export type LookupItem = { id: string; name: string; hint?: string };

export async function lookupCustomers(q: string): Promise<LookupItem[]> {
  const ctx = await actionContext();
  const t = q.trim();
  const rows = await ctx.db.customer.findMany({
    where: t ? { OR: [{ name: { contains: t, mode: "insensitive" } }, { taxId: { contains: t } }, { phone: { contains: t } }, { email: { contains: t, mode: "insensitive" } }] } : {},
    orderBy: t ? { name: "asc" } : { updatedAt: "desc" }, take: 12, select: { id: true, name: true, city: true, taxId: true, phone: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, hint: [r.taxId && `NIT ${r.taxId}`, r.city, r.phone].filter(Boolean).join(" · ") || undefined }));
}

/** "Crear «nombre»" desde el selector, como en Odoo. */
export async function quickCreateCustomer(name: string): Promise<LookupItem> {
  const ctx = await actionContext("crm.customers.write", "crm");
  const c = await createCustomer(ctx, { name });
  return { id: c.id, name: c.name };
}
