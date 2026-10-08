import { requirePermission } from "@/lib/core/context";
import { MODULES } from "@/lib/modules/registry";
import { AppIcon } from "@/components/app-icons";
import { Badge, btn, PageHeader } from "@/components/ui";
import { toggleModule } from "../actions";

export const metadata = { title: "Aplicaciones" };

export default async function Modules() {
  const ctx = await requirePermission("org.modules.manage");
  const groups = [...new Set(MODULES.map((m) => m.group))];
  return (
    <>
      <PageHeader title="Aplicaciones" subtitle="Activa solo lo que usa la empresa. Las apps desactivadas desaparecen del inicio, la API, Radar, la búsqueda y Ask ORKEST." />
      {groups.map((g) => (
        <section key={g} className="mb-8">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{g}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.filter((m) => m.group === g).map((m) => {
              const on = ctx.modules.has(m.key);
              return (
                <div key={m.key} className={`flex gap-4 rounded-2xl border bg-white/90 p-5 ${on ? "border-[var(--ork-violet)]/50 shadow-[0_6px_20px_rgba(111,53,181,.12)]" : "border-[var(--ork-rule)]"} ${m.status === "planned" ? "opacity-60" : ""}`}>
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-black/[0.06] bg-white shadow-sm"><AppIcon name={m.key} size={34} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{m.name}</p>
                      {m.status === "planned" ? <Badge>Próximamente</Badge> : on ? <Badge tone="violet">Activa</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{m.description}</p>
                    {m.dependsOn && <p className="mt-1 text-xs text-slate-400">Requiere: {m.dependsOn.join(", ")}</p>}
                    {m.status === "available" && (
                      <form action={toggleModule} className="mt-3"><input type="hidden" name="key" value={m.key} /><button className={on ? btn.small : `${btn.small} !border-[var(--ork-purple)] !bg-[var(--ork-purple)] !text-white`}>{on ? "Desactivar" : "Activar"}</button></form>
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
