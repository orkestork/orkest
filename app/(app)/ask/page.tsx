import Link from "@/components/plink";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/core/context";
import { ask, availableTools } from "@/lib/intelligence/tools";
import { btn, Card, PageHeader, Table, td } from "@/components/ui";

export const metadata = { title: "Ask ORKEST" };

const EXAMPLES = ["¿Cuánto vendimos este mes?", "¿Qué productos tienen riesgo de agotarse?", "¿Qué oportunidades necesitan seguimiento?", "¿Cuál proveedor tiene más no conformidades?", "¿Cuánto tenemos en cartera vencida?"];

export default async function Ask({ searchParams }: PageProps<"/ask">) {
  const ctx = await requirePermission("intelligence.ask");
  if (!ctx.flags.has("intelligence.ask")) notFound();
  const { q } = await searchParams;
  const question = typeof q === "string" ? q.trim() : "";
  const result = question ? await ask(ctx, question) : null;
  const tools = availableTools(ctx);

  return (
    <>
      <PageHeader title="Ask ORKEST" subtitle={`Responde solo con datos de ${ctx.org.name} que tu rol puede ver. Herramientas disponibles para ti: ${tools.length}.`} />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={question} placeholder="Pregunta algo sobre tu empresa…" className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-[var(--brand)]" autoFocus />
        <button className={btn.primary}>Preguntar</button>
      </form>
      <div className="mb-6 flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => <Link key={e} href={`/ask?q=${encodeURIComponent(e)}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-slate-400">{e}</Link>)}
      </div>
      {result && (
        <Card title={result.tool ? `Respuesta · herramienta ${result.tool}` : "Respuesta"}>
          <p className="text-base text-slate-800">{result.answer}</p>
          {result.table && result.table.rows.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200">
              <Table head={result.table.columns}>
                {result.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={td}>{c}</td>)}</tr>)}
              </Table>
            </div>
          )}
          {result.links && <div className="mt-4 flex gap-2">{result.links.map((l) => <Link key={l.href} href={l.href} className={btn.secondary}>{l.label}</Link>)}</div>}
        </Card>
      )}
    </>
  );
}
