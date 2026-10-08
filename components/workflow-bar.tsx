import type { OrgContext } from "@/lib/core/context";
import { availableTransitions } from "@/lib/core/workflow";
import { ActionForm, SubmitButton } from "./action-form";
import { transitionAction } from "@/app/(app)/entity-actions";
import { btn } from "./ui";

const DOT: Record<string, string> = {
  slate: "bg-slate-400", blue: "bg-blue-500", indigo: "bg-indigo-500", amber: "bg-amber-500",
  emerald: "bg-emerald-500", rose: "bg-rose-500", violet: "bg-violet-500", cyan: "bg-cyan-500",
};

/** Barra de estados + transiciones disponibles (calculadas por el Workflow Engine). */
export async function WorkflowBar({ ctx, entityType, entity }: { ctx: OrgContext; entityType: string; entity: Record<string, unknown> }) {
  const { workflow, transitions } = await availableTransitions(ctx, entityType, entity);
  if (!workflow) return null;
  const currentIdx = workflow.states.findIndex((s) => s.key === entity.status);
  return (
    <div className="rounded-2xl border border-[var(--ork-rule)] bg-white/90 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        {workflow.states.map((s, i) => {
          const current = s.key === entity.status;
          return (
            <span key={s.key} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${current ? "bg-[var(--ork-purple)] font-medium text-white" : i < currentIdx ? "bg-slate-100 text-slate-600" : "text-slate-400"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.color] ?? DOT.slate}`} />
              {s.label}
            </span>
          );
        })}
      </div>
      {transitions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-slate-100 pt-3">
          {transitions.map((t) => (
            <ActionForm key={t.id} action={transitionAction}>
              <input type="hidden" name="entityType" value={entityType} />
              <input type="hidden" name="entityId" value={String(entity.id)} />
              <input type="hidden" name="transitionId" value={t.id} />
              <SubmitButton className={t.toKey === "rejected" || t.toKey === "lost" ? btn.danger : btn.primary} pendingText="Procesando…">
                {t.label}{t.requiresApproval ? ` · requiere aprobación ${t.approvalRole}` : ""}
              </SubmitButton>
            </ActionForm>
          ))}
        </div>
      )}
    </div>
  );
}

export async function stateLabel(ctx: OrgContext, entityType: string) {
  const wf = await ctx.db.workflow.findFirst({ where: { entityType, isDefault: true }, include: { states: true } });
  const map = new Map(wf?.states.map((s) => [s.key, s]) ?? []);
  return (key: string) => map.get(key) ?? { label: key, color: "slate" };
}
