import type { OrgContext } from "@/lib/core/context";
import { prisma } from "@/lib/core/prisma";
import { ActionForm, SubmitButton } from "./action-form";
import { addNoteAction } from "@/app/(app)/entity-actions";
import { btn, Card, input } from "./ui";
import { dateTime } from "@/lib/ui/format";

const TYPE_LABEL: Record<string, string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión", EMAIL: "Email", SYSTEM: "Sistema" };

export async function ActivityTimeline({ ctx, entityType, entityId, canWrite }: { ctx: OrgContext; entityType: string; entityId: string; canWrite: boolean }) {
  const items = await ctx.db.activity.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "desc" }, take: 50 });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: items.map((i) => i.userId ?? "").filter(Boolean) } } })).map((u) => [u.id, u.name]));
  return (
    <Card title="Actividad">
      {canWrite && (
        <ActionForm action={addNoteAction} className="mb-4 space-y-2">
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityId" value={entityId} />
          <textarea name="content" rows={2} placeholder="Registrar nota, llamada o reunión…" className={input} />
          <div className="flex gap-2">
            <select name="type" className={`${input} !w-auto`}>
              {["NOTE", "CALL", "MEETING", "EMAIL"].map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <SubmitButton className={btn.secondary}>Registrar</SubmitButton>
          </div>
        </ActionForm>
      )}
      {items.length === 0 ? <p className="text-sm text-slate-400">Sin actividad.</p> : (
        <ol className="space-y-3 border-l border-slate-200 pl-4">
          {items.map((a) => (
            <li key={a.id} className="relative">
              <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${a.type === "SYSTEM" ? "bg-slate-300" : "bg-[var(--brand)]"}`} />
              <p className="text-sm text-slate-700">{a.content}</p>
              <p className="text-xs text-slate-400">{TYPE_LABEL[a.type] ?? a.type} · {a.userId ? users.get(a.userId) : "ORKEST"} · {dateTime(a.createdAt)}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
