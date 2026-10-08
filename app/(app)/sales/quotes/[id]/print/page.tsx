import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { prisma } from "@/lib/core/prisma";
import { date, money, num } from "@/lib/ui/format";

export const metadata = { title: "Vista previa" };

/** Documento imprimible de la cotización con la marca de la organización. */
export default async function QuotePrint({ params }: PageProps<"/sales/quotes/[id]/print">) {
  const ctx = await requireModule("sales", "sales.quotes.read");
  const { id } = await params;
  const q = await ctx.db.quote.findUnique({ where: { id }, include: { customer: true, lines: { orderBy: { position: "asc" } } } });
  if (!q) notFound();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
  const term = q.paymentTermId ? await ctx.db.paymentTerm.findUnique({ where: { id: q.paymentTermId } }) : null;
  const brand = ctx.org.branding.primaryColor ?? "#32125e";
  return (
    <div className="mx-auto max-w-3xl bg-white p-10 text-[13px] text-stone-900 shadow-sm print:p-0 print:shadow-none">
      <div className="flex items-start justify-between border-b-4 pb-5" style={{ borderColor: brand }}>
        <div>
          <p className="font-display text-3xl uppercase tracking-tight" style={{ color: brand }}>{org.branding && (ctx.org.branding.displayName ?? org.name)}</p>
          <p className="text-stone-600">{org.legalName ?? org.name}{org.taxId ? ` · NIT ${org.taxId}` : ""}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl uppercase">Cotización</p>
          <p className="font-semibold">{q.number}</p>
          <p className="text-stone-600">Fecha {date(q.createdAt)}</p>
          {q.validUntil && <p className="text-stone-600">Válida hasta {date(q.validUntil)}</p>}
        </div>
      </div>
      <div className="my-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Cliente</p>
        <p className="text-base font-semibold">{q.customer.name}</p>
        <p className="text-stone-600">{[q.customer.taxId && `NIT ${q.customer.taxId}`, q.customer.city, q.customer.email, q.customer.phone].filter(Boolean).join(" · ")}</p>
      </div>
      <table className="w-full">
        <thead><tr className="border-b-2 border-stone-300 text-left"><th className="py-2">Descripción</th><th className="py-2 text-right">Cant.</th><th className="py-2 text-right">Precio</th><th className="py-2 text-right">Desc.</th><th className="py-2 text-right">IVA</th><th className="py-2 text-right">Subtotal</th></tr></thead>
        <tbody>
          {q.lines.map((l) => l.kind === "PRODUCT" ? (
            <tr key={l.id} className="border-b border-stone-100"><td className="py-2 pr-2">{l.description}</td><td className="py-2 text-right">{num(l.quantity)}</td><td className="py-2 text-right">{money(l.unitPrice)}</td><td className="py-2 text-right">{Number(l.discountPct) ? `${num(l.discountPct)} %` : ""}</td><td className="py-2 text-right">{num(l.taxRate)} %</td><td className="py-2 text-right">{money(l.total)}</td></tr>
          ) : <tr key={l.id}><td colSpan={6} className={`py-2 ${l.kind === "SECTION" ? "pt-4 font-semibold" : "italic text-stone-600"}`}>{l.description}</td></tr>)}
        </tbody>
      </table>
      <div className="ml-auto mt-4 w-64 space-y-1">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(q.subtotal)}</span></div>
        <div className="flex justify-between"><span>IVA</span><span>{money(q.tax)}</span></div>
        <div className="flex justify-between border-t-2 pt-1 text-base font-bold" style={{ borderColor: brand }}><span>Total</span><span>{money(q.total)}</span></div>
      </div>
      {(term || q.terms) && (
        <div className="mt-8 border-t border-stone-200 pt-4 text-stone-600">
          {term && <p><b>Plazo de pago:</b> {term.name}</p>}
          {q.terms && <p className="mt-2 whitespace-pre-wrap">{q.terms}</p>}
        </div>
      )}
      <p className="mt-10 text-center text-[11px] text-stone-400 print:fixed print:bottom-4 print:left-0 print:right-0">Documento generado con ORKEST</p>
    </div>
  );
}
