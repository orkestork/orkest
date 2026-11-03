import NextLink from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Empty, Field, input, PageHeader } from "@/components/ui";
import { parseFields, TICKET_LOCATIONS, TICKET_SLA_LABELS } from "@/lib/apps/hr";
import { TICKET_PRIORITY } from "@/lib/ui/hr-labels";
import { submitTicket } from "../../../hr/actions";
import { Select } from "../../../hr/_ui";
import { NoProfile, portal } from "../../_me";

export const metadata = { title: "Nueva solicitud" };

export default async function NewTicket({ searchParams }: PageProps<"/empleado/solicitudes/new">) {
  const { ctx, me } = await portal();
  if (!me) return <NoProfile title="Nueva solicitud" />;
  const categoryId = String((await searchParams).category ?? "");
  const all = await ctx.db.hrRequestCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const allowed = all.filter((c) => ctx.can("hr.tickets.write") || c.allowedDepartmentIds.length === 0 || (me.departmentId && c.allowedDepartmentIds.includes(me.departmentId)));
  const cat = allowed.find((c) => c.id === categoryId);
  const crumbs = [{ label: "Centro de solicitudes", href: "/empleado/solicitudes" }, { label: "Nueva" }];
  if (!cat) {
    return (
      <>
        <PageHeader title="¿Qué necesitas?" subtitle="Elige el tipo de solicitud." crumbs={crumbs} />
        {allowed.length === 0 ? <Empty title="No hay categorías disponibles para tu departamento." /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allowed.map((c) => (
              <NextLink key={c.id} href={`?category=${c.id}`} className="rounded-2xl border border-[var(--ork-rule)] bg-white/90 p-4 transition hover:border-[var(--ork-violet)]/50">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-slate-500">{parseFields(c.fieldsSchema).length ? `${parseFields(c.fieldsSchema).length} dato(s) adicionales` : "Solo asunto y descripción"}</p>
              </NextLink>
            ))}
          </div>
        )}
      </>
    );
  }
  const fields = parseFields(cat.fieldsSchema);
  // Con un solo departamento habilitado, el solicitante puede elegir responsable de ese departamento
  const responsibles = cat.allowedDepartmentIds.length === 1
    ? await ctx.db.employee.findMany({ where: { departmentId: cat.allowedDepartmentIds[0], userId: { not: null }, status: { not: "TERMINATED" } }, select: { userId: true, name: true }, orderBy: { name: "asc" } })
    : [];
  return (
    <>
      <PageHeader title={cat.name} subtitle="Describe lo que necesitas. Te avisaremos cada vez que cambie de estado." crumbs={crumbs} />
      <Card className="max-w-2xl">
        <ActionForm action={submitTicket} className="space-y-3">
          <input type="hidden" name="categoryId" value={cat.id} />
          <Field label="Asunto *"><input name="subject" required className={input} /></Field>
          <Field label="Descripción *"><textarea name="description" rows={5} required className={input} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prioridad" hint="Define el plazo de respuesta"><Select name="priority" defaultValue="MEDIA" options={Object.keys(TICKET_PRIORITY).map((p) => ({ value: p, label: `${TICKET_PRIORITY[p].label} · ${TICKET_SLA_LABELS[p]}` }))} /></Field>
            <Field label="Ubicación"><Select name="location" empty="—" options={TICKET_LOCATIONS.map((l) => ({ value: l, label: l }))} /></Field>
          </div>
          {fields.map((f) => (
            <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
              {f.type === "select" ? <Select name={`x_${f.key}`} required={f.required} empty="—" options={(f.options ?? []).map((o) => ({ value: o, label: o }))} />
                : f.type === "boolean" ? <select name={`x_${f.key}`} className={input}><option value="false">No</option><option value="true">Sí</option></select>
                : <input name={`x_${f.key}`} required={f.required} className={input} />}
            </Field>
          ))}
          {responsibles.length > 0 && <Field label="Asignar a" hint="Opcional"><Select name="responsibleId" empty="Responsable por defecto" options={responsibles.map((r) => ({ value: r.userId!, label: r.name }))} /></Field>}
          <Field label="Adjuntos" hint="PDF, imágenes u Office · máx. 8 MB cada uno"><input type="file" name="files" multiple className="text-sm" /></Field>
          <div className="flex gap-2">
            <SubmitButton className={btn.primary} pendingText="Enviando…">Enviar solicitud</SubmitButton>
            <NextLink href="?" className={btn.secondary}>Cambiar tipo</NextLink>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
