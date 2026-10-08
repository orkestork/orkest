import Link from "next/link";
import { prisma } from "@/lib/core/prisma";
import { requirePlatformAdmin } from "@/lib/core/context";
import { Badge, Card, Stat } from "@/components/ui";
import { logout } from "@/app/login/actions";
import { platformOrgAction } from "./actions";

export const metadata = { title: "Panel OR-K" };

/**
 * Panel global de OR-K. Solo métricas de uso y configuración de la cuenta del cliente:
 * NUNCA se consultan aquí datos de negocio (clientes, precios, documentos) de las organizaciones.
 */
export default async function Platform() {
  const admin = await requirePlatformAdmin();
  const [orgs, plans, flags, users, audit] = await Promise.all([
    prisma.organization.findMany({ orderBy: { createdAt: "asc" }, include: { subscription: true, modules: { where: { enabled: true } }, featureFlags: true, _count: { select: { memberships: true } } } }),
    prisma.plan.findMany(), prisma.featureFlag.findMany(), prisma.user.count(),
    prisma.platformAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const since = new Date(Date.now() - 30 * 86400000);
  const usage = await Promise.all(orgs.map(async (o) => ({
    id: o.id,
    events: await prisma.domainEvent.count({ where: { organizationId: o.id, createdAt: { gte: since } } }),
    storage: await prisma.fileObject.aggregate({ where: { organizationId: o.id }, _sum: { size: true } }),
  })));
  const u = new Map(usage.map((x) => [x.id, x]));
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  return (
    <main className="ork-canvas min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/brand/ork-logo-violet.png" alt="OR-K" className="h-8 w-auto" />
            <span className="font-display text-2xl uppercase tracking-tight">Panel ORKEST</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-stone-600">{admin.name}</span>
            <Link href="/onboarding/new" className="text-[var(--ork-violet)] underline">Crear organización</Link>
            <form action={logout}><button className="text-stone-600 hover:underline">Cerrar sesión</button></form>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Organizaciones" value={orgs.length} hint={`${orgs.filter((o) => o.status === "ACTIVE").length} activas`} />
          <Stat label="Usuarios" value={users} />
          <Stat label="Suscripciones de pago" value={orgs.filter((o) => o.subscription?.status === "ACTIVE").length} hint={`${orgs.filter((o) => o.subscription?.status === "TRIAL").length} en prueba`} />
          <Stat label="Eventos (30 días)" value={usage.reduce((s, x) => s + x.events, 0).toLocaleString("es-CO")} hint="Actividad de la plataforma" />
        </div>

        <Card title="Organizaciones" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b border-stone-200 text-left text-[13px] font-semibold"><th className="px-4 py-2.5">Organización</th><th className="px-3">Plan</th><th className="px-3">Estado</th><th className="px-3 text-right">Usuarios</th><th className="px-3 text-right">Apps</th><th className="px-3 text-right">Eventos 30 d</th><th className="px-3">Acciones</th></tr></thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-b border-stone-100">
                    <td className="px-4 py-3"><p className="font-semibold">{o.name}</p><p className="text-xs text-stone-500">{o.industry ?? "—"} · desde {o.createdAt.toLocaleDateString("es-CO")}</p></td>
                    <td className="px-3">
                      <form action={platformOrgAction} className="flex gap-1">
                        <input type="hidden" name="orgId" value={o.id} /><input type="hidden" name="op" value="plan" />
                        <select name="planKey" defaultValue={o.subscription?.planKey ?? ""} className="rounded-md border border-stone-300 px-2 py-1 text-xs" aria-label="Plan">{plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select>
                        <button className="rounded-md border border-stone-300 px-2 py-1 text-xs hover:border-[var(--ork-violet)]">Cambiar</button>
                      </form>
                      <p className="mt-1 text-[11px] text-stone-500">{o.subscription?.status === "TRIAL" ? "En prueba" : o.subscription?.status === "ACTIVE" ? "Activa" : "Sin suscripción"}</p>
                    </td>
                    <td className="px-3"><Badge tone={o.status === "ACTIVE" ? "emerald" : "rose"}>{o.status === "ACTIVE" ? "Activa" : o.status === "SUSPENDED" ? "Suspendida" : o.status}</Badge></td>
                    <td className="px-3 text-right tabular-nums">{o._count.memberships}</td>
                    <td className="px-3 text-right tabular-nums">{o.modules.length}</td>
                    <td className="px-3 text-right tabular-nums">{u.get(o.id)?.events.toLocaleString("es-CO")}</td>
                    <td className="px-3">
                      <form action={platformOrgAction}>
                        <input type="hidden" name="orgId" value={o.id} /><input type="hidden" name="op" value="status" />
                        <input type="hidden" name="status" value={o.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"} />
                        <button className={`rounded-md px-2 py-1 text-xs font-medium ${o.status === "SUSPENDED" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{o.status === "SUSPENDED" ? "Reactivar" : "Suspender"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Feature flags por organización">
            <div className="space-y-4">
              {flags.map((f) => (
                <div key={f.key}>
                  <p className="text-sm font-medium">{f.description} <code className="text-xs text-stone-500">{f.key}</code> · por defecto {f.defaultEnabled ? "activo" : "inactivo"}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {orgs.map((o) => {
                      const on = o.featureFlags.find((x) => x.flagKey === f.key)?.enabled ?? f.defaultEnabled;
                      return (
                        <form key={o.id} action={platformOrgAction}>
                          <input type="hidden" name="orgId" value={o.id} /><input type="hidden" name="op" value="flag" /><input type="hidden" name="flagKey" value={f.key} /><input type="hidden" name="enabled" value={on ? "0" : "1"} />
                          <button className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-[var(--ork-violet)] bg-[var(--ork-lavender)]/25 text-[var(--ork-purple)]" : "border-stone-300 text-stone-500"}`}>{on ? "✓" : "○"} {o.name}</button>
                        </form>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Auditoría de plataforma" padded={false}>
            <ul className="divide-y divide-stone-100 text-sm">
              {audit.map((a) => <li key={a.id} className="flex justify-between gap-2 px-5 py-2"><span><code className="text-xs">{a.action}</code> · {orgName.get(a.targetOrg ?? "") ?? "—"}</span><span className="text-xs text-stone-500">{a.createdAt.toLocaleString("es-CO")}</span></li>)}
              {audit.length === 0 && <li className="px-5 py-4 text-stone-500">Sin acciones registradas.</li>}
            </ul>
          </Card>
        </div>
        <p className="mt-6 text-xs text-stone-500">Por diseño, este panel no muestra datos de negocio de las organizaciones (clientes, documentos, precios): solo cuenta, plan, estado y volumen de uso.</p>
      </div>
    </main>
  );
}
