import Link from "@/components/plink";
import { canSeeOwned } from "@/lib/core/scope";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { plain } from "@/lib/core/entities";
import { availableTransitions, getWorkflow } from "@/lib/core/workflow";
import { orgUsers } from "@/lib/core/members";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CustomFieldInputs, CustomFieldValues } from "@/components/custom-fields";
import { RecordTopBar, StatusChevrons, type SmartButton } from "@/components/record/top-bar";
import { Chatter } from "@/components/record/chatter";
import { Tabs } from "@/components/record/tabs";
import { StatusPill } from "@/components/list/status-pill";
import { transitionAction } from "../../../entity-actions";
import { saveQuote } from "../../actions";
import { QuoteEditor, type EditorLine } from "../quote-editor";
import { date, money, num } from "@/lib/ui/format";

const n = (v: unknown) => Number(v ?? 0);
const iso = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function QuoteDetail({ params }: PageProps<"/sales/quotes/[id]">) {
  const ctx = await requireModule("sales", "sales.quotes.read");
  const { id } = await params;
  const q = await ctx.db.quote.findUnique({ where: { id }, include: { customer: true, lines: { orderBy: { position: "asc" } } } });
  if (!q || !canSeeOwned(ctx, "sales", q.ownerId)) notFound();

  const [wf, { transitions }, users, defs, approvals, so, order, products, terms, pricelists] = await Promise.all([
    getWorkflow(ctx.db, "quote"), availableTransitions(ctx, "quote", plain(q)), orgUsers(ctx), getFieldDefs(ctx.db, "quote"),
    ctx.db.approval.findMany({ where: { entityType: "quote", entityId: id }, orderBy: { createdAt: "desc" } }),
    ctx.db.salesOrder.findFirst({ where: { quoteId: id }, include: { lines: true } }),
    ctx.db.quote.findMany({ select: { id: true }, orderBy: { createdAt: "desc" } }),
    ctx.db.product.findMany({ where: { active: true, canBeSold: true }, orderBy: { name: "asc" } }),
    ctx.db.paymentTerm.findMany({ select: { id: true, name: true } }),
    ctx.db.pricelist.findMany({ select: { id: true, name: true } }),
  ]);
  const [deliveries, invoices] = so ? await Promise.all([
    ctx.db.transfer.count({ where: { sourceType: "sales_order", sourceId: so.id } }),
    ctx.db.invoice.findMany({ where: { salesOrderId: so.id }, select: { id: true, total: true } }),
  ]) : [0, []];

  const um = new Map(users.map((u) => [u.id, u.name]));
  const state = wf?.states.find((s) => s.key === q.status);
  const editable = ["draft", "sent"].includes(q.status) && ctx.can("sales.quotes.write");
  const idx = order.findIndex((o) => o.id === id);
  const cost = new Map(ctx.restricted("deny:costs") ? [] : products.map((p) => [p.id, n(p.cost)]));
  const margin = n(q.subtotal) - q.lines.reduce((s, l) => s + n(l.quantity) * (cost.get(l.productId ?? "") ?? 0), 0);
  const soLine = (productId: string | null) => so?.lines.find((l) => l.productId === productId);

  const smart: SmartButton[] = [];
  if (so) smart.push({ label: "Pedido", value: so.number, href: `/sales/orders/${so.id}`, icon: "🧾" });
  if (so && deliveries) smart.push({ label: "Entregas", value: deliveries, href: `/inventory/transfers?q=${so.number}`, icon: "🚚" });
  if (invoices.length) smart.push({ label: "Facturado", value: money(invoices.reduce((s, i) => s + n(i.total), 0)), href: `/invoicing?q=${so?.number ?? ""}`, icon: "💳" });

  const readOnlyLines = (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-xl border border-stone-200">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-stone-50 text-left text-[13px] font-semibold text-stone-800">
            <tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Cantidad</th>{so && <th className="px-3 py-2 text-right">Entregado</th>}{so && <th className="px-3 py-2 text-right">Facturado</th>}<th className="px-3 py-2 text-right">Precio unit.</th><th className="px-3 py-2 text-right">Desc.</th><th className="px-3 py-2 text-right">IVA</th><th className="px-3 py-2 text-right">Subtotal</th></tr>
          </thead>
          <tbody>
            {q.lines.map((l) => l.kind === "PRODUCT" ? (
              <tr key={l.id} className="border-t border-stone-100">
                <td className="px-3 py-2 font-medium text-[var(--ork-purple)]">{l.description}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(l.quantity)}</td>
                {so && <td className="px-3 py-2 text-right tabular-nums">{num(soLine(l.productId)?.deliveredQty)}</td>}
                {so && <td className="px-3 py-2 text-right tabular-nums">{num(soLine(l.productId)?.invoicedQty)}</td>}
                <td className="px-3 py-2 text-right tabular-nums">{money(l.unitPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(l.discountPct) ? `${num(l.discountPct)} %` : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(l.taxRate)} %</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{money(l.total)}</td>
              </tr>
            ) : (
              <tr key={l.id} className={`border-t border-stone-100 ${l.kind === "SECTION" ? "bg-stone-100 font-semibold" : "italic text-stone-700"}`}><td colSpan={so ? 8 : 6} className="px-3 py-2">{l.description}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <p className="whitespace-pre-wrap text-sm text-stone-600">{q.terms || <span className="text-stone-400">Sin términos y condiciones.</span>}</p>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-stone-600">Subtotal</dt><dd className="tabular-nums">{money(q.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-stone-600">Impuestos</dt><dd className="tabular-nums">{money(q.tax)}</dd></div>
          <div className="flex items-baseline justify-between border-t border-stone-200 pt-2"><dt className="font-semibold">Total</dt><dd className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--ork-ink)]">{money(q.total)}</dd></div>
          {!ctx.restricted("deny:costs") && <div className="flex justify-between pt-2 text-stone-600"><dt>Margen</dt><dd className="tabular-nums">{money(margin)} ({n(q.subtotal) ? Math.round((margin / n(q.subtotal)) * 100) : 0} %)</dd></div>}
        </dl>
      </div>
    </div>
  );

  const editor = (
    <QuoteEditor showMargin={!ctx.restricted("deny:costs")} key={q.updatedAt.toISOString()} action={saveQuote}
      initial={{ id: q.id, customerId: q.customerId, validUntil: iso(q.validUntil), paymentTermId: q.paymentTermId ?? "", pricelistId: q.pricelistId ?? "", terms: q.terms ?? "", notes: q.notes ?? "",
        lines: q.lines.map((l): EditorLine => ({ kind: l.kind as EditorLine["kind"], productId: l.productId ?? "", description: l.description, quantity: n(l.quantity), unitPrice: n(l.unitPrice), discountPct: n(l.discountPct), taxRate: n(l.taxRate) })) }}
      products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, price: n(p.price), cost: ctx.restricted("deny:costs") ? 0 : n(p.cost), taxRate: n(p.taxRate), unit: p.unit }))}
      extra={defs.length > 0 && <CustomFieldInputs defs={defs} values={q.customFields as Record<string, unknown>} legend="Despacho y facturación" wide />}
      customer={{ id: q.customer.id, name: q.customer.name }} canCreateCustomer={ctx.can("crm.customers.write")} terms={terms} pricelists={pricelists} />
  );

  return (
    <>
      <RecordTopBar listLabel="Cotizaciones" listHref="/sales/quotes" title={q.number} newHref={ctx.can("sales.quotes.write") ? "/sales/quotes/new" : undefined} smart={smart}
        pager={{ index: idx + 1, total: order.length, prevHref: idx > 0 ? `/sales/quotes/${order[idx - 1].id}` : undefined, nextHref: idx < order.length - 1 ? `/sales/quotes/${order[idx + 1].id}` : undefined }} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {/* Barra de acciones + estado */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--ork-rule)] bg-white/80 p-2">
            <div className="flex flex-wrap gap-1.5">
              {transitions.map((t, i) => (
                <ActionForm key={t.id} action={transitionAction}>
                  <input type="hidden" name="entityType" value="quote" /><input type="hidden" name="entityId" value={q.id} /><input type="hidden" name="transitionId" value={t.id} />
                  <SubmitButton pendingText="…" className={`rounded-lg px-3 py-1.5 text-sm font-medium ${i === 0 && !["rejected", "lost"].includes(t.toKey) ? "bg-[var(--ork-purple)] text-white hover:bg-[var(--ork-violet)]" : "bg-stone-200/70 text-stone-800 hover:bg-stone-200"}`}>
                    {t.label}{t.requiresApproval ? " · requiere aprobación" : ""}
                  </SubmitButton>
                </ActionForm>
              ))}
              <Link href={`/sales/quotes/${q.id}/print`} target="_blank" className="rounded-lg bg-stone-200/70 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-200">Vista previa</Link>
            </div>
            {wf && <StatusChevrons states={wf.states} current={q.status} />}
          </div>

          {/* Hoja */}
          <div className="rounded-2xl border border-[var(--ork-rule)] bg-white p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-4xl uppercase leading-none tracking-tight">{q.number}</h1>
                <p className="mt-2 text-sm"><Link href={`/crm/customers/${q.customerId}`} className="font-medium text-[var(--ork-violet)] hover:underline">{q.customer.name}</Link>
                  <span className="block text-stone-600">{[q.customer.taxId && `NIT ${q.customer.taxId}`, q.customer.city, q.customer.email].filter(Boolean).join(" · ")}</span></p>
              </div>
              <div className="text-right text-sm">
                <StatusPill label={state?.label ?? q.status} tone={state?.color} />
                <p className="mt-2 text-stone-600">Creada {date(q.createdAt)} · {um.get(q.ownerId ?? "") ?? "—"}</p>
                {q.validUntil && <p className={q.validUntil < new Date() && editable ? "font-semibold text-rose-700" : "text-stone-600"}>Válida hasta {date(q.validUntil)}</p>}
              </div>
            </div>

            <Tabs tabs={[
              { key: "lines", label: "Líneas de la cotización", content: editable ? editor : readOnlyLines },
              { key: "other", label: "Otra información", content: (
                <div className="grid gap-6 md:grid-cols-2">
                  <dl className="space-y-2 text-sm">
                    {[["Vendedor", um.get(q.ownerId ?? "") ?? "—"], ["Plazo de pago", terms.find((t) => t.id === q.paymentTermId)?.name ?? "—"], ["Lista de precios", pricelists.find((p) => p.id === q.pricelistId)?.name ?? "Precio base"], ["Moneda", q.currency]].map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[140px_1fr]"><dt className="font-semibold text-stone-800">{k}</dt><dd className="text-stone-700">{v}</dd></div>
                    ))}
                  </dl>
                  <div className="space-y-4">
                    {defs.length > 0 && <CustomFieldValues defs={defs} values={q.customFields as Record<string, unknown>} users={um} />}
                    {approvals.length > 0 && (
                      <div><p className="mb-1 text-sm font-semibold">Aprobaciones</p>
                        {approvals.map((a) => <p key={a.id} className="text-sm text-stone-700">{a.reason} · <b>{a.status === "APPROVED" ? "Aprobada" : a.status === "REJECTED" ? "Rechazada" : "Pendiente"}</b>{a.decidedById ? ` por ${um.get(a.decidedById)}` : ""}</p>)}
                      </div>
                    )}
                  </div>
                </div>
              ) },
            ]} />
          </div>
        </div>

        <div className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pr-1">
          <Chatter ctx={ctx} entityType="quote" entityId={q.id} canWrite={ctx.can("sales.quotes.write")} />
        </div>
      </div>
    </>
  );
}
