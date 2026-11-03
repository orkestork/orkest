"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionContext } from "@/lib/core/context";
import { audit } from "@/lib/core/notify";
import { formFile, saveFile } from "@/lib/core/files";
import { safeAction } from "@/lib/ui/action";
import type { ActionResult } from "@/components/action-form";
import {
  cancelOwnRequest, commentTicket, createEmployee, createPayslip, createTicket, decideBenefit, decideCertificate, decideOvertime, decideTimeOff,
  fieldsFromText, myEmployee, parseDay, requestBenefit, requestCertificate, requestOvertime, requestTimeOff, updateEmployee, updateTicket,
  type EmployeeInput,
} from "@/lib/apps/hr";
import { ValidationError } from "@/lib/apps/crm";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => s(f, k) || null;
const numOpt = (f: FormData, k: string) => (s(f, k) === "" ? null : Number(s(f, k).replace(/[^\d.-]/g, "")));
const dayOpt = (f: FormData, k: string) => (s(f, k) ? parseDay(s(f, k), k) : null);
const decision = (f: FormData) => {
  const st = s(f, "status");
  if (st !== "APPROVED" && st !== "REJECTED") throw new ValidationError({ status: "Decisión inválida" });
  return st;
};
const refresh = (...paths: string[]) => { for (const p of ["/hr", "/empleado", ...paths]) revalidatePath(p, "layout"); };

/** Sube el adjunto del campo `field` (si lo hay) y devuelve su id. */
async function upload(ctx: Awaited<ReturnType<typeof actionContext>>, form: FormData, field: string, entityType: string, entityId?: string) {
  const file = formFile(form, field);
  return file ? saveFile(ctx, file, { entityType, entityId }) : null;
}

async function meOrFail(ctx: Awaited<ReturnType<typeof actionContext>>) {
  const me = await myEmployee(ctx);
  if (!me) throw new ValidationError({ employee: "Tu usuario no tiene ficha de colaborador. Pide a talento humano que te vincule." });
  return me;
}

// ───────────── Colaboradores ─────────────

function employeeFromForm(form: FormData): EmployeeInput {
  return {
    name: s(form, "name"), email: opt(form, "email"), documentNumber: opt(form, "documentNumber"), phone: opt(form, "phone"),
    position: opt(form, "position"), departmentId: opt(form, "departmentId"), managerId: opt(form, "managerId"),
    contractType: s(form, "contractType") || undefined, status: s(form, "status") || undefined, site: opt(form, "site"),
    hireDate: dayOpt(form, "hireDate"), terminationDate: dayOpt(form, "terminationDate"), salaryAmount: numOpt(form, "salaryAmount"),
    salaryPeriod: s(form, "salaryPeriod") || undefined, eps: opt(form, "eps"), afp: opt(form, "afp"), arl: opt(form, "arl"),
    userId: form.has("userId") ? opt(form, "userId") : undefined,
  };
}

export async function saveEmployee(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.employees.write", "hr");
    const id = s(form, "id");
    const d = employeeFromForm(form);
    // Sin permiso de nómina no se toca el salario
    if (!ctx.can("hr.payroll.write")) { delete d.salaryAmount; delete d.salaryPeriod; }
    if (id) {
      if (!ctx.can("hr.payroll.write")) {
        const cur = await ctx.db.employee.findFirstOrThrow({ where: { id } });
        d.salaryAmount = cur.salaryAmount == null ? null : Number(cur.salaryAmount);
        d.salaryPeriod = cur.salaryPeriod;
      }
      await updateEmployee(ctx, id, d);
      refresh(`/hr/employees/${id}`);
      return { ok: "Colaborador actualizado" };
    }
    const { employee, tempPassword } = await createEmployee(ctx, { ...d, createAccount: form.get("createAccount") === "on" });
    refresh("/hr/employees");
    redirect(`/hr/employees/${employee.id}${tempPassword ? "?created=account" : ""}`);
  });
}

