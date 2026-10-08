import { requireModule } from "@/lib/core/context";
import { warehouseLimit } from "@/lib/apps/stock";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader } from "@/components/ui";
import { money, num } from "@/lib/ui/format";
import { OP_KIND } from "@/lib/ui/stock-labels";
import { saveWarehouse, warehouseAction } from "../actions";

export const metadata = { title: "Almacenes" };

export default async function Warehouses() {
  const ctx = await requireModule("inventory", "inventory.read");
  const [warehouses, quants, limit] = await Promise.all([
    ctx.db.warehouse.findMany({ orderBy: [{ active: "desc" }, { position: "asc" }], include: { locations: true, operationTypes: true } }),
    ctx.db.stockQuant.findMany({ include: { location: true, product: { select: { cost: true } } } }),
    warehouseLimit(ctx),
  ]);
  const active = warehouses.filter((w) => w.active);
  const canWrite = ctx.can("inventory.write");
  const stats = (id: string) => {
    const qs = quants.filter((x) => x.location.warehouseId === id && Number(x.quantity) !== 0);
    return { refs: new Set(qs.map((x) => x.productId)).size, units: qs.reduce((s, x) => s + Number(x.quantity), 0), value: qs.reduce((s, x) => s + Number(x.quantity) * Number(x.product.cost), 0) };
  };
  return (
    <>
      <PageHeader title="Almacenes" subtitle={`${active.length} de ${limit} almacenes activos. Cada almacén tiene su ubicación de existencias y sus operaciones (recepción, traslado, entrega, fabricación).`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {warehouses.map((w) => {
            const st = stats(w.id);
            return (
              <Card key={w.id} className={w.active ? "" : "opacity-60"}
                title={<span className="flex items-center gap-2"><span className="rounded-md bg-[var(--ork-purple)] px-2 py-0.5 font-mono text-[11px] text-white">{w.code}</span>{w.name}{!w.active && <Badge>Archivado</Badge>}</span>}>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div><p className="text-xs text-stone-500">Referencias con stock</p><p className="text-lg font-semibold tabular-nums">{st.refs}</p></div>
                  <div><p className="text-xs text-stone-500">Unidades</p><p className="text-lg font-semibold tabular-nums">{num(st.units)}</p></div>
                  {!ctx.restricted("deny:costs") && <div><p className="text-xs text-stone-500">Valor a costo</p><p className="text-lg font-semibold tabular-nums">{money(st.value)}</p></div>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">{w.operationTypes.map((o) => <Badge key={o.id} tone="violet">{OP_KIND[o.kind]} · {o.prefix}</Badge>)}</div>
                {canWrite && (
                  <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-stone-100 pt-3">
                    <ActionForm action={warehouseAction} className="flex gap-2">
                      <input type="hidden" name="id" value={w.id} /><input type="hidden" name="op" value="rename" />
                      <input name="name" defaultValue={w.name} aria-label="Nombre del almacén" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm" />
                      <SubmitButton className={btn.small}>Renombrar</SubmitButton>
                    </ActionForm>
                    <ActionForm action={warehouseAction}>
                      <input type="hidden" name="id" value={w.id} /><input type="hidden" name="op" value={w.active ? "archive" : "restore"} />
                      <SubmitButton className={btn.small}>{w.active ? "Archivar" : "Restaurar"}</SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        {canWrite && (
          <Card title="Nuevo almacén">
            <p className="mb-2 text-sm text-stone-600">{active.length} de {limit} usados</p>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-[var(--ork-violet)]" style={{ width: `${(active.length / limit) * 100}%` }} /></div>
            {active.length < limit ? (
              <ActionForm action={saveWarehouse} className="space-y-3">
                <Field label="Nombre *"><input name="name" required className={input} placeholder="Bodega Barranquilla" /></Field>
                <Field label="Código *" hint="Máximo 6 letras o números, p. ej. BAQ"><input name="code" required maxLength={6} className={`${input} uppercase`} /></Field>
                <SubmitButton className={btn.primary}>Crear almacén</SubmitButton>
              </ActionForm>
            ) : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Llegaste al máximo de {limit}. Archiva un almacén vacío para crear otro.</p>}
          </Card>
        )}
      </div>
    </>
  );
}
