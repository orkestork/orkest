import { notFound } from "next/navigation";
import type { OrgContext } from "@/lib/core/context";
import { prisma } from "@/lib/core/prisma";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader } from "@/components/ui";
import { canManageTicket, isTicketOverdue, parseFields, TICKET_SLA_LABELS } from "@/lib/apps/hr";
import { fileUrl } from "@/lib/core/files";
import { dateTime } from "@/lib/ui/format";
import { TICKET_EVENT, TICKET_PRIORITY, TICKET_STATUS, optsT } from "@/lib/ui/hr-labels";
import { commentTicketAction, updateTicketAction } from "../actions";
import { Pill, Select } from "../_ui";

/** Detalle de una solicitud interna: lo usan talento humano (/hr/tickets) y el portal (/empleado/solicitudes). */
export async function TicketView({ ctx, id, back }: { ctx: OrgContext; id: string; back: { label: string; href: string } }) {
  const t = await ctx.db.hrTicket.findFirst({
    where: { id },
    include: { category: true, employee: { select: { name: true, userId: true, department: { select: { name: true } } } }, comments: { orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "asc" } } },
  });
  if (!t || !(await canManageTicket(ctx, t))) notFound();
  const files = await ctx.db.fileObject.findMany({ where: { entityType: "hr_ticket", entityId: id }, select: { id: true, name: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  const userIds = [...new Set([...t.comments.map((c) => c.userId), ...t.events.map((e) => e.actorId), t.responsibleId].filter(Boolean) as string[])];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const nameOf = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "Sistema";
  const privileged = ctx.can("hr.tickets.write");
  const isOwner = t.employee.userId === ctx.actorId;
  const isResponsible = t.responsibleId === ctx.actorId;
  const canWork = privileged || isResponsible || !isOwner;
  const closed = ["FINALIZADO", "CANCELADO"].includes(t.status);
  const fields = parseFields(t.category.fieldsSchema);
  const extra = (t.extraFields ?? {}) as Record<string, string>;
  // Candidatos a responsable: colaboradores de los departamentos habilitados (o todos)
  const candidates = privileged ? await ctx.db.employee.findMany({
    where: { userId: { not: null }, status: { not: "TERMINATED" }, ...(t.category.allowedDepartmentIds.length ? { departmentId: { in: t.category.allowedDepartmentIds } } : {}) },
    select: { userId: true, name: true }, orderBy: { name: "asc" },
  }) : [];
  const timeline = [
    ...t.comments.map((c) => ({ at: c.createdAt, kind: "comment" as const, who: nameOf(c.userId), text: c.message })),
    ...t.events.filter((e) => e.type !== "COMMENT").map((e) => ({ at: e.createdAt, kind: "event" as const, who: nameOf(e.actorId), text: `${TICKET_EVENT[e.type] ?? e.type}${e.fromValue || e.toValue ? `: ${e.type === "STATUS" ? `${TICKET_STATUS[e.fromValue ?? ""]?.label ?? e.fromValue ?? ""} → ${TICKET_STATUS[e.toValue ?? ""]?.label ?? e.toValue}` : e.type === "PRIORITY" ? `${TICKET_PRIORITY[e.fromValue ?? ""]?.label ?? ""} → ${TICKET_PRIORITY[e.toValue ?? ""]?.label ?? ""}` : [e.fromValue, e.toValue].filter(Boolean).join(" → ")}` : ""}` })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <>
      <PageHeader title={t.subject} crumbs={[back, { label: t.code }]}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{t.code}</span> · {t.category.name} <Pill map={TICKET_STATUS} value={t.status} /> <Pill map={TICKET_PRIORITY} value={t.priority} />
          {isTicketOverdue(t) && <Badge tone="rose">Vencida</Badge>}</span>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Descripción">
            <p className="whitespace-pre-line text-sm">{t.description}</p>
            {(fields.length > 0 || t.location) && (
              <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                {t.location && <div><dt className="text-xs text-slate-500">Ubicación</dt><dd>{t.location}</dd></div>}
                {fields.map((f) => <div key={f.key}><dt className="text-xs text-slate-500">{f.label}</dt><dd>{f.type === "boolean" ? (extra[f.key] === "true" || extra[f.key] === "on" ? "Sí" : "No") : extra[f.key] || "—"}</dd></div>)}
              </dl>
            )}
            {files.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {files.map((f) => <li key={f.id}><a href={fileUrl(f.id)} target="_blank" className={btn.small}>{f.name}</a></li>)}
              </ul>
            )}
          </Card>
          <Card title="Conversación e historial">
            <ol className="space-y-3">
              {timeline.map((i, k) => i.kind === "comment" ? (
                <li key={k} className="rounded-xl bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500"><span className="font-medium text-slate-700">{i.who}</span> · {dateTime(i.at)}</p><p className="mt-1 whitespace-pre-line text-sm">{i.text}</p></li>
              ) : (
                <li key={k} className="pl-4 text-xs text-slate-500">· <span className="font-medium">{i.who}</span> {i.text} <span className="text-slate-400">· {dateTime(i.at)}</span></li>
              ))}
            </ol>
            {!closed && (
              <ActionForm action={commentTicketAction} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <input type="hidden" name="id" value={t.id} />
                <textarea name="message" rows={3} placeholder="Escribe un comentario…" className={input} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input type="file" name="files" multiple className="text-xs" />
                  <SubmitButton className={btn.primary}>Comentar</SubmitButton>
                </div>
              </ActionForm>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Detalle">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-slate-500">Solicitante</dt><dd>{t.employee.name}{t.employee.department ? ` · ${t.employee.department.name}` : ""}</dd></div>
              <div><dt className="text-xs text-slate-500">Responsable</dt><dd>{t.responsibleId ? nameOf(t.responsibleId) : "Sin asignar"}</dd></div>
              <div><dt className="text-xs text-slate-500">Creada</dt><dd>{dateTime(t.createdAt)}</dd></div>
              <div><dt className="text-xs text-slate-500">Fecha límite (SLA {TICKET_SLA_LABELS[t.priority]})</dt><dd>{dateTime(t.dueDate)}</dd></div>
              {t.resolvedAt && <div><dt className="text-xs text-slate-500">Resuelta</dt><dd>{dateTime(t.resolvedAt)}</dd></div>}
            </dl>
          </Card>
          {canWork && !closed && (
            <Card title="Gestionar">
              <ActionForm action={updateTicketAction} className="space-y-3">
                <input type="hidden" name="id" value={t.id} />
                <Field label="Estado"><Select name="status" defaultValue={t.status} options={optsT(TICKET_STATUS)} /></Field>
                {privileged && <>
                  <Field label="Prioridad"><Select name="priority" defaultValue={t.priority} options={optsT(TICKET_PRIORITY)} /></Field>
                  <Field label="Responsable"><Select name="responsibleId" defaultValue={t.responsibleId} empty="Sin asignar" options={candidates.map((c) => ({ value: c.userId!, label: c.name }))} /></Field>
                </>}
                <SubmitButton className={btn.primary}>Guardar</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {isOwner && !privileged && !isResponsible && t.status === "PENDIENTE" && (
            <Card title="Mi solicitud">
              <ActionForm action={updateTicketAction} className="space-y-2">
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="status" value="CANCELADO" />
                <p className="text-xs text-slate-500">Puedes cancelarla mientras nadie la haya tomado.</p>
                <SubmitButton className={btn.danger}>Cancelar solicitud</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
