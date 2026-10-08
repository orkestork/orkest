import { z } from "zod";
import type { ExecContext } from "@/lib/core/context";
import { emitEvent } from "@/lib/core/events";
import { getFieldDefs, validateCustomFields } from "@/lib/core/custom-fields";
import { getWorkflow, initialState } from "@/lib/core/workflow";
import { addActivity } from "@/lib/core/notify";

export class ValidationError extends Error {
  constructor(public errors: Record<string, string>) {
    super(Object.values(errors).join(" · "));
  }
}

const opt = z.string().trim().optional().transform((v) => v || null);

export const CustomerInput = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio"),
  taxId: opt,
  email: z.union([z.literal(""), z.email("Email inválido")]).optional().transform((v) => v || null),
  phone: opt,
  city: opt,
  ownerId: opt,
  pricelistId: opt,
  paymentTermId: opt,
  customFields: z.record(z.string(), z.unknown()).default({}),
});

function zodErrors(e: z.ZodError) {
  return Object.fromEntries(e.issues.map((i) => [i.path.join(".") || "form", i.message]));
}

export async function createCustomer(ctx: ExecContext, raw: unknown) {
  const parsed = CustomerInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError(zodErrors(parsed.error));
  const cf = validateCustomFields(await getFieldDefs(ctx.db, "customer"), parsed.data.customFields);
  if (!cf.ok) throw new ValidationError(cf.errors);
  const customer = await ctx.db.customer.create({
    data: { ...parsed.data, customFields: cf.values as object, organizationId: ctx.orgId },
  });
  await emitEvent(ctx, "CustomerCreated", "customer", customer.id, { name: customer.name });
  return customer;
}

export async function updateCustomer(ctx: ExecContext, id: string, raw: unknown) {
  const parsed = CustomerInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError(zodErrors(parsed.error));
  const cf = validateCustomFields(await getFieldDefs(ctx.db, "customer"), parsed.data.customFields);
  if (!cf.ok) throw new ValidationError(cf.errors);
  const before = await ctx.db.customer.findUniqueOrThrow({ where: { id } });
  const customer = await ctx.db.customer.update({ where: { id }, data: { ...parsed.data, customFields: cf.values as object } });
  await emitEvent(ctx, "CustomerUpdated", "customer", id, { before: { name: before.name, customFields: before.customFields } });
  return customer;
}

export const OpportunityInput = z.object({
  title: z.string().trim().min(2, "El título es obligatorio"),
  customerId: opt,
  amount: z.coerce.number().min(0).default(0),
  ownerId: opt,
  expectedClose: opt,
});

export async function createOpportunity(ctx: ExecContext, raw: unknown) {
  const parsed = OpportunityInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError(zodErrors(parsed.error));
  const wf = await getWorkflow(ctx.db, "opportunity");
  const d = parsed.data;
  const opp = await ctx.db.opportunity.create({
    data: {
      organizationId: ctx.orgId, title: d.title, customerId: d.customerId, amount: d.amount, ownerId: d.ownerId ?? ctx.actorId,
      expectedClose: d.expectedClose ? new Date(d.expectedClose) : null, status: initialState(wf, "new"),
    },
  });
  await emitEvent(ctx, "LeadCreated", "opportunity", opp.id, { title: opp.title, amount: d.amount });
  return opp;
}

export async function logActivity(ctx: ExecContext, entityType: string, entityId: string, type: string, content: string) {
  await addActivity(ctx, entityType, entityId, content, type);
  if (entityType === "opportunity") {
    await ctx.db.opportunity.update({ where: { id: entityId }, data: { lastActivityAt: new Date() } });
  }
}
