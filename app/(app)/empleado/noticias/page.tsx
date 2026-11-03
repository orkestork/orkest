import { Badge, Card, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/ui/format";
import { ANNOUNCEMENT_CATEGORY } from "@/lib/ui/hr-labels";
import { markAnnouncementRead } from "../../hr/actions";
import { portal } from "../_me";

export const metadata = { title: "Noticias" };

export default async function MyNews({ searchParams }: PageProps<"/empleado/noticias">) {
  const { ctx } = await portal();
  const cat = String((await searchParams).category ?? "");
  const [items, reads] = await Promise.all([
    ctx.db.hrAnnouncement.findMany({
      where: { isActive: true, OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }], ...(cat ? { category: cat } : {}) },
      orderBy: [{ isImportant: "desc" }, { createdAt: "desc" }], take: 50,
    }),
    ctx.db.hrAnnouncementRead.findMany({ where: { userId: ctx.user.id }, select: { announcementId: true } }),
  ]);
  const read = new Set(reads.map((r) => r.announcementId));
  return (
    <>
      <PageHeader title="Noticias" subtitle="Comunicados de la empresa." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a href="?" className={`rounded-full px-3 py-1 ${!cat ? "bg-[var(--ork-ink)] text-white" : "bg-white text-slate-600"}`}>Todas</a>
        {Object.entries(ANNOUNCEMENT_CATEGORY).map(([k, v]) => <a key={k} href={`?category=${k}`} className={`rounded-full px-3 py-1 ${cat === k ? "bg-[var(--ork-ink)] text-white" : "bg-white text-slate-600"}`}>{v}</a>)}
      </div>
      <div className="max-w-3xl space-y-4">
        {items.length === 0 && <Card><p className="text-sm text-slate-400">No hay noticias en esta categoría.</p></Card>}
        {items.map((a) => (
          <Card key={a.id} className={read.has(a.id) ? "" : "ring-1 ring-[var(--ork-violet)]/30"}>
            <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-[var(--ork-ink)]">{a.title}{a.isImportant && <Badge tone="rose">Importante</Badge>}{!read.has(a.id) && <Badge tone="violet">Nueva</Badge>}</p>
            <p className="mb-3 text-xs text-slate-500">{ANNOUNCEMENT_CATEGORY[a.category]} · {a.authorName ?? ""} · {dateTime(a.scheduledAt ?? a.createdAt)}</p>
            <p className="whitespace-pre-line text-sm">{a.body}</p>
            {!read.has(a.id) && <form action={markAnnouncementRead} className="mt-3"><input type="hidden" name="id" value={a.id} /><button className="text-xs text-[var(--ork-violet)] hover:underline">Marcar como leída</button></form>}
          </Card>
        ))}
      </div>
    </>
  );
}
