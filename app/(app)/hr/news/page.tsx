import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/ui/format";
import { ANNOUNCEMENT_CATEGORY, opts } from "@/lib/ui/hr-labels";
import { saveAnnouncement, toggleAnnouncement } from "../actions";
import { isoDay, Select } from "../_ui";
import { CommsTabs } from "./_tabs";

export const metadata = { title: "Noticias" };

export default async function News({ searchParams }: PageProps<"/hr/news">) {
  const ctx = await requireModule("hr", "hr.comms.read");
  const sp = await searchParams;
  const [items, members] = await Promise.all([
    ctx.db.hrAnnouncement.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { reads: true } } }, take: 100 }),
    ctx.db.membership.count({ where: { status: "ACTIVE" } }),
  ]);
  const editing = items.find((a) => a.id === sp.edit);
  const canWrite = ctx.can("hr.comms.write");
  return (
    <>
      <PageHeader title="Noticias" subtitle="Comunicados internos que los colaboradores ven en su portal. Las importantes quedan destacadas." />
      <CommsTabs active="/hr/news" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {items.length === 0 && <Card><p className="text-sm text-slate-400">Aún no hay noticias publicadas.</p></Card>}
          {items.map((a) => (
            <Card key={a.id} title={<span className="flex flex-wrap items-center gap-2 normal-case tracking-normal">{a.title}{a.isImportant && <Badge tone="rose">Importante</Badge>}{!a.isActive && <Badge>Oculta</Badge>}</span>}
              actions={canWrite && <div className="flex gap-1">
                <a href={`?edit=${a.id}`} className={btn.ghost}>Editar</a>
                <form action={toggleAnnouncement}><input type="hidden" name="id" value={a.id} /><button className={btn.ghost}>{a.isActive ? "Ocultar" : "Mostrar"}</button></form>
              </div>}>
              <p className="mb-2 text-xs text-slate-500">{ANNOUNCEMENT_CATEGORY[a.category]} · {a.authorName ?? "—"} · {dateTime(a.scheduledAt ?? a.createdAt)} · leída por {a._count.reads} de {members}</p>
              <p className="whitespace-pre-line text-sm">{a.body}</p>
            </Card>
          ))}
        </div>
        {canWrite && (
          <Card title={editing ? "Editar noticia" : "Publicar noticia"}>
            <ActionForm action={saveAnnouncement} className="space-y-3" key={editing?.id ?? "new"}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field label="Título *"><input name="title" required defaultValue={editing?.title} className={input} /></Field>
              <Field label="Categoría"><Select name="category" defaultValue={editing?.category ?? "GENERAL"} options={opts(ANNOUNCEMENT_CATEGORY)} /></Field>
              <Field label="Contenido *"><textarea name="body" rows={6} required defaultValue={editing?.body} className={input} /></Field>
              <Field label="Publicar desde" hint="Vacío: de inmediato"><input type="date" name="scheduledAt" defaultValue={isoDay(editing?.scheduledAt)} className={input} /></Field>
              <Field label="Firma"><input name="authorName" defaultValue={editing?.authorName ?? ctx.user.name} className={input} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isImportant" defaultChecked={editing?.isImportant} /> Marcar como importante</label>
              <div className="flex gap-2">
                <SubmitButton className={btn.primary}>{editing ? "Guardar" : "Publicar"}</SubmitButton>
                {editing && <a href="?" className={btn.secondary}>Cancelar</a>}
              </div>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
