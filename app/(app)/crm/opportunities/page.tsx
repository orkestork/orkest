import { requireModule } from "@/lib/core/context";
import { RecordPicker } from "@/components/record-picker";
import { lookupCustomers, quickCreateCustomer } from "../../lookup-actions";
import { getWorkflow, availableTransitions } from "@/lib/core/workflow";
import { orgUsers } from "@/lib/core/members";
import { plain } from "@/lib/core/entities";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { transitionAction } from "../../entity-actions";
import { saveOpportunity } from "../actions";
import { btn, Card, Empty, Field, input, PageHeader } from "@/components/ui";
import { money, ago } from "@/lib/ui/format";

export const metadata = { title: "Oportunidades" };

/** Pipeline = estados del workflow "opportunity" configurado en Studio (no hardcodeado). */
export default async function Opportunities() {
  const ctx = await requireModule("crm", "crm.opportunities.read");
  const wf = await getWorkflow(ctx.db, "opportunity");
  if (!wf) return <Empty title="No hay pipeline configurado">Configúralo en Studio → Workflows.</Empty>;
  const [opps, users] = await Promise.all([
    ctx.db.opportunity.findMany({ include: { customer: true }, orderBy: { amount: "desc" } }),
    orgUsers(ctx),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const canWrite = ctx.can("crm.opportunities.write");
  const transitionsByOpp = new Map(await Promise.all(opps.map(async (o) => [o.id, (await availableTransitions(ctx, "opportunity", plain(o))).transitions] as const)));

  return (
    <>
      <PageHeader title="Oportunidades" subtitle={`${wf.name} · ${money(opps.filter((o) => !["won", "lost"].includes(o.status)).reduce((s, o) => s + Number(o.amount), 0), ctx.org.currency)} en pipeline`} />
      {canWrite && (
        <Card className="mb-6" title="Nueva oportunidad">
          <ActionForm action={saveOpportunity} className="grid items-end gap-3 sm:grid-cols-5">
            <Field label="Título"><input name="title" required className={input} /></Field>
            <Field label="Cliente">
              <RecordPicker name="customerId" label="Cliente" search={lookupCustomers} create={ctx.can("crm.customers.write") ? quickCreateCustomer : undefined} />
            </Field>
            <Field label="Valor"><input name="amount" type="number" min="0" className={input} /></Field>
            <Field label="Responsable">
              <select name="ownerId" defaultValue={ctx.user.id} className={input}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            </Field>
            <SubmitButton className={btn.primary}>Crear</SubmitButton>
          </ActionForm>
        </Card>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {wf.states.map((s) => {
          const items = opps.filter((o) => o.status === s.key);
          return (
            <div key={s.key} className="w-72 shrink-0 rounded-xl bg-slate-100/70 p-2">
              <div className="flex items-center justify-between px-2 py-1.5">
                <p className="text-sm font-semibold text-slate-700">{s.label} <span className="font-normal text-slate-400">{items.length}</span></p>
                <p className="text-xs text-slate-500">{money(items.reduce((a, o) => a + Number(o.amount), 0), ctx.org.currency)}</p>
              </div>
              <div className="space-y-2">
                {items.map((o) => (
                  <div key={o.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="text-sm font-medium text-slate-800">{o.title}</p>
                    <p className="text-xs text-slate-500">{o.customer?.name ?? "Sin cliente"}</p>
                    <p className="mt-1 text-sm font-semibold">{money(o.amount, ctx.org.currency)}</p>
                    <p className="text-[11px] text-slate-400">{o.ownerId ? userMap.get(o.ownerId) : "—"} · actividad {ago(o.lastActivityAt)}</p>
                    {canWrite && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {transitionsByOpp.get(o.id)!.map((t) => (
                          <ActionForm key={t.id} action={transitionAction}>
                            <input type="hidden" name="entityType" value="opportunity" />
                            <input type="hidden" name="entityId" value={o.id} />
                            <input type="hidden" name="transitionId" value={t.id} />
                            <SubmitButton className={btn.small} pendingText="…">{t.label}</SubmitButton>
                          </ActionForm>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
