import { requirePermission } from "@/lib/core/context";
import { CORE_PERMISSIONS, hasPermission } from "@/lib/core/permissions";
import { MODULES } from "@/lib/modules/registry";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { saveRole } from "../actions";

export const metadata = { title: "Roles y permisos" };

export default async function Roles() {
  const ctx = await requirePermission("org.roles.manage");
  const roles = await ctx.db.role.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { memberships: true } } } });
  const customs = await ctx.db.customEntity.findMany({ where: { active: true } });
  const groups = [
    { name: "Core", perms: CORE_PERMISSIONS },
    ...MODULES.filter((m) => ctx.hasModule(m.key)).map((m) => ({ name: m.name, perms: m.permissions })),
    ...customs.map((c) => ({ name: `${c.labelPlural} (Studio)`, perms: [{ key: `custom.${c.key}.read`, label: `Ver ${c.labelPlural.toLowerCase()}` }, { key: `custom.${c.key}.write`, label: `Crear / avanzar ${c.labelPlural.toLowerCase()}` }] })),
  ];
  const Matrix = ({ granted }: { granted: string[] }) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <fieldset key={g.name} className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">{g.name}</legend>
          {g.perms.map((p) => (
            <label key={p.key} className="flex items-center gap-2 py-0.5 text-sm">
              <input type="checkbox" name="permissions" value={p.key} defaultChecked={hasPermission(granted, p.key)} className="accent-[var(--ork-violet)]" />
              {p.label}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
  return (
    <>
      <PageHeader title="Roles y permisos" subtitle="Los roles también definen quién aprueba en workflows y reglas (por su clave). Nadie puede otorgar permisos que no tiene." />
      <div className="space-y-4">
        {roles.map((r) => (
          <details key={r.id} className="rounded-2xl border border-[var(--ork-rule)] bg-white/90 p-4">
            <summary className="cursor-pointer text-sm"><b>{r.name}</b> <code className="text-xs text-slate-400">{r.key}</code> · {r._count.memberships} usuario(s) {r.isSystem && "· sistema"}</summary>
            {r.isSystem ? <p className="mt-3 text-sm text-slate-500">Acceso total. No editable.</p> : (
              <ActionForm action={saveRole} className="mt-4 space-y-4">
                <input type="hidden" name="id" value={r.id} />
                <Field label="Nombre"><input name="name" defaultValue={r.name} className={`${input} max-w-sm`} /></Field>
                <Matrix granted={r.permissions} />
                <SubmitButton className={btn.primary}>Guardar rol</SubmitButton>
              </ActionForm>
            )}
          </details>
        ))}
        <Card title="Nuevo rol">
          <ActionForm action={saveRole} className="space-y-4">
            <div className="grid max-w-xl gap-3 sm:grid-cols-2">
              <Field label="Clave *"><input name="key" required placeholder="PLANT_MANAGER" className={input} /></Field>
              <Field label="Nombre *"><input name="name" required className={input} /></Field>
            </div>
            <Matrix granted={[]} />
            <SubmitButton className={btn.primary}>Crear rol</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
