import Link from "next/link";

export default async function Forbidden({ searchParams }: PageProps<"/forbidden">) {
  const { p } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="text-sm font-medium text-rose-600">Acceso restringido</p>
        <h1 className="mt-2 text-2xl font-semibold">No tienes permiso para ver esta sección</h1>
        {p && <p className="mt-2 text-sm text-slate-500">Permiso requerido: <code className="rounded bg-slate-100 px-1">{String(p)}</code></p>}
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-slate-900 underline">Volver al inicio</Link>
      </div>
    </main>
  );
}
