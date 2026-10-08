import { requireModule } from "@/lib/core/context";
import { materialsPlan } from "@/lib/apps/manufacturing";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, PageHeader, Table, td } from "@/components/ui";
import { num } from "@/lib/ui/format";
import { buyShortagesAction } from "../actions";

export const metadata = { title: "Planificación de materiales" };

export default async function Planning() {
  const ctx = await requireModule("manufacturing", "manufacturing.read");
  const rows = await materialsPlan(ctx);
  const locs = new Map((await ctx.db.location.findMany()).map((l) => [l.id, l.name]));
  const shortages = rows.filter((r) => r.shortage > 0).length;
  return (
    <>
      <PageHeader title="Planificación de materiales" subtitle="Necesidad de componentes de las órdenes de producción abiertas frente a existencias y entradas pendientes."
        actions={shortages > 0 && ctx.hasModule("purchasing") && ctx.can("purchasing.write") && (
          <ActionForm action={buyShortagesAction}><SubmitButton className={btn.primary}>Comprar faltantes ({shortages})</SubmitButton></ActionForm>
        )} />
      <Card padded={false}>
        <Table head={["Componente", "Ubicación", "Requerido", "Existencia", "Entradas pendientes", "Faltante", "Órdenes"]} empty={rows.length === 0}>
          {rows.map((r) => (
            <tr key={`${r.productId}:${r.locationId}`}>
              <td className={td}><p className="font-medium">{r.name}</p><p className="font-mono text-xs text-slate-400">{r.sku}</p></td>
              <td className={`${td} text-xs`}>{locs.get(r.locationId)}</td>
              <td className={td}>{num(r.required)} {r.unit}</td><td className={td}>{num(r.onHand)}</td><td className={td}>{num(r.incoming)}</td>
              <td className={td}>{r.shortage > 0 ? <Badge tone="rose">{num(r.shortage)}</Badge> : <Badge tone="emerald">Cubierto</Badge>}</td>
              <td className={`${td} text-xs`}>{[...new Set(r.orders)].join(", ")}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
