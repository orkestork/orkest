import Link from "@/components/plink";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { orgUsers } from "@/lib/core/members";
import { graphNodes } from "@/lib/apps/graph";
import { KNOWLEDGE_TYPES, RELATIONS } from "@/lib/apps/knowledge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, SEVERITY_LABEL, SEVERITY_TONE } from "@/components/ui";
import { dateTime } from "@/lib/ui/format";
import { addRelation, approveKnowledge, saveKnowledge } from "../actions";

const REL = Object.fromEntries(RELATIONS.map((r) => [r.value, r.label]));

export default async function KnowledgeDetail({ params }: PageProps<"/knowledge/[id]">) {
  const ctx = await requireModule("knowledge", "knowledge.read");
  const { id } = await params;
  const k = await ctx.db.knowledgeItem.findUnique({ where: { id }, include: { versions: { orderBy: { version: "desc" } } } });
  if (!k) notFound();
  const [users, nodes, edges, insights] = await Promise.all([
    orgUsers(ctx), graphNodes(ctx),
    ctx.db.graphEdge.findMany({ where: { OR: [{ fromType: "KNOWLEDGE", fromId: id }, { toType: "KNOWLEDGE", toId: id }] } }),
    ctx.hasModule("radar") && ctx.can("radar.read") ? ctx.db.insight.findMany({ where: { entityType: "knowledge", entityId: id, status: "OPEN" } }) : [],
  ]);
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const self = `KNOWLEDGE:${id}`;
  const canWrite = ctx.can("knowledge.write");

  return (
    <>
      <PageHeader title={k.title} crumbs={[{ label: "Conocimiento", href: "/knowledge" }, { label: k.title }]}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          {KNOWLEDGE_TYPES.find((t) => t.value === k.type)?.label} · v{k.version} · dueño {k.ownerId ? userMap.get(k.ownerId) : "—"}
          <Badge tone={SEVERITY_TONE[k.criticality]}>Criticidad {SEVERITY_LABEL[k.criticality]}</Badge>
          <Badge tone={k.status === "published" ? "emerald" : "slate"}>{k.status === "published" ? `Publicado por ${userMap.get(k.approvedById ?? "") ?? ""}` : "Borrador"}</Badge>
        </span>}
        actions={k.status !== "published" && ctx.can("knowledge.approve") && (
          <ActionForm action={approveKnowledge}><input type="hidden" name="id" value={k.id} /><SubmitButton className={btn.primary}>Aprobar y publicar</SubmitButton></ActionForm>
        )} />
      {insights.length > 0 && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {insights.map((i) => <p key={i.id}><b>Radar:</b> {i.title}. {i.detail} → {i.recommendedAction}</p>)}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Contenido">
            {canWrite ? (
              <ActionForm action={saveKnowledge} className="space-y-3">
                <input type="hidden" name="id" value={k.id} />
                <input name="title" defaultValue={k.title} className={input} aria-label="Título" />
                <textarea name="body" defaultValue={k.body} rows={14} className={`${input} font-mono`} aria-label="Contenido" />
                <SubmitButton className={btn.secondary}>Guardar nueva versión</SubmitButton>
              </ActionForm>
            ) : <pre className="whitespace-pre-wrap text-sm">{k.body}</pre>}
          </Card>
          <Card title="Historial de versiones" padded={false}>
            <ul className="divide-y divide-slate-100 text-sm">
              {k.versions.map((v) => <li key={v.id} className="flex justify-between px-5 py-2"><span>v{v.version} · {v.title}</span><span className="text-xs text-slate-400">{v.createdById ? userMap.get(v.createdById) : ""} · {dateTime(v.createdAt)}</span></li>)}
            </ul>
          </Card>
        </div>
        <Card title="Relaciones (grafo)">
          <ul className="mb-4 space-y-2 text-sm">
            {edges.map((e) => {
              const from = nodes.get(`${e.fromType}:${e.fromId}`), to = nodes.get(`${e.toType}:${e.toId}`);
              return (
                <li key={e.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className={`${e.fromType}:${e.fromId}` === self ? "font-medium" : ""}>{from?.label ?? e.fromType}</span>
                  <span className="mx-1 text-xs text-slate-500">{REL[e.relation] ?? e.relation}</span>
                  {e.toType === "KNOWLEDGE" && e.toId !== id ? <Link href={`/knowledge/${e.toId}`} className="hover:underline">{to?.label}</Link> : <span className={`${e.toType}:${e.toId}` === self ? "font-medium" : ""}>{to?.label ?? e.toType}</span>}
                </li>
              );
            })}
            {edges.length === 0 && <li className="text-slate-400">Sin relaciones.</li>}
          </ul>
          {canWrite && (
            <ActionForm action={addRelation} className="space-y-2 border-t border-slate-100 pt-3">
              <input type="hidden" name="id" value={k.id} />
              <Field label="Origen"><select name="source" defaultValue={self} className={input}>{[...nodes.entries()].map(([key, n]) => <option key={key} value={key}>{n.sub}: {n.label}</option>)}</select></Field>
              <Field label="Relación"><select name="relation" className={input}>{RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Field>
              <Field label="Destino"><select name="target" className={input}>{[...nodes.entries()].map(([key, n]) => <option key={key} value={key}>{n.sub}: {n.label}</option>)}</select></Field>
              <SubmitButton className={btn.secondary}>Agregar relación</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
