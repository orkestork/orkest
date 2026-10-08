import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { getFieldDefs, formatFieldValue } from "@/lib/core/custom-fields";
import { btn, Card, PageHeader, Table, td } from "@/components/ui";

export const metadata = { title: "Clientes" };

export default async function Customers({ searchParams }: PageProps<"/crm/customers">) {
  const ctx = await requireModule("crm", "crm.customers.read");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const [customers, defs] = await Promise.all([
    ctx.db.customer.findMany({
      where: query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { taxId: { contains: query } }, { city: { contains: query, mode: "insensitive" } }] } : {},
      orderBy: { name: "asc" }, take: 200,
      include: { _count: { select: { quotes: true, opportunities: true } } },
    }),
    getFieldDefs(ctx.db, "customer"),
  ]);
  const cols = defs.slice(0, 3);
  return (
    <>
      <PageHeader title="Clientes" subtitle={`${customers.length} registros`} actions={
        <>
          {ctx.can("import.run") && <Link href="/import?entity=customer" className={btn.secondary}>Importar</Link>}
          {ctx.can("crm.customers.write") && <Link href="/crm/customers/new" className={btn.primary}>Nuevo cliente</Link>}
        </>
      } />
      <form className="mb-4"><input name="q" defaultValue={query} placeholder="Filtrar por nombre, NIT o ciudad…" className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></form>
      <Card padded={false}>
        <Table head={["Cliente", "NIT", "Ciudad", ...cols.map((c) => c.label), "Oport.", "Cotiz."]} empty={customers.length === 0}>
          {customers.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <td className={td}><Link href={`/crm/customers/${c.id}`} className="font-medium text-slate-900 hover:underline">{c.name}</Link><p className="text-xs text-slate-400">{c.email}</p></td>
              <td className={td}>{c.taxId ?? "—"}</td>
              <td className={td}>{c.city ?? "—"}</td>
              {cols.map((d) => <td key={d.id} className={td}>{formatFieldValue(d, (c.customFields as Record<string, unknown>)[d.key])}</td>)}
              <td className={td}>{c._count.opportunities}</td>
              <td className={td}>{c._count.quotes}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
