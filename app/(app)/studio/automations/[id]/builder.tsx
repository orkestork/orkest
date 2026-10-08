"use client";

import { useMemo, useState } from "react";
import type { Condition, Operator } from "@/lib/core/conditions";

type Opt = { value: string; label: string };
type ActionRow = Record<string, unknown> & { type: string };

const cls = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

export function AutomationBuilder({ events, fieldsByEntity, operators, actionTypes, roles, initial }: {
  events: { type: string; label: string; entityType: string }[];
  fieldsByEntity: Record<string, Opt[]>;
  operators: { op: Operator; label: string; needsValue: boolean }[];
  actionTypes: Opt[];
  roles: Opt[];
  initial: { trigger: string; mode: "all" | "any"; conditions: Condition[]; actions: ActionRow[] };
}) {
  const [trigger, setTrigger] = useState(initial.trigger || events[0]?.type);
  const [mode, setMode] = useState<"all" | "any">(initial.mode);
  const [conds, setConds] = useState<Condition[]>(initial.conditions);
  const [actions, setActions] = useState<ActionRow[]>(initial.actions.length ? initial.actions : [{ type: "NOTIFY", to: { role: roles[0]?.value }, title: "" }]);
  const entityType = events.find((e) => e.type === trigger)?.entityType ?? "";
  const fields = useMemo(() => [...(fieldsByEntity[entityType] ?? []), { value: "event.from", label: "Evento: estado anterior" }, { value: "event.to", label: "Evento: estado nuevo" }], [entityType, fieldsByEntity]);
  const conditionsJson = JSON.stringify({ [mode]: conds });
  const setAction = (i: number, patch: Record<string, unknown>) => setActions((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const roleOf = (a: ActionRow, k: string) => ((a[k] as { role?: string }) ?? {}).role ?? "";

  return (
    <div className="space-y-6">
      <input type="hidden" name="trigger" value={trigger} />
      <input type="hidden" name="conditions" value={conditionsJson} />
      <input type="hidden" name="actions" value={JSON.stringify(actions)} />

      <section>
        <p className="mb-2 font-mono text-xs font-semibold text-violet-600">WHEN</p>
        <select className={cls} value={trigger} onChange={(e) => setTrigger(e.target.value)}>
          {events.map((e) => <option key={e.type} value={e.type}>{e.label} ({e.type})</option>)}
        </select>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <p className="font-mono text-xs font-semibold text-violet-600">IF</p>
          <select className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={mode} onChange={(e) => setMode(e.target.value as "all" | "any")}>
            <option value="all">se cumplen TODAS</option><option value="any">se cumple ALGUNA</option>
          </select>
        </div>
        <div className="space-y-2">
          {conds.map((c, i) => {
            const op = operators.find((o) => o.op === c.op);
            return (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <select className={cls} value={c.field} onChange={(e) => setConds((cs) => cs.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}>
                  {fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select className={cls} value={c.op} onChange={(e) => setConds((cs) => cs.map((x, j) => (j === i ? { ...x, op: e.target.value as Operator } : x)))}>
                  {operators.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                </select>
                <input className={cls} disabled={!op?.needsValue} value={String(c.value ?? "")} onChange={(e) => setConds((cs) => cs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <button type="button" onClick={() => setConds((cs) => cs.filter((_, j) => j !== i))} className="px-2 text-slate-400 hover:text-rose-600" aria-label="Quitar condición">×</button>
              </div>
            );
          })}
          <button type="button" onClick={() => setConds((cs) => [...cs, { field: fields[0]?.value ?? "", op: "eq", value: "" }])} className="text-sm font-medium text-[var(--brand)]">+ Condición</button>
          {conds.length === 0 && <p className="text-xs text-slate-400">Sin condiciones: se ejecuta siempre que ocurra el evento.</p>}
        </div>
      </section>

      <section>
        <p className="mb-2 font-mono text-xs font-semibold text-violet-600">THEN</p>
        <div className="space-y-3">
          {actions.map((a, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="flex gap-2">
                <select className={cls} value={a.type} onChange={(e) => setActions((as) => as.map((x, j) => (j === i ? { type: e.target.value } : x)))}>
                  {actionTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button type="button" onClick={() => setActions((as) => as.filter((_, j) => j !== i))} className="px-2 text-slate-400 hover:text-rose-600" aria-label="Quitar acción">×</button>
              </div>
              {a.type === "NOTIFY" && (<>
                <select className={cls} value={a.to === "owner" ? "owner" : roleOf(a, "to")} onChange={(e) => setAction(i, { to: e.target.value === "owner" ? "owner" : { role: e.target.value } })}>
                  <option value="owner">Responsable del registro</option>
                  {roles.map((r) => <option key={r.value} value={r.value}>Rol: {r.label}</option>)}
                </select>
                <input className={cls} placeholder="Título — usa {{campo}}" value={String(a.title ?? "")} onChange={(e) => setAction(i, { title: e.target.value })} />
                <input className={cls} placeholder="Detalle (opcional)" value={String(a.body ?? "")} onChange={(e) => setAction(i, { body: e.target.value })} />
              </>)}
              {a.type === "CREATE_APPROVAL" && (<>
                <select className={cls} value={String(a.role ?? "")} onChange={(e) => setAction(i, { role: e.target.value })}>
                  <option value="">Rol que aprueba…</option>{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <input className={cls} placeholder="Motivo" value={String(a.reason ?? "")} onChange={(e) => setAction(i, { reason: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input className={cls} placeholder="Estado si aprueba" value={String(a.onApproveState ?? "")} onChange={(e) => setAction(i, { onApproveState: e.target.value })} />
                  <input className={cls} placeholder="Estado si rechaza" value={String(a.onRejectState ?? "")} onChange={(e) => setAction(i, { onRejectState: e.target.value })} />
                </div>
              </>)}
              {a.type === "SET_STATUS" && <input className={cls} placeholder="Clave del estado (p.ej. pending_approval)" value={String(a.status ?? "")} onChange={(e) => setAction(i, { status: e.target.value })} />}
              {a.type === "CREATE_TASK" && (<>
                <input className={cls} placeholder="Título de la tarea" value={String(a.title ?? "")} onChange={(e) => setAction(i, { title: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <select className={cls} value={a.assignTo === "owner" ? "owner" : roleOf(a, "assignTo")} onChange={(e) => setAction(i, { assignTo: e.target.value === "owner" ? "owner" : { role: e.target.value } })}>
                    <option value="owner">Responsable del registro</option>{roles.map((r) => <option key={r.value} value={r.value}>Rol: {r.label}</option>)}
                  </select>
                  <input className={cls} type="number" min="0" placeholder="Días para vencer" value={String(a.dueInDays ?? "")} onChange={(e) => setAction(i, { dueInDays: Number(e.target.value) })} />
                </div>
              </>)}
              {a.type === "ADD_ACTIVITY" && <input className={cls} placeholder="Texto de la actividad" value={String(a.content ?? "")} onChange={(e) => setAction(i, { content: e.target.value })} />}
              {a.type === "SET_FIELD" && (
                <div className="grid grid-cols-2 gap-2">
                  <input className={cls} placeholder="Clave del campo personalizado" value={String(a.field ?? "")} onChange={(e) => setAction(i, { field: e.target.value })} />
                  <input className={cls} placeholder="Valor" value={String(a.value ?? "")} onChange={(e) => setAction(i, { value: e.target.value })} />
                </div>
              )}
              {a.type === "CREATE_INSIGHT" && (<>
                <select className={cls} value={String(a.severity ?? "MEDIUM")} onChange={(e) => setAction(i, { severity: e.target.value })}>
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s}>{s}</option>)}
                </select>
                <input className={cls} placeholder="Título del insight" value={String(a.title ?? "")} onChange={(e) => setAction(i, { title: e.target.value })} />
                <input className={cls} placeholder="Acción recomendada" value={String(a.recommendedAction ?? "")} onChange={(e) => setAction(i, { recommendedAction: e.target.value })} />
              </>)}
              {a.type === "CREATE_INVOICE" && <input className={cls} type="number" placeholder="Días de plazo" value={String(a.dueDays ?? 30)} onChange={(e) => setAction(i, { dueDays: Number(e.target.value) })} />}
            </div>
          ))}
          <button type="button" onClick={() => setActions((as) => [...as, { type: "NOTIFY", to: "owner", title: "" }])} className="text-sm font-medium text-[var(--brand)]">+ Acción</button>
        </div>
      </section>
    </div>
  );
}
