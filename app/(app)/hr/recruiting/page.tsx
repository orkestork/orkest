import NextLink from "next/link";
import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { fileUrl } from "@/lib/core/files";
import { ago } from "@/lib/ui/format";
import { CANDIDATE_STAGE } from "@/lib/ui/hr-labels";
import { moveCandidate, saveCandidate } from "../actions";

export const metadata = { title: "Selección" };

export default async function Recruiting({ searchParams }: PageProps<"/hr/recruiting">) {
  const ctx = await requireModule("hr", "hr.recruiting.read");
  const sp = await searchParams;
  const position = String(sp.position ?? "");
  const [candidates, positions] = await Promise.all([
    ctx.db.candidate.findMany({ where: position ? { position } : {}, orderBy: { updatedAt: "desc" } }),
    ctx.db.candidate.groupBy({ by: ["position"], _count: { _all: true }, orderBy: { position: "asc" } }),
  ]);
  const editing = candidates.find((c) => c.id === sp.edit);
  const canWrite = ctx.can("hr.recruiting.write");
  const stages = Object.keys(CANDIDATE_STAGE);
  return (
    <>
      <PageHeader title="Selección" subtitle="Candidatos por etapa del proceso. Al contratar, vincúlalo como colaborador."
        actions={canWrite && <a href="#nuevo" className={btn.primary}>Nuevo candidato</a>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <NextLink href="?" className={`${btn.small} ${!position ? "border-[var(--ork-violet)] text-[var(--ork-violet)]" : ""}`}>Todos los cargos</NextLink>
        {positions.map((p) => <NextLink key={p.position} href={`?position=${encodeURIComponent(p.position)}`} className={`${btn.small} ${position === p.position ? "border-[var(--ork-violet)] text-[var(--ork-violet)]" : ""}`}>{p.position} · {p._count._all}</NextLink>)}
      </div>
      <div className="mb-8 grid gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-6">
        {stages.map((st) => {
          const list = candidates.filter((c) => c.stage === st);
          return (
            <section key={st} className="min-w-52 rounded-2xl border border-[var(--ork-rule)] bg-white/60 p-2">
              <h3 className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">{CANDIDATE_STAGE[st].label}<span className="text-slate-400">{list.length}</span></h3>
              <ul className="space-y-2">
                {list.map((c) => (
                  <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                    <p className="font-medium">{c.fullName}</p>
                    <p className="text-xs text-slate-500">{c.position}{c.source ? ` · ${c.source}` : ""}</p>
                    {(c.email || c.phone) && <p className="mt-1 truncate text-xs text-slate-500">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>}
                    {c.notes && <p className="mt-1 line-clamp-2 text-xs italic text-slate-500">{c.notes}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
                      {c.fileId && <a href={fileUrl(c.fileId)} target="_blank" className="text-[var(--ork-violet)] hover:underline">Hoja de vida</a>}
                      <span className="text-slate-400">{ago(c.updatedAt)}</span>
                    </div>
                    {canWrite && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <form action={moveCandidate} className="flex gap-1">
                          <input type="hidden" name="id" value={c.id} />
                          <select name="stage" defaultValue={c.stage} className="rounded-md border border-slate-300 px-1 py-0.5 text-xs">
                            {stages.map((s) => <option key={s} value={s}>{CANDIDATE_STAGE[s].label}</option>)}
                          </select>
                          <button className={btn.small}>Mover</button>
                        </form>
                        <a href={`?edit=${c.id}#nuevo`} className={btn.ghost}>Editar</a>
                        {c.stage === "CONTRATADO" && ctx.can("hr.employees.write") && <NextLink href={`/hr/employees/new`} className={btn.ghost}>Vincular</NextLink>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {canWrite && (
        <Card title={editing ? `Editar ${editing.fullName}` : "Nuevo candidato"} className="max-w-2xl">
          <div id="nuevo" />
          <ActionForm action={saveCandidate} className="grid gap-3 sm:grid-cols-2" key={editing?.id ?? "new"}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Nombre completo *"><input name="fullName" required defaultValue={editing?.fullName} className={input} /></Field>
            <Field label="Cargo al que aplica *"><input name="position" required defaultValue={editing?.position ?? position} className={input} /></Field>
            <Field label="Correo"><input type="email" name="email" defaultValue={editing?.email ?? ""} className={input} /></Field>
            <Field label="Teléfono"><input name="phone" defaultValue={editing?.phone ?? ""} className={input} /></Field>
            <Field label="Fuente"><input name="source" defaultValue={editing?.source ?? ""} placeholder="Referido, portal de empleo, LinkedIn…" className={input} /></Field>
            <Field label="Hoja de vida" hint="PDF o Word"><input type="file" name="file" className="text-sm" /></Field>
            <Field label="Notas" className="sm:col-span-2"><textarea name="notes" rows={3} defaultValue={editing?.notes ?? ""} className={input} /></Field>
            <div className="flex gap-2 sm:col-span-2">
              <SubmitButton className={btn.primary}>{editing ? "Guardar" : "Registrar candidato"}</SubmitButton>
              {editing && <a href="?" className={btn.secondary}>Cancelar</a>}
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
