import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { graphNodes } from "@/lib/apps/graph";
import { RELATIONS } from "@/lib/apps/knowledge";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Grafo de conocimiento" };
const REL = Object.fromEntries(RELATIONS.map((r) => [r.value, r.label]));
const TONE: Record<string, string> = { USER: "violet", KNOWLEDGE: "blue", DEPARTMENT: "slate", SYSTEM: "cyan" };

/** Personas · Procesos · Conocimiento · Sistemas · Departamentos y sus dependencias. */
export default async function Graph() {
  const ctx = await requireModule("knowledge", "knowledge.read");
  const [nodes, edges, processes] = await Promise.all([
    graphNodes(ctx), ctx.db.graphEdge.findMany(),
    ctx.db.knowledgeItem.findMany({ where: { type: "PROCESS" }, orderBy: { criticality: "desc" } }),
  ]);
  const out = (key: string) => edges.filter((e) => `${e.fromType}:${e.fromId}` === key);
  const into = (key: string) => edges.filter((e) => `${e.toType}:${e.toId}` === key);
  const node = (type: string, id: string) => {
    const n = nodes.get(`${type}:${id}`);
    const label = n?.label ?? id;
    return <Badge tone={TONE[type]}>{type === "KNOWLEDGE" ? <Link href={`/knowledge/${id}`}>{label}</Link> : label}</Badge>;
  };

  return (
    <>
      <PageHeader title="Grafo de conocimiento" subtitle="Proceso → depende de → conocimiento → en manos de → persona. Radar usa este grafo para detectar dependencias críticas." crumbs={[{ label: "Conocimiento", href: "/knowledge" }, { label: "Grafo" }]} />
      <div className="space-y-4">
        {processes.map((p) => {
          const key = `KNOWLEDGE:${p.id}`;
          return (
            <Card key={p.id} title={<span className="flex items-center gap-2">{p.title} <Badge tone={p.criticality === "CRITICAL" ? "rose" : "amber"}>{p.criticality}</Badge></span>}>
              <ul className="space-y-3 text-sm">
                {out(key).map((e) => (
                  <li key={e.id}>
                    <div className="flex flex-wrap items-center gap-2"><span className="text-slate-500">{REL[e.relation]}</span>{node(e.toType, e.toId)}</div>
                    {e.toType === "KNOWLEDGE" && (
                      <ul className="ml-6 mt-1.5 space-y-1 border-l border-slate-200 pl-4">
                        {into(`KNOWLEDGE:${e.toId}`).filter((x) => x.fromType === "USER").map((x) => (
                          <li key={x.id} className="flex flex-wrap items-center gap-2">{node("USER", x.fromId)}<span className="text-slate-500">{REL[x.relation]}</span></li>
                        ))}
                        {out(`KNOWLEDGE:${e.toId}`).map((x) => (
                          <li key={x.id} className="flex flex-wrap items-center gap-2"><span className="text-slate-500">{REL[x.relation]}</span>{node(x.toType, x.toId)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
                {out(key).length === 0 && <li className="text-slate-400">Sin dependencias registradas.</li>}
              </ul>
            </Card>
          );
        })}
        <Card title={`Todas las relaciones (${edges.length})`} padded={false}>
          <ul className="divide-y divide-slate-100 text-sm">
            {edges.map((e) => <li key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-2">{node(e.fromType, e.fromId)}<span className="text-xs text-slate-500">{REL[e.relation] ?? e.relation}</span>{node(e.toType, e.toId)}</li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
