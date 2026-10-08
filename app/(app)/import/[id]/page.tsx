import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/core/context";
import { ENTITIES } from "@/lib/core/entities";
import { targetFields, type RowError } from "@/lib/import/engine";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, PageHeader, Table, td } from "@/components/ui";
import { runImport, validateJob } from "../actions";

export default async function ImportJobPage({ params }: PageProps<"/import/[id]">) {
  const ctx = await requirePermission("import.run");
  const { id } = await params;
  const job = await ctx.db.importJob.findUnique({ where: { id } });
  if (!job) notFound();
  const fields = await targetFields(ctx, job.entityType);
  const rows = job.rows as Record<string, string>[];
  const mapping = job.mapping as Record<string, string>;
  const errors = job.errors as RowError[];
  const done = job.status === "IMPORTED";

  return (
    <>
      <PageHeader title={job.fileName} crumbs={[{ label: "Importar", href: "/import" }, { label: job.fileName }]}
        subtitle={<>{ENTITIES[job.entityType]?.labelPlural} · {job.totalRows} filas · <Badge tone={done ? "emerald" : "blue"}>{job.status}</Badge></>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="1 · Mapeo de columnas" className="lg:col-span-1">
          <ActionForm action={validateJob} className="space-y-3">
            <input type="hidden" name="id" value={job.id} />
            {job.headers.map((h) => (
              <label key={h} className="grid grid-cols-2 items-center gap-2 text-sm">
                <span className="truncate font-mono text-xs" title={h}>{h}</span>
                <select name={`map_${h}`} defaultValue={mapping[h] ?? ""} disabled={done} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">— Ignorar —</option>
                  {fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>)}
                </select>
              </label>
            ))}
            {!done && <SubmitButton className={btn.secondary} pendingText="Validando…">2 · Validar</SubmitButton>}
          </ActionForm>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          {job.status !== "UPLOADED" && (
            <Card title={`Resultado de validación · ${job.validRows} válidas / ${job.totalRows}`}>
              {errors.length === 0 ? <p className="text-sm text-emerald-700">Sin errores.</p> : (
                <div className="max-h-72 overflow-y-auto">
                  <Table head={["Fila", "Campo", "Error"]}>
                    {errors.slice(0, 300).map((e, i) => <tr key={i}><td className={td}>{e.row || "—"}</td><td className={td}>{e.field}</td><td className={`${td} text-[var(--ork-pink)]`}>{e.message}</td></tr>)}
                  </Table>
                </div>
              )}
              {!done && job.validRows > 0 && (
                <ActionForm action={runImport} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <input type="hidden" name="id" value={job.id} />
                  {errors.length > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="onlyValid" /> Entiendo: importar solo las {job.validRows} filas válidas y omitir {job.totalRows - job.validRows}</label>}
                  <SubmitButton className={btn.primary} pendingText="Importando…">3 · Importar</SubmitButton>
                </ActionForm>
              )}
              {done && <p className="mt-3 text-sm font-medium text-emerald-700">Importados {job.importedRows} registros.</p>}
            </Card>
          )}
          <Card title="Vista previa (primeras 10 filas)" padded={false}>
            <Table head={["#", ...job.headers]}>
              {rows.slice(0, 10).map((r, i) => <tr key={i}><td className={td}>{i + 2}</td>{job.headers.map((h) => <td key={h} className={`${td} whitespace-nowrap text-xs`}>{r[h]}</td>)}</tr>)}
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
