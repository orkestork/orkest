import { requirePermission } from "@/lib/core/context";
import { MODULES, getModule } from "@/lib/modules/registry";
import { MODULE_LABEL } from "@/lib/launcher";

const label = (k: string) => MODULE_LABEL[k] ?? getModule(k)?.name ?? k;
import { AppIcon } from "@/components/app-icons";
import { Badge, btn, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { toggleModule } from "../actions";

export const metadata = { title: "Aplicaciones" };

export default async function Modules() {
  const ctx = await requirePermission("org.modules.manage");
  const groups = [...new Set(MODULES.map((m) => m.group))];
  return (
    <>
      <PageHeader title="Aplicaciones" subtitle="Activa solo lo que usa la empresa. Las apps desactivadas desaparecen del inicio, la API, Radar, la búsqueda y Ask Workezt." />
      {groups.map((g) => (
        <section key={g} className="mb-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-[var(--ork-ink)]">{g}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.filter((m) => m.group === g).map((m) => {
              const on = ctx.modules.has(m.key);
              const usedBy = on ? [...ctx.modules].filter((k) => getModule(k)?.dependsOn?.includes(m.key)).map(label) : [];
              const needs = (m.dependsOn ?? []).map(label);
              return (
                <div key={m.key} className={`flex gap-4 rounded-2xl border bg-white/90 p-5 ${on ? "border-[var(--ork-violet)]/40 shadow-[0_6px_20px_rgba(124,58,237,.10)]" : "border-[var(--ork-rule)]"} ${m.status === "planned" ? "opacity-60" : ""}`}>
                  <span className="shrink-0 drop-shadow-md"><AppIcon name={m.key} size={52} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{label(m.key)}</p>
                      {m.status === "planned" ? <Badge>Próximamente</Badge> : on ? <Badge tone="violet">Activa</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{m.description}</p>
                    {needs.length > 0 && <p className="mt-1 text-xs text-slate-400">Requiere: {needs.join(", ")}{!on && " (se activan junto con esta)"}</p>}
                    {m.status === "available" && (
                      usedBy.length > 0 ? (
                        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600" title="Desactiva primero las apps que la usan">
                          <span aria-hidden="true">🔒</span>En uso por {usedBy.join(", ")}
                        </p>
                      ) : (
                        <ActionForm action={toggleModule} className="mt-3"><input type="hidden" name="key" value={m.key} />
                          <SubmitButton pendingText={on ? "Desactivando…" : "Activando…"} className={on ? btn.small : `${btn.small} !border-[var(--ork-purple)] !bg-[var(--ork-purple)] !text-white`}>{on ? "Desactivar" : "Activar"}</SubmitButton>
                        </ActionForm>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
