import Link from "@/components/plink";
import { requirePermission } from "@/lib/core/context";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "ORKEST Studio" };

export default async function Studio() {
  const ctx = await requirePermission("studio.manage");
  const [fields, workflows, automations, templates] = await Promise.all([
    ctx.db.customFieldDefinition.count(), ctx.db.workflow.count(), ctx.db.automation.count(), ctx.db.documentTemplate.count(),
  ]);
  const objects = await ctx.db.customEntity.count();
  const tiles = [
    { href: "/studio/objects", title: "Objetos personalizados", desc: "Crea entidades propias (visitas, solicitudes, inspecciones…) con campos, líneas, flujo y permisos. Aparecen como apps.", n: objects },
    { href: "/studio/fields", title: "Custom Fields", desc: "Extiende clientes, productos, cotizaciones, proveedores… con 14 tipos de campo y validaciones.", n: fields },
    { href: "/studio/workflows", title: "Workflows · Pipelines · Estados", desc: "Estados, transiciones, condiciones, permisos y aprobaciones por umbral.", n: workflows },
    ...(ctx.hasModule("automations") ? [{ href: "/studio/automations", title: "Business Rules & Automations", desc: "WHEN evento · IF condiciones · THEN acciones. Aisladas por organización.", n: automations }] : []),
    { href: "/studio/dashboards", title: "Dashboards", desc: "Elige los indicadores y paneles de la página de inicio.", n: null },
    { href: "/studio/templates", title: "Document Templates", desc: "Plantillas de documentos con variables {{campo}}.", n: templates },
    { href: "/settings/roles", title: "Roles & Approvals", desc: "Roles, permisos y quién aprueba qué.", n: null },
    { href: "/settings", title: "Branding", desc: "Nombre visible y color corporativo del workspace.", n: null },
  ];
  return (
    <>
      <PageHeader title="ORKEST Studio" subtitle={`Configura ORKEST para ${ctx.org.name} sin modificar código. Nada de lo que cambies aquí afecta a otras organizaciones.`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="group rounded-2xl border border-[var(--ork-rule)] bg-white/90 p-5 shadow-sm transition hover:border-[var(--brand)]">
            <div className="flex items-center justify-between"><h2 className="font-semibold">{t.title}</h2>{t.n !== null && <span className="text-sm text-slate-400">{t.n}</span>}</div>
            <p className="mt-1 text-sm text-slate-500">{t.desc}</p>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-xs text-slate-400">Vistas personalizadas, formularios por rol y reportes ad-hoc están previstos en el modelo (SavedView) para próximas iteraciones de Studio.</p>
    </>
  );
}
