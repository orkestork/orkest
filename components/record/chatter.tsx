import type { OrgContext } from "@/lib/core/context";
import { prisma } from "@/lib/core/prisma";
import { orgUsers } from "@/lib/core/members";
import { completeActivity } from "@/app/(app)/chatter-actions";
import { ChatterComposer } from "./chatter-composer";
import { nowMs } from "@/lib/ui/clock";

const KIND: Record<string, string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión", EMAIL: "Correo" };

function dayLabel(d: Date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - x.getTime()) / 86400000);
  return diff === 0 ? "Hoy" : diff === 1 ? "Ayer" : d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

/** Cambio registrado "Campo: antes → después · fuente": el campo va primero, como etiqueta. */
function Content({ type, text }: { type: string; text: string }) {
  const m = text.match(/^([^:]+):\s(.+?)\s→\s(.+?)(?:\s·\s(.+))?$/);
  if (type === "TRACKING" && m) {
    return (
      <p className="text-sm text-stone-800">
        <span className="mr-1.5 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">{m[1]}</span>
        <span className="text-stone-500">{m[2]}</span> <span aria-hidden="true" className="text-stone-400">⟶</span> <span className="font-medium text-[var(--ork-purple)]">{m[3]}</span>
        {m[4] && <span className="block text-xs text-stone-500">{m[4]}</span>}
      </p>
    );
  }
  return <p className={`whitespace-pre-wrap text-sm ${type === "SYSTEM" ? "text-stone-600" : "text-stone-800"}`}>{KIND[type] && <span className="mr-1.5 rounded-full bg-[var(--ork-violet)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--ork-purple)]">{KIND[type]}</span>}{text}</p>;
}

/** Actividad del registro: comentarios, seguimientos pendientes y línea de tiempo por día. */
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
    <section aria-labelledby="activity-title" className="rounded-2xl border border-[var(--ork-rule)] bg-white p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="activity-title" className="font-display text-lg font-semibold">Actividad</h2>
      </div>
      <ChatterComposer entityType={entityType} entityId={entityId} users={users} canWrite={canWrite} />
      {tasks.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Seguimientos pendientes</p>
          <ul className="grid gap-2 md:grid-cols-2">
            {tasks.map((t) => {
              const late = t.dueDate && t.dueDate.getTime() < nowMs();
              return (
                <li key={t.id} className="flex items-start gap-3 rounded-xl bg-stone-50 p-3">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${late ? "bg-rose-500" : "bg-amber-400"}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1 text-sm"><p className="font-medium">{t.title}</p><p className="text-xs text-stone-500">{late ? "Vencido" : t.dueDate?.toLocaleDateString("es-CO", { day: "numeric", month: "short" }) ?? "Sin fecha"} · {t.description ?? "Por hacer"} · {people.get(t.assigneeId ?? "") ?? "—"}</p></div>
                  <form action={completeActivity}><input type="hidden" name="entityType" value={entityType} /><input type="hidden" name="entityId" value={entityId} /><input type="hidden" name="taskId" value={t.id} />
                    <button className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm hover:text-emerald-700">Completar</button></form>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="mt-6 space-y-6">
        {[...days.entries()].map(([day, list]) => (
          <div key={day}>
            <p className="mb-3 text-xs font-semibold text-stone-500 first-letter:uppercase">{day}</p>
            <ol className="relative space-y-4 border-l-2 border-stone-100 pl-5">
              {list.map((a) => (
                <li key={a.id} className="relative">
                  <span aria-hidden="true" className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white ${a.type === "TRACKING" || a.type === "SYSTEM" ? "bg-stone-300" : "bg-[var(--ork-violet)]"}`} />
                  <p className="text-xs text-stone-500"><span className="font-semibold text-stone-800">{a.userId ? people.get(a.userId) : "Workezt"}</span> · {a.createdAt.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}</p>
                  <div className="mt-0.5"><Content type={a.type} text={a.content} /></div>
                </li>
              ))}
            </ol>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-stone-500">Sin actividad todavía.</p>}
      </div>
    </section>
  );
}