export async function saveDepartment(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.employees.write", "hr");
    const name = s(form, "name");
    if (!name) throw new ValidationError({ name: "Nombre obligatorio" });
    const data = { name, code: opt(form, "code"), description: opt(form, "description"), active: form.get("active") !== "off" };
    const id = s(form, "id");
    if (id) await ctx.db.orgUnit.update({ where: { id }, data });
    else {
      if (await ctx.db.orgUnit.findFirst({ where: { kind: "DEPARTMENT", name } })) throw new ValidationError({ name: "Ya existe un departamento con ese nombre" });
      await ctx.db.orgUnit.create({ data: { organizationId: ctx.orgId, kind: "DEPARTMENT", ...data } });
    }
    refresh("/hr/employees/departments");
    return { ok: id ? "Departamento actualizado" : "Departamento creado" };
  });
}

export async function addEmployeeNote(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.employees.write", "hr");
    const note = s(form, "note");
    if (!note) throw new ValidationError({ note: "Escribe la nota" });
    const employeeId = s(form, "employeeId");
    await ctx.db.employee.findFirstOrThrow({ where: { id: employeeId } });
    await ctx.db.employeeNote.create({ data: { organizationId: ctx.orgId, employeeId, authorId: ctx.actorId!, type: s(form, "type") || "SEGUIMIENTO", note } });
    refresh(`/hr/employees/${employeeId}`);
    return { ok: "Nota registrada" };
  });
}

export async function saveAsset(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.employees.write", "hr");
    const employeeId = s(form, "employeeId");
    if (!employeeId || !s(form, "name")) throw new ValidationError({ name: "Colaborador y elemento son obligatorios" });
    await ctx.db.employee.findFirstOrThrow({ where: { id: employeeId } });
    await ctx.db.employeeAsset.create({
      data: {
        organizationId: ctx.orgId, employeeId, type: s(form, "type") || "OTRO", name: s(form, "name"), serial: opt(form, "serial"),
        deliveredAt: dayOpt(form, "deliveredAt") ?? new Date(), notes: opt(form, "notes"), createdById: ctx.actorId,
      },
    });
    refresh("/hr/employees/assets", `/hr/employees/${employeeId}`);
    return { ok: "Entrega registrada" };
  });
}

export async function closeAsset(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.employees.write", "hr");
    const status = s(form, "status");
    if (!["DEVUELTO", "DANADO", "PERDIDO"].includes(status)) throw new ValidationError({ status: "Estado inválido" });
    await ctx.db.employeeAsset.update({ where: { id: s(form, "id") }, data: { status, returnedAt: new Date(), notes: opt(form, "notes") ?? undefined } });
    refresh("/hr/employees/assets");
    return { ok: "Asignación cerrada" };
  });
}

export async function uploadEmployeeDocument(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext(undefined, "hr");
    const selfService = form.get("self") === "1";
    let employeeId = s(form, "employeeId");
    if (selfService) {
      if (!ctx.can("hr.portal")) throw new Error("Permiso requerido: hr.portal");
      employeeId = (await meOrFail(ctx)).id;
    } else if (!ctx.can("hr.employees.write")) throw new Error("Permiso requerido: hr.employees.write");
    await ctx.db.employee.findFirstOrThrow({ where: { id: employeeId } });
    const file = formFile(form, "file");
    if (!file) throw new ValidationError({ file: "Adjunta el archivo" });
    const fileId = await saveFile(ctx, file, { entityType: "hr_document" });
    const doc = await ctx.db.employeeDocument.create({
      data: {
        organizationId: ctx.orgId, employeeId, category: selfService ? "OTRO" : s(form, "category") || "OTRO", name: s(form, "name") || file.name,
        fileId, expiresAt: dayOpt(form, "expiresAt"), uploadedBySelf: selfService,
      },
    });
    await ctx.db.fileObject.update({ where: { id: fileId }, data: { entityId: doc.id } });
    refresh("/hr/employees/documents", `/hr/employees/${employeeId}`, "/empleado/documentos");
    return { ok: "Documento cargado" };
  });
}

