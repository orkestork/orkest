import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { orgPeople, orgUsers } from "@/lib/core/members";
import { assemblyKpis, standardMinutesOf, summarizeEntries } from "@/lib/apps/plant";
import { dayKey, hhmm, rangeFrom, todayKey } from "@/lib/apps/ops-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RangeFilter } from "@/components/ops";
import { Badge, btn, Card, Field, input, PageHeader, Stat, Table, td } from "@/components/ui";
import { date, num } from "@/lib/ui/format";
import { deleteTimeEntry, saveAssemblyRun, saveStandardOperation, saveTimeEntry, toggleStandardOperation } from "../plant-actions";

export const metadata = { title: "Ensamble" };

const TABS = [["runs", "Corridas"], ["times", "Registro de tiempos"], ["indicators", "Indicadores"], ["operations", "Operaciones estándar"]] as const;
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 1000) / 10} %`);
const effTone = (v: number | null) => (v === null ? "slate" : v >= 0.9 ? "emerald" : v >= 0.75 ? "amber" : "rose");
const h = (min: number) => `${Math.round((min / 60) * 10) / 10} h`;

/** Ensamble y empaque: corridas por estación, tiempos de operarios contra estándar e indicadores de eficiencia. */
export default async function Assembly({ searchParams }: PageProps<"/manufacturing/assembly">) {
  const ctx = await requireModule("manufacturing", "manufacturing.read");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : "runs";
  const { from, to, where } = rangeFrom(sp, 7);
  const canWrite = ctx.can("manufacturing.write");
  const [stations, products, orders, users, people, ops] = await Promise.all([
    ctx.db.workCenter.findMany({ where: { kind: "ASSEMBLY" }, orderBy: { code: "asc" } }),
    ctx.db.product.findMany({ where: { active: true, kind: "GOODS" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.db.productionOrder.findMany({ where: { status: { in: ["confirmed", "in_progress"] } }, orderBy: { scheduledAt: "asc" }, select: { id: true, number: true, productId: true, quantity: true, producedQty: true } }),
    orgUsers(ctx), orgPeople(ctx),
    ctx.db.standardOperation.findMany({ orderBy: [{ family: "asc" }, { code: "asc" }] }),
  ]);
  const product = new Map(products.map((p) => [p.id, p.name]));
  const who = new Map(people.map((p) => [p.id, p.name]));
  const station = new Map(stations.map((s) => [s.id, s]));
  const nav = (
    <div className="mb-4 flex flex-wrap gap-1 text-sm">
      {TABS.map(([k, l]) => <Link key={k} href={`/manufacturing/assembly?tab=${k}&from=${from}&to=${to}`} className={`rounded-full border px-3 py-1 ${tab === k ? "border-[var(--ork-violet)] bg-[var(--ork-violet)] text-white" : "border-slate-300 bg-white"}`}>{l}</Link>)}
    </div>
  );

  if (tab === "operations") {
    return (
      <>
        <PageHeader title="Ensamble" subtitle="Catálogo de tiempos estándar por operación (segundos por unidad)." />
        {nav}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card padded={false} className="lg:col-span-2">
            <Table head={["Código", "Operación", "Familia", "Estándar (s)", "Estado", ""]} empty={ops.length === 0}>
              {ops.map((o) => (
                <tr key={o.id} className={o.active ? "" : "opacity-50"}>
                  <td className={`${td} font-mono text-xs`}>{o.code}</td><td className={td}>{o.name}</td><td className={td}>{o.family}</td>
                  <td className={`${td} tabular-nums`}>{o.standardSeconds}</td>
                  <td className={td}>{o.active ? <Badge tone="emerald">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                  <td className={td}>{canWrite && <form action={toggleStandardOperation}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="active" value={o.active ? "0" : "1"} /><button className={btn.small}>{o.active ? "Desactivar" : "Activar"}</button></form>}</td>
                </tr>
              ))}
            </Table>
          </Card>
          {canWrite && (
            <Card title="Nueva operación estándar">
              <ActionForm action={saveStandardOperation} className="space-y-3">
                <Field label="Código *"><input name="code" required className={input} /></Field>
                <Field label="Nombre *"><input name="name" required className={input} /></Field>
                <Field label="Familia *" hint="Agrupa operaciones del mismo producto o proceso"><input name="family" required className={input} /></Field>
                <Field label="Segundos estándar por unidad *" hint="0 = actividad indirecta (no afecta eficiencia)"><input name="standardSeconds" type="number" step="any" min="0" required className={input} /></Field>
                <SubmitButton className={btn.primary}>Crear</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </>
    );
  }

  if (tab === "times" || tab === "indicators") {
    const entries = await ctx.db.productionTimeEntry.findMany({ where: { workDate: where }, include: { operation: true }, orderBy: [{ workDate: "desc" }, { startTime: "asc" }], take: 2000 });
    const orderNo = new Map(orders.map((o) => [o.id, o.number]));
    if (tab === "times") {
      return (
        <>
          <PageHeader title="Ensamble" subtitle="Registro de tiempos: varias operaciones con el mismo inicio y fin forman un solo bloque." />
          {nav}
          <RangeFilter from={from} to={to} keep={{ tab }} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card padded={false}>
              <Table head={["Fecha", "Operario", "Horario", "Sección", "OP", "Operación", "Cantidad", "Estándar", ""]} empty={entries.length === 0}>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className={td}>{date(e.workDate)}</td>
                    <td className={td}>{who.get(e.operatorId) ?? "—"}</td>
                    <td className={`${td} tabular-nums`}>{hhmm(e.startTime)}–{hhmm(e.endTime)}</td>
                    <td className={td}>{e.section === "EMPAQUE" ? "Empaque" : "Ensamble"}</td>
                    <td className={`${td} font-mono text-xs`}>{e.productionId ? orderNo.get(e.productionId) ?? "OP" : "—"}</td>
                    <td className={td}>{e.operation.code} · {e.operation.name}</td>
                    <td className={`${td} tabular-nums`}>{num(e.quantity)}{e.sharedBy > 1 && <span className="text-xs text-slate-400"> ÷{e.sharedBy}</span>}</td>
                    <td className={`${td} tabular-nums`}>{Math.round(standardMinutesOf(e) * 10) / 10} min</td>
                    <td className={td}>{canWrite && <form action={deleteTimeEntry}><input type="hidden" name="id" value={e.id} /><button className={btn.ghost} title="Eliminar">✕</button></form>}</td>
                  </tr>
                ))}
              </Table>
            </Card>
            {canWrite && (
              <Card title="Registrar tiempo">
                {ops.filter((o) => o.active).length === 0 ? <p className="text-sm text-slate-500">Primero crea <Link href="/manufacturing/assembly?tab=operations" className="underline">operaciones estándar</Link>.</p> : (
                  <ActionForm action={saveTimeEntry} className="space-y-3">
                    <Field label="Operario"><select name="operatorId" defaultValue={ctx.user.id} className={input}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Fecha"><input type="date" name="workDate" defaultValue={todayKey()} required className={input} /></Field>
                      <Field label="Inicio"><input type="time" name="startTime" required className={input} /></Field>
                      <Field label="Fin"><input type="time" name="endTime" required className={input} /></Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Sección"><select name="section" className={input}><option value="ENSAMBLE">Ensamble</option><option value="EMPAQUE">Empaque</option></select></Field>
                      <Field label="Orden de producción"><select name="productionId" className={input}><option value="">—</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.number}</option>)}</select></Field>
                    </div>
                    <Field label="Operación"><select name="operationId" className={input}>{ops.filter((o) => o.active).map((o) => <option key={o.id} value={o.id}>{o.family} · {o.code} · {o.name} ({o.standardSeconds}s)</option>)}</select></Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Cantidad"><input name="quantity" type="number" min="0" step="1" required className={input} /></Field>
                      <Field label="Personas que comparten"><input name="sharedBy" type="number" min="1" step="1" defaultValue={1} className={input} /></Field>
                    </div>
                    <Field label="Observaciones"><input name="observations" className={input} /></Field>
                    <SubmitButton className={btn.primary}>Registrar</SubmitButton>
                  </ActionForm>
                )}
              </Card>
            )}
          </div>
        </>
      );
    }
    // Indicadores
    const total = summarizeEntries(entries);
    const groupBy = <K extends string>(key: (e: (typeof entries)[number]) => K) => {
      const m = new Map<K, typeof entries>();
      for (const e of entries) m.set(key(e), [...(m.get(key(e)) ?? []), e]);
      return m;
    };
    const byOperator = [...groupBy((e) => e.operatorId)].map(([id, list]) => ({ id, name: who.get(id) ?? "—", days: new Set(list.map((e) => dayKey(e.workDate))).size, ...summarizeEntries(list) })).sort((a, b) => a.name.localeCompare(b.name));
    const byDay = [...groupBy((e) => dayKey(e.workDate))].map(([d, list]) => ({ d, operators: new Set(list.map((e) => e.operatorId)).size, ...summarizeEntries(list) })).sort((a, b) => b.d.localeCompare(a.d));
    const byOp = [...groupBy((e) => e.operationId)].filter(([, l]) => l[0].operation.standardSeconds > 0).map(([, list]) => {
      const s = summarizeEntries(list);
      const units = list.reduce((a, e) => a + e.quantity / Math.max(1, e.sharedBy), 0);
      const real = units ? (s.directMinutes * 60) / units : null;
      return { op: list[0].operation, units, real, deviation: real !== null ? real / list[0].operation.standardSeconds - 1 : null };
    }).sort((a, b) => a.op.family.localeCompare(b.op.family) || a.op.code.localeCompare(b.op.code));
    return (
      <>
        <PageHeader title="Ensamble" subtitle="Eficiencia = minutos estándar ganados ÷ minutos de bloques con operaciones directas." />
        {nav}
        <RangeFilter from={from} to={to} keep={{ tab }} />
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Eficiencia" value={pct(total.efficiency)} />
          <Stat label="Horas registradas" value={h(total.registeredMinutes)} />
          <Stat label="Horas directas" value={h(total.directMinutes)} />
          <Stat label="Horas estándar ganadas" value={h(total.standardMinutes)} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Por operario" padded={false}>
            <Table head={["Operario", "Días", "Registradas", "Directas", "Estándar", "Eficiencia"]} empty={byOperator.length === 0}>
              {byOperator.map((o) => <tr key={o.id}><td className={td}>{o.name}</td><td className={td}>{o.days}</td><td className={td}>{h(o.registeredMinutes)}</td><td className={td}>{h(o.directMinutes)}</td><td className={td}>{h(o.standardMinutes)}</td><td className={td}><Badge tone={effTone(o.efficiency)}>{pct(o.efficiency)}</Badge></td></tr>)}
            </Table>
          </Card>
          <Card title="Por día" padded={false}>
            <Table head={["Día", "Operarios", "Registradas", "Estándar", "Eficiencia"]} empty={byDay.length === 0}>
              {byDay.map((d) => <tr key={d.d}><td className={td}>{date(`${d.d}T12:00:00Z`)}</td><td className={td}>{d.operators}</td><td className={td}>{h(d.registeredMinutes)}</td><td className={td}>{h(d.standardMinutes)}</td><td className={td}><Badge tone={effTone(d.efficiency)}>{pct(d.efficiency)}</Badge></td></tr>)}
            </Table>
          </Card>
          <Card title="Real vs. estándar por operación" padded={false} className="lg:col-span-2">
            <Table head={["Familia", "Operación", "Unidades", "Estándar (s/u)", "Real (s/u)", "Desviación"]} empty={byOp.length === 0}>
              {byOp.map((o) => <tr key={o.op.id}><td className={td}>{o.op.family}</td><td className={td}>{o.op.code} · {o.op.name}</td><td className={td}>{num(Math.round(o.units))}</td><td className={td}>{o.op.standardSeconds}</td><td className={td}>{o.real === null ? "—" : Math.round(o.real * 10) / 10}</td><td className={td}>{o.deviation === null ? "—" : <Badge tone={Math.abs(o.deviation) <= 0.1 ? "emerald" : o.deviation > 0 ? "rose" : "amber"}>{o.deviation > 0 ? "+" : ""}{Math.round(o.deviation * 100)} %</Badge>}</td></tr>)}
            </Table>
          </Card>
        </div>
      </>
    );
  }

  const [runs, kpis] = await Promise.all([
    ctx.db.assemblyRun.findMany({ where: { productionDate: where }, orderBy: [{ productionDate: "desc" }, { startTime: "desc" }], take: 500 }),
    assemblyKpis(ctx, where),
  ]);
  return (
    <>
      <PageHeader title="Ensamble" subtitle="Corridas por estación: unidades ensambladas, defectos, reprocesos y productividad por hora-hombre." />
      {nav}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Corridas" value={kpis.corridas} />
        <Stat label="Ensambladas" value={num(kpis.unidadesEnsambladas)} />
        <Stat label="Buenas" value={num(kpis.unidadesBuenas)} />
        <Stat label="Calidad" value={`${kpis.calidadPct} %`} />
        <Stat label="Unidades / hora-hombre" value={kpis.unidadesPorHoraHombre} />
      </div>
      <RangeFilter from={from} to={to} keep={{ tab }} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card padded={false}>
          <Table head={["Fecha", "Estación", "OP", "Producto", "Líder", "Horario", "Ensambladas", "Def. / NC / Rep.", "Personas · h-h"]} empty={runs.length === 0}>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className={td}>{date(r.productionDate)}</td>
                <td className={td}>{station.get(r.workCenterId)?.code ?? "—"}</td>
                <td className={`${td} font-mono text-xs`}>{r.productionId ? <Link href={`/manufacturing/orders/${r.productionId}`} className="underline">{r.orderNumber}</Link> : r.orderNumber}</td>
                <td className={td}>{product.get(r.productId) ?? "—"}</td>
                <td className={td}>{who.get(r.leaderId) ?? "—"}</td>
                <td className={`${td} tabular-nums`}>{hhmm(r.startTime)}–{hhmm(r.endTime)}</td>
                <td className={`${td} tabular-nums`}>{num(r.assembled)}</td>
                <td className={`${td} tabular-nums`}>{r.defective} / {r.nonConforming} / {r.reworked}{r.defectReason && <p className="text-xs text-slate-400">{r.defectReason}</p>}</td>
                <td className={`${td} tabular-nums`}>{r.workerCount} · {r.laborHours}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {canWrite && (
          <Card title="Registrar corrida de ensamble">
            {stations.length === 0 ? <p className="text-sm text-slate-500">Crea un <Link href="/manufacturing/workcenters" className="underline">centro de trabajo</Link> de tipo «Estación de ensamble».</p> : (
              <ActionForm action={saveAssemblyRun} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Estación"><select name="workCenterId" className={input}>{stations.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></Field>
                  <Field label="Líder"><select name="leaderId" defaultValue={ctx.user.id} className={input}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Orden de producción"><select name="productionId" className={input}><option value="">— Manual —</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.number} · {product.get(o.productId) ?? ""}</option>)}</select></Field>
                  <Field label="N.º de orden"><input name="orderNumber" className={input} /></Field>
                </div>
                <Field label="Producto *"><select name="productId" required className={input}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Fecha"><input type="date" name="productionDate" defaultValue={todayKey()} required className={input} /></Field>
                  <Field label="Inicio"><input type="time" name="startTime" required className={input} /></Field>
                  <Field label="Fin"><input type="time" name="endTime" required className={input} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Ensambladas *"><input name="assembled" type="number" min="0" step="1" required className={input} /></Field>
                  <Field label="Defectuosas"><input name="defective" type="number" min="0" step="1" defaultValue={0} className={input} /></Field>
                  <Field label="No conformes"><input name="nonConforming" type="number" min="0" step="1" defaultValue={0} className={input} /></Field>
                  <Field label="Reprocesadas"><input name="reworked" type="number" min="0" step="1" defaultValue={0} className={input} /></Field>
                  <Field label="Personas *"><input name="workerCount" type="number" min="1" step="1" defaultValue={1} required className={input} /></Field>
                  <Field label="Horas hombre" hint="Vacío = horario × personas"><input name="laborHours" type="number" step="any" min="0" className={input} /></Field>
                </div>
                <Field label="Causa de defectos"><input name="defectReason" className={input} /></Field>
                <Field label="Observaciones"><textarea name="observations" rows={2} className={input} /></Field>
                <SubmitButton className={btn.primary}>Registrar</SubmitButton>
              </ActionForm>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
