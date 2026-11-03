"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { createReport, REPORT_MODULES, type ReportModule } from "@/lib/apps/ops-reports";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Cierra un periodo de un área de operaciones guardando la foto de sus indicadores. */
export async function saveOpsReport(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const area = s(form, "module") as ReportModule;
    if (!(area in REPORT_MODULES)) return { error: "Área inválida" };
    const ctx = await actionContext(`${area}.write`, area);
    await createReport(ctx, area, { from: s(form, "from"), to: s(form, "to"), notes: s(form, "notes") });
    revalidatePath(`${REPORT_MODULES[area].base}/reports`);
    return { ok: "Informe guardado" };
  });
}