export async function deleteEmployeeDocument(form: FormData) {
  const ctx = await actionContext("hr.employees.write", "hr");
  const doc = await ctx.db.employeeDocument.findFirstOrThrow({ where: { id: s(form, "id") } });
  await ctx.db.employeeDocument.delete({ where: { id: doc.id } });
  await ctx.db.fileObject.deleteMany({ where: { id: doc.fileId } });
  await audit(ctx, "EmployeeDocumentDeleted", "employee", doc.employeeId, { name: doc.name });
  refresh("/hr/employees/documents", `/hr/employees/${doc.employeeId}`);
}

// ───────────── Ausencias, horas extras, asistencia ─────────────

function timeOffFromForm(form: FormData) {
  return {
    type: s(form, "type"), subType: opt(form, "subType"), startDate: parseDay(s(form, "startDate"), "inicio"),
    endDate: parseDay(s(form, "endDate") || s(form, "startDate"), "fin"), reason: opt(form, "reason"), startTime: opt(form, "startTime"),
    endTime: opt(form, "endTime"), incapacityType: opt(form, "incapacityType"), epsName: opt(form, "epsName"), treatingDoctor: opt(form, "treatingDoctor"),
    diagnosis: opt(form, "diagnosis"), diagnosisCode: opt(form, "diagnosisCode"), issueDate: dayOpt(form, "issueDate"),
  };
}

/** Solicitud desde el portal (el colaborador para sí mismo) o registro de talento humano a nombre de alguien. */
export async function submitTimeOff(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext(undefined, "hr");
    const byHr = form.has("employeeId");
    if (byHr && !ctx.can("hr.timeoff.write")) throw new Error("Permiso requerido: hr.timeoff.write");
    if (!byHr && !ctx.can("hr.portal")) throw new Error("Permiso requerido: hr.portal");
    const employeeId = byHr ? s(form, "employeeId") : (await meOrFail(ctx)).id;
    const d = timeOffFromForm(form);
    const fileId = await upload(ctx, form, "file", "hr_time_off");
    await requestTimeOff(ctx, employeeId, { ...d, fileId }, { byHr });
    refresh("/hr/time-off", "/hr/inbox", "/empleado/ausencias");
    return { ok: byHr ? "Ausencia registrada" : "Solicitud enviada. Te avisaremos cuando la revisen." };
  });
}

export async function decideTimeOffAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext(undefined, "hr");
    const paid = s(form, "isPaid");
    await decideTimeOff(ctx, s(form, "id"), decision(form), opt(form, "reviewNote"), paid === "" ? null : paid === "yes");
    refresh("/hr/time-off", "/hr/inbox", "/empleado/equipo");
    return { ok: "Decisión registrada" };
  });
}

export async function submitOvertime(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext(undefined, "hr");
    const byHr = form.has("employeeId");
    if (byHr && !ctx.can("hr.timeoff.write")) throw new Error("Permiso requerido: hr.timeoff.write");
    if (!byHr && !ctx.can("hr.portal")) throw new Error("Permiso requerido: hr.portal");
    const employeeId = byHr ? s(form, "employeeId") : (await meOrFail(ctx)).id;
    await requestOvertime(ctx, employeeId, { date: parseDay(s(form, "date")), startTime: s(form, "startTime"), endTime: s(form, "endTime"), overtimeType: s(form, "overtimeType"), reason: opt(form, "reason") });
    refresh("/hr/time-off/overtime", "/hr/inbox", "/empleado/horas-extras");
    return { ok: "Horas extras reportadas" };
  });
}

export async function decideOvertimeAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext(undefined, "hr");
    await decideOvertime(ctx, s(form, "id"), decision(form), opt(form, "reviewNote"));
    refresh("/hr/time-off/overtime", "/hr/inbox", "/empleado/equipo");
    return { ok: "Decisión registrada" };
  });
}

