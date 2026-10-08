import { requirePermission } from "@/lib/core/context";
import { CORE_PERMISSIONS } from "@/lib/core/permissions";
import { MODULES } from "@/lib/modules/registry";
import { EVENTS } from "@/lib/core/event-catalog";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { ago } from "@/lib/ui/format";
import { createApiKey, createWebhook, retryDelivery, revokeApiKey, toggleWebhook } from "../actions";

export const metadata = { title: "API y webhooks" };

export default async function Integrations() {
  const ctx = await requirePermission("integrations.manage");
  const [hooks, deliveries, keys] = await Promise.all([
    ctx.db.webhookEndpoint.findMany({ orderBy: { createdAt: "desc" } }),
    ctx.db.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    ctx.db.apiKey.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const scopes = [...MODULES.filter((m) => ctx.hasModule(m.key)).flatMap((m) => m.permissions), ...CORE_PERMISSIONS.filter((p) => p.key === "import.run")].filter((p) => ctx.can(p.key));
  const webhookEvents = EVENTS.filter((e) => !e.module || ctx.hasModule(e.module)).map((e) => e.webhook);

  return (
    <>
      <PageHeader title="API y webhooks" subtitle="API REST en /api/v1 con llaves por organización y permisos acotados. Webhooks firmados (HMAC-SHA256) con reintentos, registro de entregas e idempotencia." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Webhooks" padded={false}>
            <Table head={["Destino", "Eventos", "Estado", ""]} empty={hooks.length === 0}>
              {hooks.map((h) => (
                <tr key={h.id}>
                  <td className={td}><p className="break-all font-mono text-xs">{h.url}</p><p className="text-xs text-slate-400">{h.description}</p></td>
                  <td className={td}><div className="flex flex-wrap gap-1">{h.events.map((e) => <Badge key={e}>{e}</Badge>)}</div></td>
                  <td className={td}><Badge tone={h.active ? "emerald" : "slate"}>{h.active ? "Activo" : "Pausado"}</Badge></td>
                  <td className={td}><form action={toggleWebhook}><input type="hidden" name="id" value={h.id} /><button className={btn.ghost}>{h.active ? "Pausar" : "Activar"}</button></form></td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Entregas recientes" padded={false}>
            <Table head={["Evento", "Estado", "Intentos", "Respuesta", ""]} empty={deliveries.length === 0}>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td className={td}><p className="font-mono text-xs">{d.eventName}</p><p className="text-xs text-slate-400">{ago(d.createdAt)}</p></td>
                  <td className={td}><Badge tone={d.status === "SUCCESS" ? "emerald" : d.status === "PENDING" ? "amber" : "rose"}>{d.status}</Badge></td>
                  <td className={td}>{d.attempts}</td>
                  <td className={td}>{d.responseCode ?? d.lastError ?? "—"}</td>
                  <td className={td}>{d.status !== "SUCCESS" && <form action={retryDelivery}><input type="hidden" name="id" value={d.id} /><button className={btn.small}>Reintentar</button></form>}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="API keys" padded={false}>
            <Table head={["Nombre", "Prefijo", "Permisos", "Último uso", ""]} empty={keys.length === 0}>
              {keys.map((k) => (
                <tr key={k.id} className={k.revokedAt ? "opacity-50" : ""}>
                  <td className={td}>{k.name}</td>
                  <td className={`${td} font-mono text-xs`}>ok_{k.prefix}_…</td>
                  <td className={td}><span className="text-xs">{k.scopes.join(", ")}</span></td>
                  <td className={td}>{k.lastUsedAt ? ago(k.lastUsedAt) : "Nunca"}</td>
                  <td className={td}>{!k.revokedAt && <form action={revokeApiKey}><input type="hidden" name="id" value={k.id} /><button className="text-xs text-[var(--ork-pink)] hover:underline">Revocar</button></form>}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Nuevo webhook">
            <ActionForm action={createWebhook} className="space-y-3">
              <Field label="URL *"><input name="url" type="url" required className={input} placeholder="https://…" /></Field>
              <Field label="Descripción"><input name="description" className={input} /></Field>
              <Field label="Eventos *" hint={`Separados por coma. Comodines: * o quote.*. Ej: ${webhookEvents.slice(0, 6).join(", ")}…`}><input name="events" required className={input} placeholder="quote.created, invoice.*" /></Field>
              <SubmitButton className={btn.primary}>Crear webhook</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Nueva API key">
            <ActionForm action={createApiKey} className="space-y-3">
              <Field label="Nombre"><input name="name" className={input} placeholder="Integración tienda" /></Field>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {scopes.map((p) => <label key={p.key} className="flex items-center gap-2 text-xs"><input type="checkbox" name="scopes" value={p.key} />{p.key}</label>)}
              </div>
              <SubmitButton className={btn.primary}>Generar llave</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
