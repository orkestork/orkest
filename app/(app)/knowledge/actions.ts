"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { createKnowledge, link, publishKnowledge, updateKnowledge } from "@/lib/apps/knowledge";
import { addSonarItem, structureSonarItem } from "@/lib/apps/sonar";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveKnowledge(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("knowledge.write", "knowledge");
    const id = s(form, "id");
    if (id) {
      await updateKnowledge(ctx, id, { title: s(form, "title"), body: s(form, "body") });
      revalidatePath(`/knowledge/${id}`);
      return { ok: "Nueva versión guardada (queda en borrador hasta aprobarse)" };
    }
    const k = await createKnowledge(ctx, {
      type: s(form, "type"), title: s(form, "title"), body: s(form, "body"), ownerId: s(form, "ownerId") || null,
      criticality: s(form, "criticality") || "MEDIUM", departmentId: s(form, "departmentId") || null,
    });
    redirect(`/knowledge/${k.id}`);
  });
}

export async function approveKnowledge(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("knowledge.approve", "knowledge");
    await publishKnowledge(ctx, s(form, "id"));
    revalidatePath(`/knowledge/${s(form, "id")}`);
    return { ok: "Publicado" };
  });
}

export async function addRelation(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("knowledge.write", "knowledge");
    const [toType, toId] = s(form, "target").split(":");
    const [fromType, fromId] = s(form, "source").split(":");
    if (!toId || !fromId) return { error: "Selecciona ambos extremos de la relación" };
    await link(ctx, fromType, fromId, s(form, "relation"), toType, toId);
    revalidatePath(`/knowledge/${s(form, "id")}`);
    return { ok: "Relación agregada al grafo" };
  });
}

export async function saveSonarSession(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("sonar.write", "sonar");
    if (!s(form, "title")) return { error: "Título obligatorio" };
    const session = await ctx.db.sonarSession.create({
      data: { organizationId: ctx.orgId, title: s(form, "title"), area: s(form, "area") || null, facilitatorId: ctx.user.id, participants: form.getAll("participants").map(String), summary: s(form, "summary") || null },
    });
    redirect(`/sonar/${session.id}`);
  });
}

export async function saveSonarItem(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("sonar.write", "sonar");
    if (!s(form, "title")) return { error: "Título obligatorio" };
    await addSonarItem(ctx, s(form, "sessionId"), { kind: s(form, "kind"), title: s(form, "title"), description: s(form, "description") || undefined, ownerId: s(form, "ownerId") || null });
    revalidatePath(`/sonar/${s(form, "sessionId")}`);
    return { ok: "Registrado" };
  });
}

export async function structureItem(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("sonar.write", "sonar");
    await structureSonarItem(ctx, s(form, "itemId"));
    revalidatePath(`/sonar/${s(form, "sessionId")}`);
    return { ok: "Convertido en capacidad estructurada" };
  });
}