export async function saveAttendance(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.timeoff.write", "hr");
    const employeeId = s(form, "employeeId");
    const date = parseDay(s(form, "date"));
    const status = s(form, "status") || "PRESENT";
    if (!["PRESENT", "LATE", "ABSENT"].includes(status)) throw new ValidationError({ status: "Estado inválido" });
    await ctx.db.employee.findFirstOrThrow({ where: { id: employeeId } });
    const data = { status, checkIn: status === "ABSENT" ? null : opt(form, "checkIn"), checkOut: status === "ABSENT" ? null : opt(form, "checkOut"), note: opt(form, "note") };
    const existing = await ctx.db.attendanceRecord.findFirst({ where: { employeeId, date } });
    if (existing) await ctx.db.attendanceRecord.update({ where: { id: existing.id }, data });
    else await ctx.db.attendanceRecord.create({ data: { organizationId: ctx.orgId, employeeId, date, ...data } });
    refresh("/hr/time-off/attendance");
    return { ok: existing ? "Registro actualizado" : "Asistencia registrada" };
  });
}

// ───────────── Nómina y certificados ─────────────

export async function savePayslip(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.payroll.write", "hr");
    const fileId = await upload(ctx, form, "file", "hr_payslip");
    await createPayslip(ctx, {
      employeeId: s(form, "employeeId"), period: s(form, "period"), grossAmount: Number(numOpt(form, "grossAmount")), deductions: Number(numOpt(form, "deductions") ?? 0),
      paymentDueDate: dayOpt(form, "paymentDueDate"), fileId, epsAmount: numOpt(form, "epsAmount"), arlAmount: numOpt(form, "arlAmount"), pensionAmount: numOpt(form, "pensionAmount"),
    });
    refresh("/hr/payroll");
    return { ok: "Desprendible publicado" };
  });
}

export async function togglePayslipPaid(form: FormData) {
  const ctx = await actionContext("hr.payroll.write", "hr");
  const p = await ctx.db.payslip.findFirstOrThrow({ where: { id: s(form, "id") } });
  await ctx.db.payslip.update({ where: { id: p.id }, data: { isPaid: !p.isPaid, paidAt: p.isPaid ? null : new Date() } });
  await audit(ctx, p.isPaid ? "PayslipUnpaid" : "PayslipPaid", "payslip", p.id, { period: p.period });
  refresh("/hr/payroll/payments");
}

export async function decideCertificateAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext(undefined, "hr");
    await decideCertificate(ctx, s(form, "id"), decision(form), opt(form, "reviewNote"));
    refresh("/hr/payroll/certificates", "/hr/inbox");
    return { ok: "Decisión registrada" };
  });
}

export async function submitCertificate(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.portal", "hr");
    await requestCertificate(ctx, (await meOrFail(ctx)).id, form.get("includeSalary") === "on", opt(form, "addressee"));
    refresh("/empleado/documentos");
    return { ok: "Certificado solicitado. Te avisaremos cuando esté listo." };
  });
}

// ───────────── Beneficios y noticias ─────────────

export async function saveBenefit(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.comms.write", "hr");
    if (!s(form, "title") || !s(form, "description")) throw new ValidationError({ title: "Título y descripción son obligatorios" });
    const data = {
      title: s(form, "title"), description: s(form, "description"), detail: opt(form, "detail"), category: s(form, "category") || "OTRO",
      frequency: opt(form, "frequency"), isFeatured: form.get("isFeatured") === "on", expiresAt: dayOpt(form, "expiresAt"), order: Number(s(form, "order") || 0),
    };
    const id = s(form, "id");
    if (id) await ctx.db.benefit.update({ where: { id }, data });
    else await ctx.db.benefit.create({ data: { organizationId: ctx.orgId, ...data } });
    refresh("/hr/news/benefits", "/empleado/beneficios");
    return { ok: id ? "Beneficio actualizado" : "Beneficio publicado" };
  });
}

export async function toggleBenefit(form: FormData) {
  const ctx = await actionContext("hr.comms.write", "hr");
  const b = await ctx.db.benefit.findFirstOrThrow({ where: { id: s(form, "id") } });
  await ctx.db.benefit.update({ where: { id: b.id }, data: { isActive: !b.isActive } });
  refresh("/hr/news/benefits", "/empleado/beneficios");
}

export async function submitBenefitRequest(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.portal", "hr");
    await requestBenefit(ctx, (await meOrFail(ctx)).id, s(form, "benefitId"), opt(form, "note"));
    refresh("/empleado/beneficios", "/hr/inbox");
    return { ok: "Solicitud enviada" };
  });
}

