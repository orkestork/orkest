import Link from "@/components/plink";
import { requirePermission } from "@/lib/core/context";
import { ENTITIES } from "@/lib/core/entities";
import { IMPORTABLE } from "@/lib/import/engine";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { dateTime } from "@/lib/ui/format";
import { uploadFile } from "./actions";

export const metadata = { title: "Importar datos" };

export default async function ImportPage({ searchParams }: PageProps<"/import">) {
  const ctx = await requirePermission("import.run");
  const { entity } = await searchParams;
  const entities = IMPORTABLE.map((t) => ENTITIES[t]).filter((e) => ctx.hasModule(e.module) && ctx.can(e.writePermission));
  const jobs = await ctx.db.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, entityType: true, fileName: true, status: true, totalRows: true, validRows: true, importedRows: true, createdAt: true } });
  return (
    <>
      <PageHeader title="Importar datos" subtitle="CSV o Excel → mapeo de columnas → validación completa → importación. Nunca se insertan datos inválidos en silencio." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Nuevo archivo">
          {entities.length === 0 ? <p className="text-sm text-slate-500">No tienes permisos de escritura en ninguna entidad importable.</p> : (
            <ActionForm action={uploadFile} className="space-y-3">
              <Field label="¿Qué vas a importar?">
                <select name="entityType" defaultValue={typeof entity === "string" ? entity : undefined} className={input}>
                  {entities.map((e) => <option key={e.type} value={e.type}>{e.labelPlural}</option>)}
                </select>
              </Field>
              <Field label="Archivo (.csv o .xlsx)" hint="La primera fila debe contener los encabezados."><input name="file" type="file" accept=".csv,.xlsx" required className="block w-full text-sm" /></Field>
              <SubmitButton className={btn.primary} pendingText="Leyendo…">Subir y mapear</SubmitButton>
            </ActionForm>
          )}
        </Card>
        <Card title="Importaciones recientes" padded={false} className="lg:col-span-2">
          <Table head={["Archivo", "Tipo", "Filas", "Estado", "Fecha"]} empty={jobs.length === 0}>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className={td}><Link href={`/import/${j.id}`} className="font-medium hover:underline">{j.fileName}</Link></td>
                <td className={td}>{ENTITIES[j.entityType]?.labelPlural}</td>
                <td className={td}>{j.status === "IMPORTED" ? `${j.importedRows}/${j.totalRows}` : j.totalRows}</td>
                <td className={td}><Badge tone={j.status === "IMPORTED" ? "emerald" : j.status === "VALIDATED" ? "blue" : "slate"}>{j.status}</Badge></td>
                <td className={td}>{dateTime(j.createdAt)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
