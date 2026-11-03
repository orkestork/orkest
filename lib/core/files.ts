import type { ExecContext } from "./context";

/**
 * Almacenamiento de archivos adjuntos (FileObject). El contenido se guarda en la base de datos
 * (storageKey "db:<id>") para que funcione igual en local y en producción sin un bucket externo.
 * Límite pensado para soportes y documentos de oficina, no para multimedia.
 */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED = /^(application\/pdf|image\/(png|jpe?g|webp|gif|heic)|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-excel))$/;

export class FileError extends Error {}

/** Toma el archivo de un campo de formulario; null si no se adjuntó nada. */
export function formFile(form: FormData, field: string): File | null {
  const f = form.get(field);
  return f instanceof File && f.size > 0 ? f : null;
}

export async function saveFile(ctx: ExecContext, file: File, link: { entityType: string; entityId?: string | null }) {
  if (file.size > MAX_FILE_BYTES) throw new FileError(`El archivo supera ${MAX_FILE_BYTES / 1024 / 1024} MB`);
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED.test(mimeType)) throw new FileError("Tipo de archivo no permitido (usa PDF, imagen, Word o Excel)");
  const data = Buffer.from(await file.arrayBuffer());
  const created = await ctx.db.fileObject.create({
    data: {
      organizationId: ctx.orgId, name: file.name.slice(0, 200) || "archivo", mimeType, size: file.size,
      storageKey: "db:pending", entityType: link.entityType, entityId: link.entityId ?? null, uploadedById: ctx.actorId, data,
    },
    select: { id: true },
  });
  await ctx.db.fileObject.update({ where: { id: created.id }, data: { storageKey: `db:${created.id}` } });
  return created.id;
}

/** Asocia un archivo subido antes de conocer el registro dueño. */
export async function linkFile(ctx: ExecContext, fileId: string, entityId: string) {
  await ctx.db.fileObject.update({ where: { id: fileId }, data: { entityId } });
}

export const fileUrl = (id: string, download = false) => `/files/${id}${download ? "?download=1" : ""}`;