export async function decideBenefitAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext(undefined, "hr");
    await decideBenefit(ctx, s(form, "id"), decision(form), opt(form, "reviewNote"));
    refresh("/hr/inbox", "/hr/news/benefits");
    return { ok: "Decisión registrada" };
  });
}

export async function saveAnnouncement(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.comms.write", "hr");
    if (!s(form, "title") || !s(form, "body")) throw new ValidationError({ title: "Título y contenido son obligatorios" });
    const data = {
      title: s(form, "title"), body: s(form, "body"), category: s(form, "category") || "GENERAL", isImportant: form.get("isImportant") === "on",
      scheduledAt: dayOpt(form, "scheduledAt"), authorName: opt(form, "authorName") ?? ctx.user.name,
    };
    const id = s(form, "id");
    if (id) await ctx.db.hrAnnouncement.update({ where: { id }, data });
    else await ctx.db.hrAnnouncement.create({ data: { organizationId: ctx.orgId, ...data } });
    refresh("/hr/news", "/empleado/noticias");
    return { ok: id ? "Noticia actualizada" : "Noticia publicada" };
  });
}

export async function toggleAnnouncement(form: FormData) {
  const ctx = await actionContext("hr.comms.write", "hr");
  const a = await ctx.db.hrAnnouncement.findFirstOrThrow({ where: { id: s(form, "id") } });
  await ctx.db.hrAnnouncement.update({ where: { id: a.id }, data: { isActive: !a.isActive } });
  refresh("/hr/news", "/empleado/noticias");
}

export async function markAnnouncementRead(form: FormData) {
  const ctx = await actionContext("hr.portal", "hr");
  const announcementId = s(form, "id");
  await ctx.db.hrAnnouncement.findFirstOrThrow({ where: { id: announcementId } });
  const exists = await ctx.db.hrAnnouncementRead.findFirst({ where: { announcementId, userId: ctx.user.id } });
  if (!exists) await ctx.db.hrAnnouncementRead.create({ data: { organizationId: ctx.orgId, announcementId, userId: ctx.user.id } });
  refresh("/empleado/noticias");
}

// ───────────── Selección ─────────────

export async function saveCandidate(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.recruiting.write", "hr");
    if (!s(form, "fullName") || !s(form, "position")) throw new ValidationError({ fullName: "Nombre y cargo son obligatorios" });
    const fileId = await upload(ctx, form, "file", "hr_candidate");
    const data = { fullName: s(form, "fullName"), email: opt(form, "email"), phone: opt(form, "phone"), position: s(form, "position"), source: opt(form, "source"), notes: opt(form, "notes"), ...(fileId ? { fileId } : {}) };
    const id = s(form, "id");
    const c = id ? await ctx.db.candidate.update({ where: { id }, data }) : await ctx.db.candidate.create({ data: { organizationId: ctx.orgId, ...data, createdById: ctx.actorId } });
    if (fileId) await ctx.db.fileObject.update({ where: { id: fileId }, data: { entityId: c.id } });
    refresh("/hr/recruiting");
    return { ok: id ? "Candidato actualizado" : "Candidato registrado" };
  });
}

export async function moveCandidate(form: FormData) {
  const ctx = await actionContext("hr.recruiting.write", "hr");
  const stage = s(form, "stage");
  if (!["POSTULADO", "ENTREVISTA", "PRUEBA", "OFERTA", "CONTRATADO", "DESCARTADO"].includes(stage)) return;
  await ctx.db.candidate.update({ where: { id: s(form, "id") }, data: { stage } });
  refresh("/hr/recruiting");
}

// ───────────── Centro de solicitudes ─────────────

