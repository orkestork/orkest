"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/core/context";
import { getEntity } from "@/lib/core/entities";
import { IMPORTABLE, importRows, parseCsv, parseXlsx, suggestMapping, targetFields, validateRows, type RowError } from "@/lib/import/engine";
import { audit } from "@/lib/core/notify";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";

const MAX_ROWS = 5000;

export async function uploadFile(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("import.run");
    const entityType = String(form.get("entityType"));
    if (!(IMPORTABLE as readonly string[]).includes(entityType)) return { error: "Entidad no importable" };
    const def = getEntity(entityType);
    if (!ctx.hasModule(def.module) || !ctx.can(def.writePermission)) return { error: `Necesitas la app ${def.module} y el permiso ${def.writePermission}` };
    const file = form.get("file") as File | null;
    if (!file || file.size === 0) return { error: "Selecciona un archivo" };
    const name = file.name.toLowerCase();
    let parsed;
    if (name.endsWith(".csv")) parsed = parseCsv(await file.text());
    else if (name.endsWith(".xlsx")) {
      if (!ctx.flags.has("import.xlsx")) return { error: "La importación desde Excel no está habilitada para tu organización" };
      parsed = await parseXlsx(Buffer.from(await file.arrayBuffer()));
    } else return { error: "Formato no soportado. Usa .csv o .xlsx" };
    if (parsed.rows.length === 0) return { error: "El archivo no tiene filas de datos" };
    if (parsed.rows.length > MAX_ROWS) return { error: `Máximo ${MAX_ROWS} filas por importación` };
    const mapping = suggestMapping(parsed.headers, await targetFields(ctx, entityType));
    const job = await ctx.db.importJob.create({
      data: { organizationId: ctx.orgId, entityType, fileName: file.name, headers: parsed.headers, rows: parsed.rows, mapping, totalRows: parsed.rows.length, createdById: ctx.user.id },
    });
    redirect(`/import/${job.id}`);
  });
}

export async function validateJob(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("import.run");
    const job = await ctx.db.importJob.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
    if (job.status === "IMPORTED") return { error: "Esta importación ya se ejecutó" };
    const mapping = Object.fromEntries(job.headers.map((h) => [h, String(form.get(`map_${h}`) ?? "")]).filter(([, v]) => v));
    const { errors, valid } = await validateRows(ctx, job.entityType, job.rows as Record<string, string>[], mapping);
    await ctx.db.importJob.update({ where: { id: job.id }, data: { mapping, errors: errors as object[], validRows: valid.length, status: "VALIDATED" } });
    revalidatePath(`/import/${job.id}`);
    return errors.length ? { error: `${errors.length} error(es) encontrados. Revísalos abajo.` } : { ok: `Todas las filas (${valid.length}) son válidas.` };
  });
}

export async function runImport(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("import.run");
    const job = await ctx.db.importJob.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
    if (job.status !== "VALIDATED") return { error: "Primero valida el archivo" };
    const rows = job.rows as Record<string, string>[];
    const mapping = job.mapping as Record<string, string>;
    // Se re-valida en el momento de importar: nunca se insertan datos inválidos.
    const { errors, valid } = await validateRows(ctx, job.entityType, rows, mapping);
    const onlyValid = form.get("onlyValid") === "on";
    if (errors.length && !onlyValid) return { error: "Hay errores. Corrige el archivo o confirma explícitamente importar solo las filas válidas." };
    if (errors.some((e: RowError) => e.row === 0)) return { error: "Hay campos obligatorios sin columna asignada" };
    const imported = await importRows(ctx, job.entityType, rows, mapping, valid);
    await ctx.db.importJob.update({ where: { id: job.id }, data: { status: "IMPORTED", importedRows: imported, errors: errors as object[] } });
    await audit(ctx, "DataImported", job.entityType, job.id, { imported, skipped: rows.length - imported, file: job.fileName });
    revalidatePath(`/import/${job.id}`);
    return { ok: `${imported} registro(s) importados.${rows.length - imported ? ` ${rows.length - imported} fila(s) omitidas por errores.` : ""}` };
  });
}
