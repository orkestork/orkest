import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { prisma } from "@/lib/core/prisma";
import { date, money, num } from "@/lib/ui/format";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Factura · impresión" };

/** Documento imprimible / PDF de la factura o nota crédito, con la marca de la organización. */
export default async function InvoicePrint({ params }: PageProps<"/invoicing/[id]/print">) {
  const ctx = await requireModule("invoicing", "invoicing.read");
  const { id } = await params;
  const inv = await ctx.db.invoice.findUnique({ where: { id }, include: { customer: true, lines: true } });
  if (!inv) notFound();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
  const term = inv.paymentTermId ? await ctx.db.paymentTerm.findUnique({ where: { id: inv.paymentTermId } }) : null;
  const brand = ctx.org.branding.primaryColor ?? "#5b21b6";
  const refund = inv.type === "OUT_REFUND";
  const paid = Number(inv.total) - Number(inv.balance);
  const byRate = new Map<number, number>();
  for (const l of inv.lines) byRate.set(Number(l.taxRate), (byRate.get(Number(l.taxRate)) ?? 0) + Number(l.subtotal) * Number(l.taxRate) / 100);

  return (
    <div className="min-h-screen bg-stone-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl justify-end gap-2 print:hidden"><PrintButton /></div>
      <div className="mx-auto max-w-3xl bg-white p-10 text-[13px] text-stone-900 shadow-sm print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b-4 pb-5" style={{ borderColor: brand }}>
          <div>
            <p className="font-display text-2xl font-bold" style={{ color: brand }}>{ctx.org.branding.displayName ?? org.name}</p>
            <p className="text-stone-600">{org.legalName ?? org.name}{org.taxId ? ` · NIT ${org.taxId}` : ""}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-bold">{refund ? "Nota crédito" : "Factura de venta"}</p>
            <p className="font-semibold">{inv.number}</p>
            <p className="text-stone-600">Emitida {date(inv.issuedAt)}</p>
            {!refund && <p className="text-stone-600">Vence {date(inv.dueDate)}</p>}
          </div>
        </div>
        <div className="my-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Cliente</p>
            <p className="text-base font-semibold">{inv.customer.name}</p>
            <p className="text-stone-600">{[inv.customer.taxId && `NIT ${inv.customer.taxId}`, inv.customer.city, inv.customer.email, inv.customer.phone].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            {term && <p><span className="text-stone-500">Plazo de pago:</span> {term.name}</p>}
            <p><span className="text-stone-500">Estado:</span> {inv.status === "paid" ? "Pagada" : inv.status === "void" ? "Anulada" : "Pendiente de pago"}</p>
          </div>
        </div>
        <table className="w-full">
          <thead><tr className="border-b-2 border-stone-300 text-left"><th className="py-2">Descripción</th><th className="py-2 text-right">Cant.</th><th className="py-2 text-right">Precio</th><th className="py-2 text-right">IVA</th><th className="py-2 text-right">Subtotal</th></tr></thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id} className="border-b border-stone-100"><td className="py-2 pr-2">{l.description}</td><td className="py-2 text-right">{num(l.quantity)}</td><td className="py-2 text-right">{money(l.unitPrice)}</td><td className="py-2 text-right">{num(l.taxRate)} %</td><td className="py-2 text-right">{money(l.subtotal)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-4 w-72 space-y-1">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(inv.subtotal)}</span></div>
          {[...byRate.entries()].filter(([r]) => r > 0).map(([r, v]) => <div key={r} className="flex justify-between"><span>IVA {num(r)} %</span><span>{money(v)}</span></div>)}
          <div className="flex justify-between border-t-2 pt-1 text-base font-bold" style={{ borderColor: brand }}><span>Total</span><span>{money(inv.total)}</span></div>
          {!refund && paid > 0 && <div className="flex justify-between text-stone-600"><span>Pagado</span><span>{money(paid)}</span></div>}
          {!refund && <div className="flex justify-between font-semibold"><span>Saldo</span><span>{money(inv.balance)}</span></div>}
        </div>
        <p className="mt-10 border-t border-stone-200 pt-3 text-center text-[11px] text-stone-500">
          Representación de documento interno generado con Workezt. No reemplaza la factura electrónica de venta validada por la DIAN.
        </p>
      </div>
    </div>
  );
}
