import Link from "@/components/plink";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { qtyAt } from "@/lib/apps/stock";
import { ENTITIES } from "@/lib/core/entities";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, PageHeader, Table, td } from "@/components/ui";
import { dateTime, num } from "@/lib/ui/format";
import { OP_KIND, TRANSFER_STATUS } from "@/lib/ui/stock-labels";
import { transferAction, validateTransferAction } from "../../actions";

const SOURCE: Record<string, string> = { purchase_order: "purchase_order", sales_order: "sales_order", production: "production" };

export default async function TransferDetail({ params }: PageProps<"/inventory/transfers/[id]">) {
  const ctx = await requireModule("inventory", "inventory.read");
  const { id } = await params;
  const t = await ctx.db.transfer.findUnique({ where: { id }, include: { lines: true, operationType: { include: { warehouse: true } } } });
  if (!t) notFound();
  const [src, dest, products, backorders] = await Promise.all([
    ctx.db.location.findUniqueOrThrow({ where: { id: t.srcLocationId } }),
    ctx.db.location.findUniqueOrThrow({ where: { id: t.destLocationId } }),
    ctx.db.product.findMany({ where: { id: { in: t.lines.map((l) => l.productId) } } }),
    t.sourceId ? ctx.db.transfer.findMany({ where: { sourceType: t.sourceType, sourceId: t.sourceId, id: { not: t.id } }, orderBy: { createdAt: "asc" } }) : [],
  ]);
  const pmap = new Map(products.map((p) => [p.id, p]));
  const avail = new Map(await Promise.all(t.lines.map(async (l) => [l.id, src.kind === "INTERNAL" ? await qtyAt(ctx, l.productId, src.id) : null] as const)));
  const open = !["done", "canceled"].includes(t.status);
  const canWrite = ctx.can("inventory.write");
  const sourceEntity = t.sourceType && SOURCE[t.sourceType] ? ENTITIES[SOURCE[t.sourceType]] : null;

  return (
    <>
      <PageHeader title={t.number} crumbs={[{ label: "Transferencias", href: "/inventory/transfers" }, { label: t.number }]}
        subtitle={<span className="flex flex-wrap items-center gap-2">{OP_KIND[t.operationType.kind]} · {t.operationType.warehouse.name} <Badge tone={TRANSFER_STATUS[t.status].tone}>{TRANSFER_STATUS[t.status].label}</Badge></span>}
        actions={open && canWrite && (
          <>
            <form action={transferAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="op" value="check" /><button className={btn.secondary}>Comprobar disponibilidad</button></form>
            <form action={transferAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="op" value="cancel" /><button className={btn.danger}>Cancelar</button></form>
          </>
        )} />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[["Desde", src.name], ["Hacia", dest.name], ["Origen", t.origin ?? "—"], [t.doneAt ? "Validada" : "Programada", dateTime(t.doneAt ?? t.scheduledAt)]].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-[var(--ork-rule)] bg-white/90 p-4"><p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{k}</p><p className="mt-1 text-sm font-medium">{v}</p></div>
        ))}
      </div>
      {sourceEntity && t.sourceId && <p className="mb-4 text-sm">Documento: <Link className="font-medium text-[var(--ork-violet)] underline" href={sourceEntity.path(t.sourceId)}>{sourceEntity.label} {t.origin}</Link>{t.partnerName ? ` · ${t.partnerName}` : ""}</p>}
      <Card title="Productos" padded={false}>
        <ActionForm action={validateTransferAction}>
          <input type="hidden" name="id" value={t.id} />
          <Table head={["Producto", "Demanda", ...(src.kind === "INTERNAL" && open ? ["Disponible en origen"] : []), open ? "Cantidad a mover" : "Hecho"]}>
            {t.lines.map((l) => {
              const p = pmap.get(l.productId);
              const a = avail.get(l.id);
              const pending = Number(l.quantity) - Number(l.doneQty);
              return (
                <tr key={l.id}>
                  <td className={td}><p className="font-medium">{p?.name}</p><p className="text-xs text-slate-400">{p?.sku}{l.description && l.description !== p?.name ? ` · ${l.description}` : ""}</p></td>
                  <td className={td}>{num(l.quantity)} {p?.unit}</td>
                  {src.kind === "INTERNAL" && open && <td className={`${td} ${a !== null && a! < pending ? "font-semibold text-[var(--ork-pink)]" : ""}`}>{num(a)}</td>}
                  <td className={td}>{open ? (() => {
                    // Propone lo que realmente se puede mover: mín(pendiente, disponible en origen)
                    const proposal = a === null || a === undefined ? pending : Math.max(0, Math.min(pending, a));
                    return (
                      <span className="flex items-center gap-2">
                        <input name={`done_${l.id}`} type="number" step="any" min="0" max={pending} defaultValue={proposal} className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm" aria-label="Cantidad a mover" />
                        {proposal < pending && <span className="text-xs text-amber-800">{proposal === 0 ? "sin existencia" : `faltan ${num(pending - proposal)}`}</span>}
                      </span>
                    );
                  })() : num(l.doneQty)}</td>
                </tr>
              );
            })}
          </Table>
          {open && canWrite && (
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 p-4">
              <p className="text-xs text-slate-500">Si mueves menos de lo pedido, lo pendiente queda en una nueva transferencia (backorder).</p>
              <SubmitButton className={btn.primary} pendingText="Validando…">Validar</SubmitButton>
            </div>
          )}
        </ActionForm>
      </Card>
      {backorders.length > 0 && (
        <Card title="Otras transferencias del mismo documento" className="mt-6" padded={false}>
          <ul className="divide-y divide-slate-100 text-sm">
            {backorders.map((b) => <li key={b.id} className="flex justify-between px-5 py-2"><Link href={`/inventory/transfers/${b.id}`} className="font-mono text-xs hover:underline">{b.number}</Link><Badge tone={TRANSFER_STATUS[b.status].tone}>{TRANSFER_STATUS[b.status].label}</Badge></li>)}
          </ul>
        </Card>
      )}
    </>
  );
}
