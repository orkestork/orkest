import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { orgUsers } from "@/lib/core/members";
import { KNOWLEDGE_TYPES } from "@/lib/apps/knowledge";
import { Badge, btn, Card, PageHeader, SEVERITY_LABEL, SEVERITY_TONE, Table, td } from "@/components/ui";
import { date } from "@/lib/ui/format";

export const metadata = { title: "Conocimiento" };
const TYPE = Object.fromEntries(KNOWLEDGE_TYPES.map((t) => [t.value, t.label]));

export default async function Knowledge({ searchParams }: PageProps<"/knowledge">) {
  const ctx = await requireModule("knowledge", "knowledge.read");
  const { type } = await searchParams;
  const [items, users] = await Promise.all([
    ctx.db.knowledgeItem.findMany({ where: typeof type === "string" ? { type } : {}, orderBy: { updatedAt: "desc" } }),
    orgUsers(ctx),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Base de conocimiento" subtitle="Artículos, procedimientos, procesos, políticas y manuales con versiones, dueños y aprobaciones."
        actions={<>
          <Link href="/knowledge/graph" className={btn.secondary}>Grafo</Link>
          {ctx.can("knowledge.write") && <Link href="/knowledge/new" className={btn.primary}>Nuevo</Link>}
        </>} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/knowledge" className={btn.small}>Todo</Link>
        {KNOWLEDGE_TYPES.map((t) => <Link key={t.value} href={`/knowledge?type=${t.value}`} className={btn.small}>{t.label}</Link>)}
      </div>
      <Card padded={false}>
        <Table head={["Título", "Tipo", "Dueño", "Criticidad", "Estado", "Versión", "Actualizado"]} empty={items.length === 0}>
          {items.map((k) => (
            <tr key={k.id} className="hover:bg-slate-50">
              <td className={td}><Link href={`/knowledge/${k.id}`} className="font-medium hover:underline">{k.title}</Link></td>
              <td className={td}>{TYPE[k.type]}</td>
              <td className={td}>{k.ownerId ? userMap.get(k.ownerId) : <span className="text-rose-600">Sin dueño</span>}</td>
              <td className={td}><Badge tone={SEVERITY_TONE[k.criticality]}>{SEVERITY_LABEL[k.criticality]}</Badge></td>
              <td className={td}><Badge tone={k.status === "published" ? "emerald" : "slate"}>{k.status === "published" ? "Publicado" : "Borrador"}</Badge></td>
              <td className={td}>v{k.version}</td>
              <td className={td}>{date(k.updatedAt)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
