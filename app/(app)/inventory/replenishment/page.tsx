import { requireModule } from "@/lib/core/context";
import { forecastAt } from "@/lib/apps/replenishment";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { ago, num } from "@/lib/ui/format";
import { RULE_ACTION } from "@/lib/ui/stock-labels";
import { deleteRule, runRules, saveRule } from "../actions";

export const metadata = { title: "Reabastecimiento" };

export default async function Replenishment() {
  const ctx = await requireModule("inventory", "inventory.read");
  const [rules, products, locations, suppliers] = await Promise.all([
    ctx.db.reorderRule.findMany({ orderBy: { productId: "asc" } }),
    ctx.db.product.findMany({ where: { active: true, kind: "GOODS" }, orderBy: { name: "asc" } }),
    ctx.db.location.findMany({ where: { kind: "INTERNAL", active: true }, orderBy: { name: "asc" } }),
    ctx.hasModule("purchasing") ? ctx.db.supplier.findMany({ orderBy: { name: "asc" } }) : [],
  ]);
  const pmap = new Map(products.map((p) => [p.id, p]));
  const lmap = new Map(locations.map((l) => [l.id, l.name]));
  const smap = new Map(suppliers.map((s) => [s.id, s.name]));
  const rows = await Promise.all(rules.map(async (r) => ({ r, ...(await forecastAt(ctx, r.productId, r.locationId)) })));
  const canWrite = ctx.can("inventory.write");
  const actions = Object.entries(RULE_ACTION).filter(([k]) => k !== "MANUFACTURE" || ctx.hasModule("manufacturing")).filter(([k]) => k !== "BUY" || ctx.hasModule("purchasing"));

  return (
    <>
      <PageHeader title="Reabastecimiento" subtitle="Reglas mín/máx por bodega. Si el pronóstico (existencia + entradas − salidas) cae bajo el mínimo, ORKEST repone hasta el máximo comprando, fabricando o trayendo de otra bodega. Las reglas automáticas se ejecutan después de cada movimiento." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2">
          <ActionForm action={runRules}>
            <Table head={["", "Producto", "Ubicación", "Disponible", "Pronóstico", "Mín / Máx", "Acción", "Modo", ""]} empty={rows.length === 0}>
              {rows.map(({ r, onHand, forecast }) => {
                const below = forecast < Number(r.minQty);
                return (
                  <tr key={r.id} className={below ? "bg-[var(--ork-pink)]/5" : ""}>
                    <td className={td}><input type="checkbox" name="ruleId" value={r.id} aria-label="Seleccionar regla" /></td>
                    <td className={td}><p className="font-medium">{pmap.get(r.productId)?.name}</p><p className="font-mono text-xs text-slate-400">{pmap.get(r.productId)?.sku}</p></td>
                    <td className={`${td} text-xs`}>{lmap.get(r.locationId)}</td>
                    <td className={td}>{num(onHand)}</td>
                    <td className={`${td} font-semibold ${below ? "text-[var(--ork-pink)]" : ""}`}>{num(forecast)}</td>
                    <td className={td}>{num(r.minQty)} / {num(r.maxQty)}</td>
                    <td className={`${td} text-xs`}>{RULE_ACTION[r.action]}{r.action === "TRANSFER" && r.sourceLocationId ? <p className="text-slate-400">desde {lmap.get(r.sourceLocationId)}</p> : null}{r.action === "BUY" ? <p className="text-slate-400">{r.supplierId ? smap.get(r.supplierId) : "proveedor del producto"}</p> : null}</td>
                    <td className={td}><Badge tone={r.trigger === "AUTO" ? "violet" : "slate"}>{r.trigger === "AUTO" ? "Automático" : "Manual"}</Badge>{r.lastRunAt && <p className="text-[11px] text-slate-400">{ago(r.lastRunAt)}</p>}</td>
                    <td className={td}>{canWrite && <button formAction={deleteRule} name="id" value={r.id} className="text-xs text-slate-400 hover:text-[var(--ork-pink)]">Eliminar</button>}</td>
                  </tr>
                );
              })}
            </Table>
            {canWrite && rows.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 p-4">
                <p className="text-xs text-slate-500">Sin selección se evalúan todas las reglas (incluidas las manuales).</p>
                <SubmitButton className={btn.primary} pendingText="Ejecutando…">Ejecutar reabastecimiento</SubmitButton>
              </div>
            )}
          </ActionForm>
        </Card>
        {canWrite && (
          <Card title="Nueva regla">
            <ActionForm action={saveRule} className="space-y-3">
              <Field label="Producto"><select name="productId" required className={input}>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></Field>
              <Field label="Ubicación a abastecer"><select name="locationId" required className={input}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Mínimo"><input name="minQty" type="number" step="any" min="0" required className={input} /></Field>
                <Field label="Máximo"><input name="maxQty" type="number" step="any" min="0" required className={input} /></Field>
                <Field label="Múltiplo"><input name="multiple" type="number" step="any" min="0" defaultValue={1} className={input} /></Field>
              </div>
              <Field label="Cómo reponer"><select name="action" className={input}>{actions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Bodega de origen (si se trae de otra)"><select name="sourceLocationId" className={input}><option value="">—</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
              {suppliers.length > 0 && <Field label="Proveedor (si se compra)"><select name="supplierId" className={input}><option value="">Proveedor por defecto del producto</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
              <Field label="Modo"><select name="trigger" className={input}><option value="AUTO">Automático</option><option value="MANUAL">Manual (alerta en Radar)</option></select></Field>
              <SubmitButton className={btn.primary}>Guardar regla</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
