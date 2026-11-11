import { requireModule } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, PageHeader } from "@/components/ui";
import { money } from "@/lib/ui/format";
import { addMonths, FIN_CATEGORIES, loadFinance, monthLabel } from "@/lib/apps/finance";
import { copyBudget, updateBudget } from "../actions";
import { Bar, MonthNav, monthParam } from "../shared";

export const metadata = { title: "Presupuesto · Finanzas" };

export default async function Budget({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await requireModule("finance", "finance.read");
  const ym = await monthParam(searchParams);
  const f = await loadFinance(ctx, ym);
  const cur = ctx.org.currency;
  const canWrite = ctx.can("finance.write");
  const groups = [...new Set(FIN_CATEGORIES.map((c) => c.group))];
  const total = Object.values(f.budget).reduce((a, b) => a + b, 0);
  const spent = FIN_CATEGORIES.reduce((a, c) => a + (f.budget[c.id] ? f.cost.by[c.id] ?? 0 : 0), 0);

  return (
    <>
      <PageHeader
        title="Presupuesto"
        subtitle={total ? `${money(total, cur)} presupuestados para ${monthLabel(ym)} · ${money(spent, cur)} ejecutados en esas categorías.` : `Define cuánto esperas gastar en ${monthLabel(ym)} por categoría.`}
        actions={<MonthNav ym={ym} path="/finance/budget" />}
      />

      {canWrite && (
        <div className="mb-4 flex justify-end">
          <ActionForm action={copyBudget} className="flex items-center gap-2">
            <input type="hidden" name="month" value={ym} />
            <SubmitButton className={btn.small} pendingText="Copiando…">Copiar de {monthLabel(addMonths(ym, -1), { month: "long" })}</SubmitButton>
          </ActionForm>
        </div>
      )}

      <ActionForm action={updateBudget}>
        <input type="hidden" name="month" value={ym} />
        <div className="grid gap-6 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g} title={g}>
              <ul className="space-y-4">
                {FIN_CATEGORIES.filter((c) => c.group === g).map((c) => {
                  const b = f.budget[c.id] ?? 0;
                  const s = f.cost.by[c.id] ?? 0;
                  const over = b > 0 && s > b;
                  return (
                    <li key={c.id} className="grid grid-cols-[1fr_9rem] items-center gap-x-4 gap-y-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-700">{c.label}</p>
                        <p className={`text-xs ${over ? "text-rose-600" : "text-slate-400"}`}>
                          Real {money(s, cur)}{b > 0 && ` · ${Math.round((s / b) * 100)} %`}
                        </p>
                      </div>
                      {canWrite ? (
                        <input type="number" name={`b:${c.id}`} min="0" step="any" defaultValue={b || ""} placeholder="0" aria-label={`Presupuesto ${c.label}`}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-right font-mono text-sm tabular-nums outline-none focus:border-[var(--brand)]" />
                      ) : (
                        <span className="text-right font-mono text-sm tabular-nums">{money(b, cur)}</span>
                      )}
                      <div className="col-span-2"><Bar value={s} max={b || s} over={over} /></div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
        {canWrite && (
          <div className="sticky bottom-4 mt-6 flex justify-end">
            <SubmitButton className={`${btn.primary} shadow-lg`}>Guardar presupuesto</SubmitButton>
          </div>
        )}
      </ActionForm>
    </>
  );
}
