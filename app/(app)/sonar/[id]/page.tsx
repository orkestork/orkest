import Link from "@/components/plink";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { orgUsers } from "@/lib/core/members";
import { SONAR_KINDS } from "@/lib/apps/sonar";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader } from "@/components/ui";
import { date } from "@/lib/ui/format";
import { saveSonarItem, structureItem } from "../../knowledge/actions";

const KIND = Object.fromEntries(SONAR_KINDS.map((k) => [k.value, k.label]));
const TONE: Record<string, string> = { RISK: "rose", PROBLEM: "amber", OPPORTUNITY: "emerald", DECISION: "violet", ACTION: "blue", PROCESS: "indigo", KNOWLEDGE: "cyan", FINDING: "slate" };
const TARGET: Record<string, string> = { ACTION: "Tarea", DECISION: "Tarea", PROCESS: "Proceso en Knowledge", KNOWLEDGE: "Artículo en Knowledge", FINDING: "Artículo en Knowledge", RISK: "Insight de Radar", PROBLEM: "Insight de Radar", OPPORTUNITY: "Insight de Radar" };
const LINK: Record<string, (id: string) => string> = { knowledge: (id) => `/knowledge/${id}`, task: () => "/tasks", insight: () => "/radar" };

export default async function SonarSession({ params }: PageProps<"/sonar/[id]">) {
  const ctx = await requireModule("sonar", "sonar.read");
  const { id } = await params;
  const s = await ctx.db.sonarSession.findUnique({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });
  if (!s) notFound();
  const users = await orgUsers(ctx);
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const canWrite = ctx.can("sonar.write");
  return (
    <>
      <PageHeader title={s.title} crumbs={[{ label: "Sonar", href: "/sonar" }, { label: s.title }]}
        subtitle={`${s.area ?? ""} · ${date(s.date)} · Facilitador: ${s.facilitatorId ? userMap.get(s.facilitatorId) : "—"} · Participantes: ${s.participants.map((p) => userMap.get(p)).filter(Boolean).join(", ") || "—"}`} />
      {s.summary && <p className="mb-6 max-w-3xl text-sm text-slate-600">{s.summary}</p>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {s.items.map((i) => (
            <div key={i.id} className="flex gap-3 rounded-2xl border border-[var(--ork-rule)] bg-white/90 p-4 shadow-sm">
              <Badge tone={TONE[i.kind]}>{KIND[i.kind]}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{i.title}</p>
                {i.description && <p className="text-sm text-slate-500">{i.description}</p>}
                <p className="mt-1 text-xs text-slate-400">Responsable: {i.ownerId ? userMap.get(i.ownerId) : "—"}</p>
              </div>
              {i.linkedId ? (
                <Link href={LINK[i.linkedType!]?.(i.linkedId) ?? "#"} className="self-start text-xs font-medium text-emerald-700 hover:underline">✓ {TARGET[i.kind]}</Link>
              ) : canWrite && (
                <ActionForm action={structureItem}>
                  <input type="hidden" name="itemId" value={i.id} /><input type="hidden" name="sessionId" value={s.id} />
                  <SubmitButton className={btn.small} pendingText="…">→ {TARGET[i.kind]}</SubmitButton>
                </ActionForm>
              )}
            </div>
          ))}
          {s.items.length === 0 && <p className="text-sm text-slate-400">Aún no hay registros en esta sesión.</p>}
        </div>
        {canWrite && (
          <Card title="Registrar">
            <ActionForm action={saveSonarItem} className="space-y-3">
              <input type="hidden" name="sessionId" value={s.id} />
              <Field label="Tipo"><select name="kind" className={input}>{SONAR_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></Field>
              <Field label="Título *"><input name="title" required className={input} /></Field>
              <Field label="Descripción"><textarea name="description" rows={3} className={input} /></Field>
              <Field label="Responsable"><select name="ownerId" className={input}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
              <SubmitButton className={btn.primary}>Agregar</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
