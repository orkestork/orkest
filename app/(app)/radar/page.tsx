import Link from "@/components/plink";
import { revalidatePath } from "next/cache";
import { requireModule, actionContext } from "@/lib/core/context";
import { runRadar, DETECTORS } from "@/lib/radar/engine";
import { visibleInsightWhere } from "@/lib/radar/visibility";
import { ENTITIES } from "@/lib/core/entities";
import { orgUsers } from "@/lib/core/members";
import { Badge, btn, Card, PageHeader, SEVERITY_LABEL, SEVERITY_TONE, Stat } from "@/components/ui";
import { ago } from "@/lib/ui/format";

export const metadata = { title: "Radar" };

const KIND: Record<string, string> = { RISK: "Riesgo", OPPORTUNITY: "Oportunidad", EXCEPTION: "Excepción", DELAY: "Retraso", ANOMALY: "Anomalía", PENDING_ACTION: "Acción pendiente" };

async function scan() {
  "use server";
  const ctx = await actionContext("radar.read", "radar");
  await runRadar(ctx);
  revalidatePath("/radar");
}

async function setStatus(form: FormData) {
  "use server";
  const ctx = await actionContext("radar.manage", "radar");
  const status = String(form.get("status"));
  await ctx.db.insight.update({ where: { id: String(form.get("id")) }, data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null } });
  revalidatePath("/radar");
}

export default async function Radar({ searchParams }: PageProps<"/radar">) {
  const ctx = await requireModule("radar", "radar.read");
  const { status = "OPEN" } = await searchParams;
  const st = typeof status === "string" ? status : "OPEN";
  const [insights, counts, users] = await Promise.all([
    ctx.db.insight.findMany({ where: { ...visibleInsightWhere(ctx), status: st === "ALL" ? undefined : st === "OPEN" ? { not: "RESOLVED" } : st }, orderBy: { detectedAt: "desc" } }),
    ctx.db.insight.groupBy({ by: ["severity"], where: { ...visibleInsightWhere(ctx), status: { not: "RESOLVED" } }, _count: true }),
    orgUsers(ctx),
  ]);
  const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  insights.sort((a, b) => order[a.severity] - order[b.severity]);
  const c = (s: string) => counts.find((x) => x.severity === s)?._count ?? 0;
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const active = DETECTORS.filter((d) => ctx.hasModule(d.module));

  return (
    <>
      <PageHeader title="ORKEST Radar" subtitle={`${active.length} detectores activos: ${active.map((d) => d.label).join(" · ")}`}
        actions={<form action={scan}><button className={btn.primary}>Escanear ahora</button></form>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Críticas" value={c("CRITICAL")} /><Stat label="Altas" value={c("HIGH")} /><Stat label="Medias" value={c("MEDIUM")} /><Stat label="Bajas" value={c("LOW")} />
      </div>
      <div className="mb-4 flex gap-1.5">
        {[["OPEN", "Abiertas"], ["ACKNOWLEDGED", "En gestión"], ["RESOLVED", "Resueltas"], ["ALL", "Todas"]].map(([k, l]) => (
          <Link key={k} href={`/radar?status=${k}`} className={`${btn.small} ${st === k ? "!bg-[var(--ork-purple)] !text-white" : ""}`}>{l}</Link>
        ))}
      </div>
      <div className="space-y-3">
        {insights.map((i) => (
          <Card key={i.id}>
            <div className="flex flex-wrap items-start gap-3">
              <Badge tone={SEVERITY_TONE[i.severity]}>{SEVERITY_LABEL[i.severity]}</Badge>
              <Badge>{KIND[i.kind] ?? i.kind}</Badge>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {i.entityType && i.entityId && ENTITIES[i.entityType] ? <Link className="hover:underline" href={ENTITIES[i.entityType].path(i.entityId)}>{i.title}</Link> : i.title}
                </p>
                {i.detail && <p className="text-sm text-slate-500">{i.detail}</p>}
                <p className="mt-2 text-sm"><span className="font-medium text-[var(--brand)]">Acción recomendada:</span> {i.recommendedAction}</p>
                <p className="mt-1 text-xs text-slate-400">Responsable: {i.responsibleUserId ? userMap.get(i.responsibleUserId) ?? "—" : "Sin asignar"} · {i.detectorKey} · {ago(i.detectedAt)}</p>
              </div>
              {ctx.can("radar.manage") && i.status !== "RESOLVED" && (
                <div className="flex gap-1">
                  {i.status === "OPEN" && <form action={setStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="ACKNOWLEDGED" /><button className={btn.small}>Gestionar</button></form>}
                  <form action={setStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="RESOLVED" /><button className={btn.small}>Resolver</button></form>
                </div>
              )}
            </div>
          </Card>
        ))}
        {insights.length === 0 && <p className="py-10 text-center text-sm text-slate-400">Sin insights en este filtro.</p>}
      </div>
    </>
  );
}
