"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { getEntity } from "@/lib/core/entities";
import { executeTransition } from "@/lib/core/workflow";
import { decideApproval } from "@/lib/core/approvals";
import { logActivity } from "@/lib/apps/crm";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

/** Acciones genéricas válidas para cualquier entidad registrada (workflow, actividad, aprobación). */
export async function transitionAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const entityType = String(form.get("entityType"));
    const def = getEntity(entityType);
    const ctx = await actionContext(def.writePermission, def.module);
    const id = String(form.get("entityId"));
    const r = await executeTransition(ctx, entityType, id, String(form.get("transitionId")));
    revalidatePath(def.path(id));
    return { ok: r.pendingApproval ? "Se solicitó aprobación. El registro quedó en espera." : "Estado actualizado" };
  });
}

export async function addNoteAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const entityType = String(form.get("entityType"));
    const def = getEntity(entityType);
    const ctx = await actionContext(def.writePermission, def.module);
    const content = String(form.get("content") ?? "").trim();
    if (!content) return { error: "Escribe una nota" };
    const id = String(form.get("entityId"));
    await logActivity(ctx, entityType, id, String(form.get("type") ?? "NOTE"), content);
    revalidatePath(def.path(id));
    return { ok: "Actividad registrada" };
  });
}

export async function decideApprovalAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext();
    await decideApproval(ctx, String(form.get("approvalId")), form.get("decision") === "approve", String(form.get("comment") ?? "") || undefined);
    revalidatePath("/approvals");
    return { ok: "Decisión registrada" };
  });
}
