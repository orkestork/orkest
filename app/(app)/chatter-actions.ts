"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { getEntity } from "@/lib/core/entities";
import { addActivity } from "@/lib/core/notify";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Programa una actividad (tarea con vencimiento y responsable) ligada al registro. */
export async function scheduleActivity(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const def = getEntity(s(form, "entityType"));
    const ctx = await actionContext(def.readPermission, def.module);
    if (!s(form, "title")) return { error: "Escribe el resumen de la actividad" };
    const id = s(form, "entityId");
    await ctx.db.task.create({ data: {
      organizationId: ctx.orgId, title: s(form, "title"), description: s(form, "kind") || null, assigneeId: s(form, "assigneeId") || ctx.user.id,
      dueDate: s(form, "dueDate") ? new Date(s(form, "dueDate")) : new Date(Date.now() + 86400000), sourceType: def.type, sourceId: id,
    } });
    await addActivity(ctx, def.type, id, `Actividad programada: ${s(form, "title")}`, "SYSTEM");
    revalidatePath(def.path(id));
    return { ok: "Actividad programada" };
  });
}

export async function completeActivity(form: FormData) {
  const def = getEntity(s(form, "entityType"));
  const ctx = await actionContext(def.readPermission, def.module);
  const t = await ctx.db.task.update({ where: { id: s(form, "taskId") }, data: { status: "DONE" } });
  await addActivity(ctx, def.type, s(form, "entityId"), `Actividad completada: ${t.title}`, "SYSTEM");
  revalidatePath(def.path(s(form, "entityId")));
}
