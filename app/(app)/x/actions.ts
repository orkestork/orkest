"use server";

import { redirect } from "next/navigation";
import { actionContext } from "@/lib/core/context";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { createCustomEntity, createRecord, entityType } from "@/lib/apps/custom-objects";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveCustomEntity(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("studio.manage");
    const ent = await createCustomEntity(ctx, {
      key: s(form, "key"), label: s(form, "label"), labelPlural: s(form, "labelPlural"), icon: s(form, "icon"), prefix: s(form, "prefix"),
      hasLines: form.get("hasLines") === "on", states: s(form, "states").split(",").filter((x) => x.trim()),
    });
    redirect(`/studio/fields?entity=${encodeURIComponent(entityType(ent.key))}`);
  });
}

export async function saveRecord(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const key = s(form, "entityKey");
    const ctx = await actionContext(`custom.${key}.write`);
    const defs = await getFieldDefs(ctx.db, entityType(key));
    const values: Record<string, unknown> = {};
    for (const d of defs) values[d.key] = d.type === "multiselect" ? form.getAll(`cf_${d.key}`).map(String) : form.get(`cf_${d.key}`) ?? undefined;
    const lines = JSON.parse(s(form, "lines") || "[]") as Record<string, unknown>[];
    const rec = await createRecord(ctx, key, values, lines);
    redirect(`/x/${key}/${rec.id}`);
  });
}
