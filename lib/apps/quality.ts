import type { ExecContext } from "@/lib/core/context";
import { emitEvent } from "@/lib/core/events";
import { ValidationError } from "./crm";

export async function createNonconformity(
  ctx: ExecContext,
  d: { title: string; description?: string; supplierId?: string | null; productId?: string | null; severity: string },
) {
  if (!d.title?.trim()) throw new ValidationError({ title: "Título obligatorio" });
  const count = await ctx.db.nonconformity.count();
  const nc = await ctx.db.nonconformity.create({
    data: { organizationId: ctx.orgId, code: `NC-${String(count + 1).padStart(4, "0")}`, ...d, supplierId: d.supplierId || null, productId: d.productId || null },
  });
  await emitEvent(ctx, "NonconformityCreated", "nonconformity", nc.id, { code: nc.code, severity: nc.severity });
  return nc;
}
