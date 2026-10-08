import type { OrgContext } from "@/lib/core/context";
import { prisma } from "@/lib/core/prisma";
import { orgUsers } from "@/lib/core/members";
import { Avatar } from "@/components/list/status-pill";
import { completeActivity } from "@/app/(app)/chatter-actions";
import { ChatterComposer } from "./chatter-composer";

const KIND: Record<string, string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión", EMAIL: "Correo" };

function dayLabel(d: Date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - x.getTime()) / 86400000);
  return diff === 0 ? "Hoy" : diff === 1 ? "Ayer" : d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

/** "Campo: antes → después · fuente" se muestra como en Odoo: antes → después (Campo). */
function Content({ type, text }: { type: string; text: string }) {
  const m = text.match(/^([^:]+):\s(.+?)\s→\s(.+?)(?:\s·\s(.+))?$/);
  if (type === "TRACKING" && m) {
    return (
      <p className="text-sm text-stone-800">
        <span className="text-stone-500 line-through decoration-stone-300">{m[2]}</span> <span aria-hidden="true">→</span> <span className="font-medium text-[var(--ork-violet)]">{m[3]}</span> <span className="italic text-stone-500">({m[1]})</span>
        {m[4] && <span className="block text-xs text-stone-500">{m[4]}</span>}
      </p>
    );
  }
  return <p className={`whitespace-pre-wrap text-sm ${type === "SYSTEM" ? "text-stone-600" : "text-stone-800"}`}>{KIND[type] && <span className="mr-1 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold text-stone-700">{KIND[type]}</span>}{text}</p>;
}

/** Panel lateral: composer, actividades planificadas e historial agrupado por día. */
export async function Chatter({ ctx, entityType, entityId, canWrite }: { ctx: OrgContext; entityType: string; entityId: string; canWrite: boolean }) {
  const [items, tasks, users] = await Promise.all([
    ctx.db.activity.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "desc" }, take: 100 }),
    ctx.db.task.findMany({ where: { sourceType: entityType, sourceId: entityId, status: "OPEN" }, orderBy: { dueDate: "asc" } }),
    orgUsers(ctx),
  ]);
  const people = new Map((await prisma.user.findMany({ where: { id: { in: [...items.map((i) => i.userId ?? ""), ...tasks.map((t) => t.assigneeId ?? "")].filter(Boolean) } } })).map((u) => [u.id, u.name]));
  const days = new Map<string, typeof items>();
  for (const i of items) days.set(dayLabel(i.createdAt), [...(days.get(dayLabel(i.createdAt)) ?? []), i]);

  return (
    <aside className="space-y-5">
      <ChatterComposer entityType={entityType} entityId={entityId} users={users} canWrite={canWrite} />
      {tasks.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Actividades planificadas</p>
          <ul className="space-y-2">
            {tasks.map((t) => {
              const late = t.dueDate && t.dueDate.getTime() < Date.now();
              return (
                <li key={t.id} className="flex items-start gap-2 rounded-lg border border-stone-200 bg-white p-2.5">
                  <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${late ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>{late ? "Vencida" : t.dueDate?.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span>
                  <div className="min-w-0 flex-1 text-sm"><p className="font-medium">{t.title}</p><p className="text-xs text-stone-500">{t.description ?? "Por hacer"} · {people.get(t.assigneeId ?? "") ?? "—"}</p></div>
                  <form action={completeActivity}><input type="hidden" name="entityType" value={entityType} /><input type="hidden" name="entityId" value={entityId} /><input type="hidden" name="taskId" value={t.id} />
                    <button className="rounded-md border border-stone-300 px-2 py-0.5 text-xs hover:border-emerald-600 hover:text-emerald-700">✓ Hecho</button></form>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {[...days.entries()].map(([day, list]) => (
        <section key={day}>
          <div className="mb-3 flex items-center gap-3 text-xs text-stone-500"><span className="h-px flex-1 bg-stone-200" />{day}<span className="h-px flex-1 bg-stone-200" /></div>
          <ul className="space-y-4">
            {list.map((a) => (
              <li key={a.id} className="flex gap-2.5">
                <span className="mt-0.5"><Avatar name={a.userId ? people.get(a.userId) ?? "Usuario" : "ORKEST"} size={30} label={false} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs"><span className="font-semibold text-stone-900">{a.userId ? people.get(a.userId) : "ORKEST"}</span> <span className="text-stone-500">{a.createdAt.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}</span></p>
                  <Content type={a.type} text={a.content} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {items.length === 0 && <p className="text-sm text-stone-500">Sin actividad todavía.</p>}
    </aside>
  );
}
