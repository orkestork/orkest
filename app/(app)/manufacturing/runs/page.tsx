import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { orgPeople, orgUsers } from "@/lib/core/members";
import { goodPieces, qualityPct, runEfficiency } from "@/lib/apps/plant";
import { hhmm, rangeFrom, todayKey } from "@/lib/apps/ops-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RangeFilter } from "@/components/ops";
import { Badge, btn, Card, Field, input, PageHeader, Stat, Table, td } from "@/components/ui";
import { date, num } from "@/lib/ui/format";
import { saveInjectionRun } from "../plant-actions";

export const metadata = { title: "Corridas de inyección" };

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 10) / 10} %`);

/** Planilla diaria de inyección: una corrida por máquina, operario y orden. */
export default async function InjectionRuns({ searchParams }: PageProps<"/manufacturing/runs">) {
  const ctx = await requireModule("manufacturing", "manufacturing.read");
  const sp = await searchParams;
  const { from, to, where } = rangeFrom(sp, 7);
  const machineId = typeof sp.machine === "string" ? sp.machine : "";
  const operatorId = typeof sp.operator === "string" ? sp.operator : "";
  const canWrite = ctx.can("manufacturing.write");
  const [runs, machines, products, orders, users, people, molds] = await Promise.all([
    ctx.db.productionRun.findMany({ where: { productionDate: where, ...(machineId ? { workCenterId: machineId } : {}), ...(operatorId ? { operatorId } : {}) }, orderBy: [{ productionDate: "desc" }, { startTime: "desc" }], take: 500 }),
    ctx.db.workCenter.findMany({ where: { kind: "MACHINE" }, orderBy: { code: "asc" } }),
    ctx.db.product.findMany({ where: { active: true, kind: "GOODS" }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true } }),
    ctx.db.productionOrder.findMany({ where: { status: { in: ["confirmed", "in_progress"] } }, orderBy: { scheduledAt: "asc" }, select: { id: true, number: true, productId: true } }),
    orgUsers(ctx),
    orgPeople(ctx),
    ctx.db.mold.findMany({ orderBy: { code: "asc" } }),
  ]);
  const machine = new Map(machines.map((m) => [m.id, m]));
  const product = new Map(products.map((p) => [p.id, p.name]));
  const who = new Map(people.map((p) => [p.id, p.name]));
  const produced = runs.reduce((s, r) => s + r.produced, 0);
  const good = runs.reduce((s, r) => s + goodPieces(r), 0);
  const effs = runs.map((r) => runEfficiency(r).efficiency).filter((e): e is number => e !== null);
  const qs = new URLSearchParams({ from, to, ...(machineId ? { machine: machineId } : {}), ...(operatorId ? { operator: operatorId } : {}) }).toString();

  return (
    <>
      <PageHeader title="Corridas de inyección" subtitle="Registro diario por máquina: material, parámetros, piezas producidas, calidad y eficiencia teórica."
        actions={<Link href={`/print/production-runs?${qs}`} className={btn.secondary}>Imprimir planilla</Link>} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Corridas" value={runs.length} />
        <Stat label="Piezas producidas" value={num(produced)} />
        <Stat label="Piezas buenas" value={num(good)} />
        <Stat label="Calidad" value={pct(produced ? (good / produced) * 100 : null)} />
        <Stat label="Eficiencia promedio" value={pct(effs.length ? effs.reduce((a, b) => a + b, 0) / effs.length : null)} hint="vs. ciclo y cavidades" />
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="text-xs text-slate-500">Desde<input type="date" name="from" defaultValue={from} className="ml-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm" /></label>
        <label className="text-xs text-slate-500">Hasta<input type="date" name="to" defaultValue={to} className="ml-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm" /></label>
        <select name="machine" defaultValue={machineId} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm"><option value="">Todas las máquinas</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select>
        <select name="operator" defaultValue={operatorId} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm"><option value="">Todos los operarios</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <button className={btn.small}>Aplicar</button>
      </form>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card padded={false}>
          <Table head={["Fecha", "Máquina", "OP", "Producto", "Operario", "Horario", "Producidas", "Dañadas / NC", "Calidad", "Eficiencia"]} empty={runs.length === 0}>
            {runs.map((r) => {
              const e = runEfficiency(r);
              return (
                <tr key={r.id}>
                  <td className={td}>{date(r.productionDate)}</td>
                  <td className={td}>{machine.get(r.workCenterId)?.code ?? "—"}</td>
                  <td className={`${td} font-mono text-xs`}>{r.productionId ? <Link href={`/manufacturing/orders/${r.productionId}`} className="underline">{r.orderNumber}</Link> : r.orderNumber}</td>
                  <td className={td}>{r.productId ? product.get(r.productId) ?? "—" : r.manualProductName}<p className="text-xs text-slate-400">{r.material}{r.pigmentColor ? ` · ${r.pigmentColor}` : ""}</p></td>
                  <td className={td}>{who.get(r.operatorId) ?? "—"}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{hhmm(r.startTime)}–{hhmm(r.endTime)}{r.downtimeMinutes > 0 && <p className="text-xs text-[var(--ork-pink)]">{r.downtimeMinutes} min detenida</p>}</td>
                  <td className={`${td} tabular-nums`}>{num(r.produced)}</td>
                  <td className={`${td} tabular-nums`}>{r.damaged} / {r.nonConforming}</td>
                  <td className={td}><Badge tone={qualityPct(r) >= 98 ? "emerald" : qualityPct(r) >= 95 ? "amber" : "rose"}>{pct(qualityPct(r))}</Badge></td>
                  <td className={td}>{e.efficiency === null ? "—" : <Badge tone={e.efficiency >= 90 ? "emerald" : e.efficiency >= 75 ? "amber" : "rose"}>{pct(e.efficiency)}</Badge>}<p className="text-xs text-slate-400">esperadas {num(e.expected)}</p></td>
                </tr>
              );
            })}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Registrar corrida">
            {machines.length === 0 ? <p className="text-sm text-slate-500">Crea un <Link href="/manufacturing/workcenters" className="underline">centro de trabajo</Link> de tipo «Máquina de inyección».</p> : (
              <ActionForm action={saveInjectionRun} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Máquina *"><select name="workCenterId" className={input}>{machines.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select></Field>
                  <Field label="Operario *"><select name="operatorId" defaultValue={ctx.user.id} className={input}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Orden de producción"><select name="productionId" className={input}><option value="">— Manual —</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.number} · {product.get(o.productId) ?? ""}</option>)}</select></Field>
                  <Field label="N.º de orden" hint="Vacío = número de la OP"><input name="orderNumber" className={input} /></Field>
                </div>
                <Field label="Producto"><select name="productId" className={input}><option value="">— Producto manual —</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                <Field label="Producto manual"><input name="manualProductName" className={input} /></Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Fecha *"><input type="date" name="productionDate" defaultValue={todayKey()} required className={input} /></Field>
                  <Field label="Inicio *"><input type="time" name="startTime" required className={input} /></Field>
                  <Field label="Fin *"><input type="time" name="endTime" required className={input} /></Field>
                </div>
                <Field label="Molde"><select name="moldId" className={input}><option value="">—</option>{molds.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Material *"><input name="material" required className={input} /></Field>
                  <Field label="Material entregado (kg)"><input name="materialQuantityKg" type="number" step="any" min="0" className={input} /></Field>
                  <Field label="Pigmento"><input name="pigment" className={input} /></Field>
                  <Field label="Color"><input name="pigmentColor" className={input} /></Field>
                  <Field label="Cantidad de pigmento"><input name="pigmentQuantity" type="number" step="any" min="0" className={input} /></Field>
                  <Field label="Cavidades"><input name="cavities" type="number" min="1" max="500" defaultValue={1} className={input} /></Field>
                  <Field label="Peso inyección (g) *"><input name="injectionWeight" type="number" step="any" min="0" required className={input} /></Field>
                  <Field label="Peso pieza (g) *"><input name="pieceWeight" type="number" step="any" min="0" required className={input} /></Field>
                  <Field label="Ciclo *"><input name="cycle" type="number" step="any" min="0" required className={input} /></Field>
                  <Field label="Unidad del ciclo"><select name="cycleUnit" className={input}><option value="seconds">segundos</option><option value="minutes">minutos</option></select></Field>
                </div>
                <Field label="Temperatura (°C)" hint="O diligencia las zonas"><input name="temperature" type="number" step="any" min="0" className={input} /></Field>
                <div className="grid grid-cols-6 gap-1">{[1, 2, 3, 4, 5, 6].map((i) => <input key={i} name={`zone${i}`} type="number" step="any" min="0" placeholder={`Z${i}`} aria-label={`Zona ${i}`} className="rounded-lg border border-slate-300 px-1 py-1.5 text-center text-xs" />)}</div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Producidas *"><input name="produced" type="number" min="0" step="1" required className={input} /></Field>
                  <Field label="Dañadas"><input name="damaged" type="number" min="0" step="1" defaultValue={0} className={input} /></Field>
                  <Field label="No conformes"><input name="nonConforming" type="number" min="0" step="1" defaultValue={0} className={input} /></Field>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Prueba de acople"><input name="couplingTest" className={input} /></Field>
                  <Field label="Estado"><select name="couplingStatus" className={input}><option value="">—</option><option value="completed">Completada</option><option value="na">N/A</option></select></Field>
                  <Field label="Hora"><input name="couplingTime" type="time" className={input} /></Field>
                </div>
                <Field label="Minutos detenida"><input name="downtimeMinutes" type="number" min="0" step="1" defaultValue={0} className={input} /></Field>
                <Field label="Observaciones"><textarea name="observations" rows={2} className={input} /></Field>
                <SubmitButton className={btn.primary}>Registrar corrida</SubmitButton>
              </ActionForm>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
