import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { orgUsers } from "@/lib/core/members";
import { stateLabel } from "@/components/workflow-bar";
import { Badge, btn, Card, PageHeader, Table, td } from "@/components/ui";
import { date } from "@/lib/ui/format";

export const metadata = { title: "Requisiciones" };

export default async function Requisitions() {
  const ctx = await requireModule("purchasing", "purchasing.requisitions.read");
  const [rows, users] = await Promise.all([ctx.db.requisition.findMany({ include: { lines: true }, orderBy: { createdAt: "desc" }, take: 200 }), orgUsers(ctx)]);
  const label = await stateLabel(ctx, "requisition");
  const umap = new Map(users.map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Requisiciones" subtitle="Cualquier área solicita lo que necesita; compras aprueba y la convierte en solicitud de cotización."
        actions={ctx.can("purchasing.requisitions.write") && <Link href="/purchasing/requisitions/new" className={btn.primary}>Nueva requisición</Link>} />
      <Card padded={false}>
        <Table head={["Número", "Solicitante", "Área", "Productos", "Necesaria para", "Estado"]} empty={rows.length === 0}>
          {rows.map((r) => { const s = label(r.status); return (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className={td}><Link href={`/purchasing/requisitions/${r.id}`} className="font-medium hover:underline">{r.number}</Link></td>
              <td className={td}>{umap.get(r.requesterId) ?? "—"}</td>
              <td className={td}>{r.area ?? "—"}</td>
              <td className={`${td} text-xs`}>{r.lines.map((l) => l.description).join(", ")}</td>
              <td className={td}>{date(r.neededBy)}</td>
              <td className={td}><Badge tone={s.color}>{s.label}</Badge></td>
            </tr>
          ); })}
        </Table>
      </Card>
    </>
  );
}