export async function saveCategory(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.tickets.write", "hr");
    if (!s(form, "name")) throw new ValidationError({ name: "Nombre obligatorio" });
    const data = {
      name: s(form, "name"), icon: opt(form, "icon"), fieldsSchema: fieldsFromText(s(form, "fields")), defaultResponsibleId: opt(form, "defaultResponsibleId"),
      allowedDepartmentIds: form.getAll("allowedDepartmentIds").map(String).filter(Boolean),
    };
    const id = s(form, "id");
    if (id) await ctx.db.hrRequestCategory.update({ where: { id }, data });
    else await ctx.db.hrRequestCategory.create({ data: { organizationId: ctx.orgId, ...data } });
    refresh("/hr/tickets/categories");
    return { ok: id ? "Categoría actualizada" : "Categoría creada" };
  });
}

export async function toggleCategory(form: FormData) {
  const ctx = await actionContext("hr.tickets.write", "hr");
  const c = await ctx.db.hrRequestCategory.findFirstOrThrow({ where: { id: s(form, "id") } });
  await ctx.db.hrRequestCategory.update({ where: { id: c.id }, data: { active: !c.active } });
  refresh("/hr/tickets/categories");
}

export async function submitTicket(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext(undefined, "hr");
    if (!ctx.can("hr.portal") && !ctx.can("hr.tickets.write")) throw new Error("Permiso requerido: hr.portal");
    const extra: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (k.startsWith("x_") && typeof v === "string") extra[k.slice(2)] = v;
    const fileIds: string[] = [];
    for (const f of form.getAll("files")) if (f instanceof File && f.size > 0) fileIds.push(await saveFile(ctx, f, { entityType: "hr_ticket" }));
    const t = await createTicket(ctx, {
      categoryId: s(form, "categoryId"), priority: s(form, "priority"), subject: s(form, "subject"), description: s(form, "description"),
      location: opt(form, "location"), extraFields: extra, responsibleId: opt(form, "responsibleId"), fileIds,
    });
    refresh("/hr/tickets", "/empleado/solicitudes");
    redirect(`/empleado/solicitudes/${t.id}`);
  });
}

export async function updateTicketAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext(undefined, "hr");
    const id = s(form, "id");
    const d: Parameters<typeof updateTicket>[2] = {};
    if (form.has("status")) d.status = s(form, "status");
    if (form.has("priority")) d.priority = s(form, "priority");
    if (form.has("responsibleId")) d.responsibleId = opt(form, "responsibleId");
    if (form.has("subject")) d.subject = s(form, "subject");
    if (form.has("description")) d.description = s(form, "description");
    await updateTicket(ctx, id, d);
    refresh(`/hr/tickets/${id}`, `/empleado/solicitudes/${id}`, "/hr/tickets", "/empleado/solicitudes");
    return { ok: "Solicitud actualizada" };
  });
}

export async function commentTicketAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext(undefined, "hr");
    const id = s(form, "id");
    const fileIds: string[] = [];
    for (const f of form.getAll("files")) if (f instanceof File && f.size > 0) fileIds.push(await saveFile(ctx, f, { entityType: "hr_ticket", entityId: id }));
    await commentTicket(ctx, id, s(form, "message"), fileIds);
    refresh(`/hr/tickets/${id}`, `/empleado/solicitudes/${id}`);
    return { ok: "Comentario agregado" };
  });
}

// ───────────── Portal: cancelar y perfil ─────────────

export async function cancelMyRequest(form: FormData) {
  const ctx = await actionContext("hr.portal", "hr");
  const kind = s(form, "kind") as "timeOff" | "overtime" | "benefit" | "certificate";
  if (!["timeOff", "overtime", "benefit", "certificate"].includes(kind)) return;
  await cancelOwnRequest(ctx, kind, s(form, "id"));
  refresh("/empleado/ausencias", "/empleado/horas-extras", "/empleado/beneficios", "/empleado/documentos", "/hr/inbox");
}

export async function updateMyProfile(_: ActionResult, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const ctx = await actionContext("hr.portal", "hr");
    const me = await meOrFail(ctx);
    // El colaborador solo actualiza sus datos de contacto; lo contractual lo gestiona talento humano
    await ctx.db.employee.update({ where: { id: me.id }, data: { phone: opt(form, "phone"), site: opt(form, "site") ?? me.site } });
    refresh("/empleado/perfil");
    return { ok: "Datos actualizados" };
  });
}
