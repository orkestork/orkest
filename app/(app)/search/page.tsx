import Link from "@/components/plink";
import { requireContext } from "@/lib/core/context";
import { ENTITIES } from "@/lib/core/entities";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Búsqueda" };

/** Búsqueda global: solo entidades de apps activas y con permiso de lectura. */
export default async function Search({ searchParams }: PageProps<"/search">) {
  const ctx = await requireContext();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const searchable = Object.values(ENTITIES).filter((e) => e.search && ctx.hasModule(e.module) && ctx.can(e.readPermission));
  const results = query.length >= 2 ? await Promise.all(searchable.map(async (e) => ({ e, hits: await e.search!(ctx.db, query) }))) : [];
  const total = results.reduce((s, r) => s + r.hits.length, 0);
  return (
    <>
      <PageHeader title={query ? `Resultados para “${query}”` : "Búsqueda"} subtitle={query ? `${total} resultados en ${searchable.length} tipos de registro` : "Escribe al menos 2 caracteres en la barra superior."} />
      <div className="space-y-4">
        {results.filter((r) => r.hits.length).map(({ e, hits }) => (
          <Card key={e.type} title={e.labelPlural} padded={false}>
            <ul className="divide-y divide-slate-100">
              {hits.map((h) => <li key={h.id}><Link href={e.path(h.id)} className="block px-5 py-2.5 hover:bg-slate-50"><p className="text-sm font-medium">{h.title}</p>{h.subtitle && <p className="text-xs text-slate-500">{h.subtitle}</p>}</Link></li>)}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
