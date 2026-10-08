import { revalidatePath } from "next/cache";
import { requireContext, actionContext } from "@/lib/core/context";
import { orgUsers } from "@/lib/core/members";
import { Badge, btn, Card, PageHeader } from "@/components/ui";
import { date } from "@/lib/ui/format";

export const metadata = { title: "Tareas" };

async function complete(form: FormData) {
  "use server";
  const ctx = await actionContext();
  await ctx.db.task.update({ where: { id: String(form.get("id")) }, data: { status: "DONE" } });
  revalidatePath("/tasks");
}

async function create(form: FormData) {
  "use server";
  const ctx = await actionContext();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return;
  await ctx.db.task.create({ data: { organizationId: ctx.orgId, title, assigneeId: String(form.get("assigneeId") || ctx.user.id), dueDate: form.get("dueDate") ? new Date(String(form.get("dueDate"))) : null } });
  revalidatePath("/tasks");
}

export default async function Tasks({ searchParams }: PageProps<"/tasks">) {
  const ctx = await requireContext();
  const { all } = await searchParams;
  const [tasks, users] = await Promise.all([
    ctx.db.task.findMany({ where: { status: "OPEN", ...(all ? {} : { assigneeId: ctx.user.id }) }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] }),
    orgUsers(ctx),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Tareas" subtitle={all ? "Todas las tareas abiertas" : "Asignadas a ti"} actions={<a href={all ? "/tasks" : "/tasks?all=1"} className={btn.secondary}>{all ? "Ver mías" : "Ver todas"}</a>} />
      <Card className="mb-6">
        <form action={create} className="flex flex-wrap gap-2">
          <input name="title" placeholder="Nueva tarea…" required className="min-w-60 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select name="assigneeId" defaultValue={ctx.user.id} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <input name="dueDate" type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Fecha límite" />
          <button className={btn.primary}>Crear</button>
        </form>
      </Card>
      <Card padded={false}>
        <ul className="divide-y divide-slate-100">
          {tasks.map((t) => {
            const late = t.dueDate && t.dueDate.getTime() < Date.now();
            return (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <form action={complete}><input type="hidden" name="id" value={t.id} /><button aria-label="Completar" className="h-5 w-5 rounded border border-slate-300 hover:border-emerald-500 hover:bg-emerald-50" /></form>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{t.title}</p>
                  <p className="text-xs text-slate-400">{t.assigneeId ? userMap.get(t.assigneeId) : "Sin asignar"}{t.sourceType ? ` · origen: ${t.sourceType}` : ""}</p>
                </div>
                {t.dueDate && <Badge tone={late ? "rose" : "slate"}>{date(t.dueDate)}</Badge>}
              </li>
            );
          })}
          {tasks.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-400">Sin tareas abiertas.</li>}
        </ul>
      </Card>
    </>
  );
}
