"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { createDelivery, createSalesOrder, priceFor } from "@/lib/apps/sales-orders";
import { invoiceFromSalesOrder } from "@/lib/apps/invoicing";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveSalesOrder(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("sales.quotes.write", "sales");
    const customer = await ctx.db.customer.findUnique({ where: { id: s(form, "customerId") } });
    const pricelistId = s(form, "pricelistId") || customer?.pricelistId || null;
    const raw = JSON.parse(s(form, "lines") || "[]") as { productId: string; description: string; quantity: number; unitPrice: number; taxRate: number }[];
    // Si la línea usa el precio de lista del producto, se aplica la lista de precios del cliente
    const lines = await Promise.all(raw.map(async (l) => {
      if (!l.productId) return l;
      const p = await ctx.db.product.findUnique({ where: { id: l.productId } });
      const listPrice = p && Number(l.unitPrice) === Number(p.price) ? await priceFor(ctx, pricelistId, l.productId, l.quantity) : l.unitPrice;
      return { ...l, unitPrice: listPrice };
    }));
    const so = await createSalesOrder(ctx, {
      customerId: s(form, "customerId"), lines, warehouseId: s(form, "warehouseId") || undefined, pricelistId,
      paymentTermId: s(form, "paymentTermId") || null, commitmentAt: s(form, "commitmentAt") || null,
    });
    redirect(`/sales/orders/${so.id}`);
  });
}

export async function soAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const id = s(form, "id");
    if (s(form, "op") === "invoice") {
      const ctx = await actionContext("invoicing.write", "invoicing");
      const inv = await invoiceFromSalesOrder(ctx, id);
      revalidatePath(`/sales/orders/${id}`);
      return { ok: `Factura ${inv.number} emitida` };
    }
    const ctx = await actionContext("sales.quotes.write", "sales");
    const t = await createDelivery(ctx, id);
    revalidatePath(`/sales/orders/${id}`);
    return { ok: t ? `Entrega ${t.number} lista` : "No hay nada pendiente por entregar" };
  });
}

export async function savePricelist(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("sales.quotes.write", "sales");
    if (s(form, "op") === "item") {
      const pl = await ctx.db.pricelist.findUniqueOrThrow({ where: { id: s(form, "pricelistId") } });
      const fixed = s(form, "fixedPrice"), disc = s(form, "discountPct");
      if (!fixed && !disc) return { error: "Indica precio fijo o descuento" };
      await ctx.db.pricelist.update({ where: { id: pl.id }, data: { items: { create: {
        productId: s(form, "productId") || null, category: s(form, "category") || null, minQty: Number(s(form, "minQty") || 0),
        fixedPrice: fixed ? Number(fixed) : null, discountPct: disc ? Number(disc) : null,
      } } } });
    } else {
      if (!s(form, "name")) return { error: "Nombre obligatorio" };
      await ctx.db.pricelist.create({ data: { organizationId: ctx.orgId, name: s(form, "name"), currency: s(form, "currency") || ctx.org.currency } });
    }
    revalidatePath("/sales/pricelists");
    return { ok: "Guardado" };
  });
}
