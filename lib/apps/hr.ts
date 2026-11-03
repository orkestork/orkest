import { prisma } from "@/lib/core/prisma";
import type { ExecContext, OrgContext } from "@/lib/core/context";
import { nextNumber } from "@/lib/core/db";
import { emitEvent } from "@/lib/core/events";
import { audit, notify } from "@/lib/core/notify";
import { hasPermission } from "@/lib/core/permissions";
import { hashPassword } from "@/lib/core/auth";
import { ValidationError } from "./crm";
import { OVERTIME_TYPE, PERMIT_SUBTYPE, TIME_OFF_TYPE, INCAPACITY_TYPE } from "@/lib/ui/hr-labels";

/**
 * Talento humano: colaboradores, ausencias, horas extras, nómina, certificados, beneficios y
 * centro de solicitudes. Reglas tomadas del proceso de RRHH (Colombia) y aplicadas igual a toda
 * organización que active la app.
 */

const MS_DAY = 86_400_000;
const fail = (field: string, msg: string): never => { throw new ValidationError({ [field]: msg }); };

// ───────────── Fechas "de calendario" (guardadas como medianoche UTC) ─────────────

export function parseDay(v: unknown, field = "fecha"): Date {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(field, `Fecha inválida (${field})`);
  return new Date(`${s}T00:00:00.000Z`);
}
/** Hoy en Colombia como fecha de calendario. */
export const today = () => new Date(`${new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

// ───────────── Vacaciones ─────────────

/** Colombia: 15 días hábiles de vacaciones por cada 365 días trabajados. */
export const VACATION_DAYS_PER_YEAR = 15;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type VacationBalance = { diasTrabajados: number; diasCausados: number; diasTomados: number; diasPendientes: number; diasDisponibles: number };

export function calcVacationBalance(hireDate: Date | null, requests: { type: string; status: string; durationDays: number }[], asOf = new Date()): VacationBalance {
  const diasTrabajados = hireDate ? Math.max(0, Math.floor((asOf.getTime() - hireDate.getTime()) / MS_DAY)) : 0;
  const diasCausados = r2((diasTrabajados * VACATION_DAYS_PER_YEAR) / 365);
  const vac = requests.filter((r) => r.type === "VACATION");
  const diasTomados = r2(vac.filter((r) => r.status === "APPROVED").reduce((s, r) => s + r.durationDays, 0));
  const diasPendientes = r2(vac.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.durationDays, 0));
  return { diasTrabajados, diasCausados, diasTomados, diasPendientes, diasDisponibles: r2(Math.max(0, diasCausados - diasTomados - diasPendientes)) };
}

// ───────────── Quién es quién ─────────────

/** Ficha de colaborador del usuario actual (null si no tiene). */
export async function myEmployee(ctx: ExecContext) {
  if (!ctx.actorId) return null;
  return ctx.db.employee.findFirst({ where: { userId: ctx.actorId }, include: { department: true, manager: true } });
}

/** ¿El usuario actual es jefe inmediato del colaborador? */
export async function isManagerOf(ctx: ExecContext, employeeId: string) {
  if (!ctx.actorId) return false;
  const e = await ctx.db.employee.findFirst({ where: { id: employeeId }, select: { manager: { select: { userId: true } } } });
  return Boolean(e?.manager?.userId && e.manager.userId === ctx.actorId);
}

/** Usuarios activos cuyo rol concede el permiso (para notificar a quien aprueba). */
export async function usersWithPermission(ctx: ExecContext, permission: string) {
  const ms = await ctx.db.membership.findMany({ where: { status: "ACTIVE" }, select: { userId: true, role: { select: { permissions: true } } } });
  return ms.filter((m) => hasPermission(m.role.permissions, permission)).map((m) => m.userId);
}

async function approversFor(ctx: ExecContext, employeeId: string) {
  const e = await ctx.db.employee.findFirst({ where: { id: employeeId }, select: { manager: { select: { userId: true } } } });
  const hr = await usersWithPermission(ctx, "hr.approve");
  return [...hr, ...(e?.manager?.userId ? [e.manager.userId] : [])].filter((u) => u !== ctx.actorId);
}

async function canDecide(ctx: OrgContext, employeeId: string) {
  if (ctx.can("hr.approve")) return true;
  return isManagerOf(ctx, employeeId);
}

async function employeeUserId(ctx: ExecContext, employeeId: string) {
  const e = await ctx.db.employee.findFirst({ where: { id: employeeId }, select: { userId: true, name: true } });
  if (!e) fail("employeeId", "Colaborador no encontrado");
  return e!;
}

// ───────────── Colaboradores ─────────────

export type EmployeeInput = {
  name: string; email?: string | null; documentNumber?: string | null; phone?: string | null; position?: string | null;
  departmentId?: string | null; managerId?: string | null; contractType?: string; status?: string; site?: string | null;
  hireDate?: Date | null; terminationDate?: Date | null; salaryAmount?: number | null; salaryPeriod?: string;
  eps?: string | null; afp?: string | null; arl?: string | null; userId?: string | null;
};

async function checkEmployee(ctx: ExecContext, d: EmployeeInput, id?: string) {
  if (!d.name?.trim()) fail("name", "Nombre obligatorio");
  if (!d.position?.trim()) fail("position", "Cargo obligatorio");
  if (!d.hireDate) fail("hireDate", "Fecha de ingreso obligatoria");
  if (d.documentNumber) {
    const dup = await ctx.db.employee.findFirst({ where: { documentNumber: d.documentNumber, ...(id ? { id: { not: id } } : {}) } });
    if (dup) fail("documentNumber", "Ya existe un colaborador con este documento");
  }
  if (d.userId) {
    const dup = await ctx.db.employee.findFirst({ where: { userId: d.userId, ...(id ? { id: { not: id } } : {}) } });
    if (dup) fail("userId", "Ese usuario ya tiene ficha de colaborador");
  }
  if (d.managerId) {
    if (d.managerId === id) fail("managerId", "Un colaborador no puede ser su propio jefe");
    const m = await ctx.db.employee.findFirst({ where: { id: d.managerId } });
    if (!m) fail("managerId", "Jefe inmediato no encontrado");
    // Evita ciclos en el organigrama
    let cur = m?.managerId;
    for (let i = 0; cur && i < 50; i++) {
      if (cur === id) fail("managerId", "Ese jefe depende de este colaborador (ciclo en el organigrama)");
      cur = (await ctx.db.employee.findFirst({ where: { id: cur }, select: { managerId: true } }))?.managerId;
    }
  }
  if (d.departmentId && !(await ctx.db.orgUnit.findFirst({ where: { id: d.departmentId } }))) fail("departmentId", "Departamento no encontrado");
  if (d.salaryAmount != null && (!Number.isFinite(d.salaryAmount) || d.salaryAmount < 0)) fail("salaryAmount", "Salario inválido");
}

function employeeData(d: EmployeeInput) {
  return {
    name: d.name.trim(), email: d.email?.trim().toLowerCase() || null, documentNumber: d.documentNumber?.trim() || null, phone: d.phone || null,
    position: d.position?.trim() || null, departmentId: d.departmentId || null, managerId: d.managerId || null,
    contractType: d.contractType || "INDEFINITE", status: d.status || "ACTIVE", site: d.site || null,
    hireDate: d.hireDate ?? null, terminationDate: d.terminationDate ?? null, salaryAmount: d.salaryAmount ?? null,
    salaryPeriod: d.salaryPeriod || "MONTHLY", eps: d.eps || null, afp: d.afp || null, arl: d.arl || null,
  };
}

/**
 * Vincula un colaborador. Con `createAccount` le crea usuario (rol Colaborador) para el portal;
 * la contraseña inicial es su documento, como en el proceso original de RRHH.
 */
export async function createEmployee(ctx: ExecContext, d: EmployeeInput & { createAccount?: boolean }) {
  await checkEmployee(ctx, d);
  let userId = d.userId || null;
  let tempPassword: string | null = null;
  if (d.createAccount && !userId) {
    const email = d.email?.trim().toLowerCase();
    if (!email) fail("email", "El correo es obligatorio para crear acceso al portal");
    if (!d.documentNumber) fail("documentNumber", "El documento es obligatorio para crear acceso al portal");
    const role = await ctx.db.role.findFirst({ where: { key: "EMPLOYEE" } });
    if (!role) fail("createAccount", "La organización no tiene el rol Colaborador");
    let user = await prisma.user.findUnique({ where: { email: email! } });
    if (!user) {
      tempPassword = d.documentNumber!.trim();
      user = await prisma.user.create({ data: { email: email!, name: d.name.trim(), passwordHash: await hashPassword(tempPassword) } });
    }
    const member = await ctx.db.membership.findFirst({ where: { userId: user.id } });
    if (!member) await ctx.db.membership.create({ data: { organizationId: ctx.orgId, userId: user.id, roleId: role!.id, title: d.position || null } });
    if (await ctx.db.employee.findFirst({ where: { userId: user.id } })) fail("email", "Ese usuario ya tiene ficha de colaborador");
    userId = user.id;
  }
  const e = await ctx.db.employee.create({ data: { organizationId: ctx.orgId, ...employeeData(d), userId } });
  await audit(ctx, "EmployeeCreated", "employee", e.id, { name: e.name });
  await emitEvent(ctx, "EmployeeHired", "employee", e.id, { name: e.name, position: e.position });
  return { employee: e, tempPassword };
}

export async function updateEmployee(ctx: ExecContext, id: string, d: EmployeeInput) {
  await checkEmployee(ctx, d, id);
  const e = await ctx.db.employee.update({ where: { id }, data: { ...employeeData(d), ...(d.userId !== undefined ? { userId: d.userId || null } : {}) } });
  await audit(ctx, "EmployeeUpdated", "employee", id, { name: e.name });
  return e;
}

// ───────────── Ausencias (vacaciones, permisos, licencias, incapacidades) ─────────────

export type TimeOffInput = {
  type: string; subType?: string | null; startDate: Date; endDate: Date; reason?: string | null; startTime?: string | null; endTime?: string | null;
  hours?: number | null; fileId?: string | null; incapacityType?: string | null; epsName?: string | null; treatingDoctor?: string | null;
  diagnosis?: string | null; diagnosisCode?: string | null; issueDate?: Date | null;
};

/** Días calendario entre dos fechas, inclusive. */
export const spanDays = (a: Date, b: Date) => Math.max(1, Math.round((b.getTime() - a.getTime()) / MS_DAY) + 1);

export async function requestTimeOff(ctx: ExecContext, employeeId: string, d: TimeOffInput, opts: { byHr?: boolean } = {}) {
  if (!TIME_OFF_TYPE[d.type]) fail("type", "Tipo de ausencia inválido");
  if (d.subType && !PERMIT_SUBTYPE[d.subType]) fail("subType", "Tipo de permiso inválido");
  if (d.incapacityType && !INCAPACITY_TYPE[d.incapacityType]) fail("incapacityType", "Tipo de incapacidad inválido");
  if (d.endDate < d.startDate) fail("endDate", "La fecha final debe ser igual o posterior a la inicial");
  // Las incapacidades se reportan después de ocurrir; lo demás no puede pedirse hacia atrás (salvo que lo registre RRHH)
  if (d.type !== "INCAPACITY" && !opts.byHr && d.startDate < today()) fail("startDate", "No puedes solicitar fechas pasadas");
  if (d.type === "INCAPACITY" && !d.fileId && !opts.byHr) fail("fileId", "Adjunta el soporte de la incapacidad");
  if (d.subType === "HORAS") {
    if (!d.startTime || !d.endTime) fail("startTime", "Indica la hora de salida y de regreso");
    const h = hoursBetween(d.startTime!, d.endTime!);
    if (h <= 0) fail("endTime", "La hora de regreso debe ser posterior a la de salida");
    d.hours = h;
  }
  const durationDays = d.subType === "HORAS" ? 0 : spanDays(d.startDate, d.endDate);

  const emp = await ctx.db.employee.findFirst({ where: { id: employeeId }, include: { timeOffRequests: true } });
  if (!emp) fail("employeeId", "Colaborador no encontrado");
  if (emp!.status === "TERMINATED") fail("employeeId", "El colaborador está retirado");

  const overlaps = emp!.timeOffRequests.some((r) => ["APPROVED", "PENDING"].includes(r.status) && r.type !== "INCAPACITY" && d.type !== "INCAPACITY"
    && d.subType !== "HORAS" && r.subType !== "HORAS" && d.startDate <= r.endDate && d.endDate >= r.startDate);
  if (overlaps) fail("startDate", "Ya hay una ausencia pendiente o aprobada en ese rango de fechas");

  if (d.type === "VACATION") {
    const bal = calcVacationBalance(emp!.hireDate, emp!.timeOffRequests);
    if (durationDays > bal.diasDisponibles) fail("endDate", `No hay suficientes días disponibles (disponibles: ${bal.diasDisponibles})`);
  }

  const incapacityNumber = d.type === "INCAPACITY" ? await nextNumber(ctx.db, ctx.orgId, `INC-${d.startDate.getUTCFullYear()}`, 4) : null;
  const t = await ctx.db.timeOffRequest.create({
    data: {
      organizationId: ctx.orgId, employeeId, type: d.type, subType: d.type === "PERMIT" ? d.subType || "OTRO" : null,
      startDate: d.startDate, endDate: d.endDate, durationDays, hours: d.hours ?? null, startTime: d.startTime || null, endTime: d.endTime || null,
      reason: d.reason?.trim() || null, fileId: d.fileId || null, incapacityNumber, incapacityType: d.incapacityType || null,
      epsName: d.epsName || null, treatingDoctor: d.treatingDoctor || null, diagnosis: d.diagnosis || null, diagnosisCode: d.diagnosisCode || null,
      issueDate: d.issueDate ?? null,
    },
  });
  if (d.fileId) await ctx.db.fileObject.update({ where: { id: d.fileId }, data: { entityType: "hr_time_off", entityId: t.id } });
  await notify(ctx, await approversFor(ctx, employeeId), {
    title: `${TIME_OFF_TYPE[d.type]} solicitada por ${emp!.name}`,
    body: `${dayKey(d.startDate)} → ${dayKey(d.endDate)}${durationDays ? ` · ${durationDays} día(s)` : ""}`, link: "/hr/inbox",
  });
  await emitEvent(ctx, "TimeOffRequested", "time_off", t.id, { type: t.type, employee: emp!.name, days: durationDays });
  return t;
}

export async function decideTimeOff(ctx: OrgContext, id: string, status: "APPROVED" | "REJECTED", reviewNote?: string | null, isPaid?: boolean | null) {
  const t = await ctx.db.timeOffRequest.findFirst({ where: { id } });
  if (!t) fail("id", "Solicitud no encontrada");
  if (!(await canDecide(ctx, t!.employeeId))) fail("id", "Solo talento humano o el jefe inmediato pueden decidir esta solicitud");
  if (t!.status !== "PENDING") fail("id", "La solicitud ya fue decidida");
  if (status === "REJECTED" && !reviewNote?.trim()) fail("reviewNote", "El motivo de rechazo es obligatorio");
  if (status === "APPROVED" && t!.type === "PERMIT" && typeof isPaid !== "boolean") fail("isPaid", "Indica si el permiso es remunerado o no");
  if (status === "APPROVED" && t!.type === "VACATION") {
    const emp = await ctx.db.employee.findFirst({ where: { id: t!.employeeId }, include: { timeOffRequests: true } });
    const bal = calcVacationBalance(emp!.hireDate, emp!.timeOffRequests.filter((r) => r.id !== id));
    if (t!.durationDays > bal.diasDisponibles) fail("id", `El colaborador ya no tiene días suficientes (disponibles: ${bal.diasDisponibles})`);
  }
  const u = await ctx.db.timeOffRequest.update({
    where: { id },
    data: { status, reviewNote: status === "REJECTED" ? reviewNote!.trim() : reviewNote?.trim() || null, reviewedById: ctx.actorId, isPaid: t!.type === "PERMIT" && status === "APPROVED" ? isPaid : t!.isPaid },
  });
  const who = await employeeUserId(ctx, t!.employeeId);
  if (who.userId) await notify(ctx, [who.userId], { title: `Tu solicitud de ${TIME_OFF_TYPE[t!.type].toLowerCase()} fue ${status === "APPROVED" ? "aprobada" : "rechazada"}`, body: reviewNote || undefined, link: "/empleado/ausencias" });
  if (status === "APPROVED" && t!.type !== "PERMIT" && t!.startDate <= today() && t!.endDate >= today()) {
    await ctx.db.employee.update({ where: { id: t!.employeeId }, data: { status: "ON_LEAVE" } }).catch(() => undefined);
  }
  await emitEvent(ctx, "TimeOffDecided", "time_off", id, { status, type: t!.type, employee: who.name });
  return u;
}

/** El colaborador cancela su propia solicitud mientras siga pendiente. */
export async function cancelOwnRequest(ctx: ExecContext, kind: "timeOff" | "overtime" | "benefit" | "certificate", id: string) {
  const me = await myEmployee(ctx);
  if (!me) fail("id", "No tienes ficha de colaborador");
  const where = { id, employeeId: me!.id, status: "PENDING" };
  const data = { status: "CANCELLED" };
  const r = kind === "timeOff" ? await ctx.db.timeOffRequest.updateMany({ where, data })
    : kind === "overtime" ? await ctx.db.overtimeRequest.updateMany({ where, data })
    : kind === "benefit" ? await ctx.db.benefitRequest.updateMany({ where, data })
    : await ctx.db.certificateRequest.updateMany({ where, data });
  if (r.count === 0) fail("id", "Solo puedes cancelar solicitudes pendientes propias");
}

// ───────────── Horas extras ─────────────

export function hoursBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return 0;
  return r2(Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60));
}

export async function requestOvertime(ctx: ExecContext, employeeId: string, d: { date: Date; startTime: string; endTime: string; overtimeType: string; reason?: string | null }) {
  if (!OVERTIME_TYPE[d.overtimeType]) fail("overtimeType", "Tipo de hora extra inválido");
  const hours = hoursBetween(d.startTime, d.endTime);
  if (hours <= 0) fail("endTime", "La hora final debe ser posterior a la inicial");
  if (d.date > today()) fail("date", "Las horas extras se reportan después de trabajarlas");
  const emp = await employeeUserId(ctx, employeeId);
  const o = await ctx.db.overtimeRequest.create({
    data: { organizationId: ctx.orgId, employeeId, date: d.date, startTime: d.startTime, endTime: d.endTime, hours, overtimeType: d.overtimeType, reason: d.reason?.trim() || null },
  });
  await notify(ctx, await approversFor(ctx, employeeId), { title: `Horas extras reportadas por ${emp.name}`, body: `${hours} h · ${OVERTIME_TYPE[d.overtimeType]}`, link: "/hr/inbox" });
  return o;
}

export async function decideOvertime(ctx: OrgContext, id: string, status: "APPROVED" | "REJECTED", reviewNote?: string | null) {
  const o = await ctx.db.overtimeRequest.findFirst({ where: { id } });
  if (!o) fail("id", "Registro no encontrado");
  if (!(await canDecide(ctx, o!.employeeId))) fail("id", "Solo talento humano o el jefe inmediato pueden decidir");
  if (o!.status !== "PENDING") fail("id", "Ya fue decidida");
  if (status === "REJECTED" && !reviewNote?.trim()) fail("reviewNote", "El motivo de rechazo es obligatorio");
  const u = await ctx.db.overtimeRequest.update({ where: { id }, data: { status, reviewNote: reviewNote?.trim() || null, reviewedById: ctx.actorId } });
  const who = await employeeUserId(ctx, o!.employeeId);
  if (who.userId) await notify(ctx, [who.userId], { title: `Tus horas extras del ${dayKey(o!.date)} fueron ${status === "APPROVED" ? "aprobadas" : "rechazadas"}`, body: reviewNote || undefined, link: "/empleado/horas-extras" });
  return u;
}

// ───────────── Beneficios y certificados ─────────────

export async function requestBenefit(ctx: ExecContext, employeeId: string, benefitId: string, note?: string | null) {
  const b = await ctx.db.benefit.findFirst({ where: { id: benefitId, isActive: true } });
  if (!b) fail("benefitId", "Beneficio no disponible");
  if (b!.expiresAt && b!.expiresAt < new Date()) fail("benefitId", "El beneficio ya venció");
  const open = await ctx.db.benefitRequest.findFirst({ where: { benefitId, employeeId, status: "PENDING" } });
  if (open) fail("benefitId", "Ya tienes una solicitud pendiente para este beneficio");
  const r = await ctx.db.benefitRequest.create({ data: { organizationId: ctx.orgId, benefitId, employeeId, note: note?.trim() || null } });
  const emp = await employeeUserId(ctx, employeeId);
  await notify(ctx, await usersWithPermission(ctx, "hr.approve"), { title: `${emp.name} solicitó el beneficio "${b!.title}"`, link: "/hr/inbox" });
  return r;
}

export async function decideBenefit(ctx: OrgContext, id: string, status: "APPROVED" | "REJECTED", reviewNote?: string | null) {
  if (!ctx.can("hr.approve")) fail("id", "Permiso requerido: hr.approve");
  const r = await ctx.db.benefitRequest.findFirst({ where: { id }, include: { benefit: true, employee: true } });
  if (!r || r.status !== "PENDING") fail("id", "Solicitud no encontrada o ya decidida");
  if (status === "REJECTED" && !reviewNote?.trim()) fail("reviewNote", "El motivo de rechazo es obligatorio");
  await ctx.db.benefitRequest.update({ where: { id }, data: { status, reviewNote: reviewNote?.trim() || null, reviewedById: ctx.actorId } });
  if (r!.employee.userId) await notify(ctx, [r!.employee.userId], { title: `Tu solicitud del beneficio "${r!.benefit.title}" fue ${status === "APPROVED" ? "aprobada" : "rechazada"}`, body: reviewNote || undefined, link: "/empleado/beneficios" });
}

export async function requestCertificate(ctx: ExecContext, employeeId: string, includeSalary: boolean, addressee?: string | null) {
  const open = await ctx.db.certificateRequest.findFirst({ where: { employeeId, status: "PENDING" } });
  if (open) fail("includeSalary", "Ya tienes un certificado pendiente de aprobación");
  const c = await ctx.db.certificateRequest.create({ data: { organizationId: ctx.orgId, employeeId, includeSalary, addressee: addressee?.trim() || null } });
  const emp = await employeeUserId(ctx, employeeId);
  await notify(ctx, await usersWithPermission(ctx, "hr.payroll.write"), { title: `${emp.name} solicitó un certificado laboral`, body: includeSalary ? "Con salario" : "Sin salario", link: "/hr/payroll/certificates" });
  return c;
}

export async function decideCertificate(ctx: OrgContext, id: string, status: "APPROVED" | "REJECTED", reviewNote?: string | null) {
  if (!ctx.can("hr.payroll.write")) fail("id", "Permiso requerido: hr.payroll.write");
  const c = await ctx.db.certificateRequest.findFirst({ where: { id }, include: { employee: true } });
  if (!c || c.status !== "PENDING") fail("id", "Solicitud no encontrada o ya decidida");
  if (status === "REJECTED" && !reviewNote?.trim()) fail("reviewNote", "El motivo de rechazo es obligatorio");
  await ctx.db.certificateRequest.update({ where: { id }, data: { status, reviewNote: reviewNote?.trim() || null, reviewedById: ctx.actorId } });
  if (c!.employee.userId) await notify(ctx, [c!.employee.userId], { title: status === "APPROVED" ? "Tu certificado laboral está listo para descargar" : "Tu solicitud de certificado fue rechazada", body: reviewNote || undefined, link: "/empleado/documentos" });
}

// ───────────── Nómina ─────────────

export async function createPayslip(ctx: ExecContext, d: {
  employeeId: string; period: string; grossAmount: number; deductions: number; paymentDueDate?: Date | null; fileId?: string | null;
  epsAmount?: number | null; arlAmount?: number | null; pensionAmount?: number | null;
}) {
  if (!d.period?.trim()) fail("period", "Periodo obligatorio");
  if (!Number.isFinite(d.grossAmount) || d.grossAmount <= 0) fail("grossAmount", "Devengado inválido");
  if (!Number.isFinite(d.deductions) || d.deductions < 0 || d.deductions > d.grossAmount) fail("deductions", "Deducciones inválidas");
  const emp = await employeeUserId(ctx, d.employeeId);
  const dup = await ctx.db.payslip.findFirst({ where: { employeeId: d.employeeId, period: d.period.trim() } });
  if (dup) fail("period", `${emp.name} ya tiene desprendible para ${d.period.trim()}`);
  const p = await ctx.db.payslip.create({
    data: {
      organizationId: ctx.orgId, employeeId: d.employeeId, period: d.period.trim(), grossAmount: d.grossAmount, deductions: d.deductions,
      netAmount: d.grossAmount - d.deductions, paymentDueDate: d.paymentDueDate ?? null, fileId: d.fileId || null,
      epsAmount: d.epsAmount ?? null, arlAmount: d.arlAmount ?? null, pensionAmount: d.pensionAmount ?? null,
    },
  });
  if (d.fileId) await ctx.db.fileObject.update({ where: { id: d.fileId }, data: { entityType: "hr_payslip", entityId: p.id } });
  if (emp.userId) await notify(ctx, [emp.userId], { title: `Tu desprendible de nómina ${p.period} está disponible`, link: `/empleado/nomina/${p.id}` });
  return p;
}

// ───────────── Centro de solicitudes (tickets) ─────────────

export const TICKET_SLA_HOURS: Record<string, number> = { URGENTE: 12, ALTA: 24, MEDIA: 72, BAJA: 120 };
export const TICKET_SLA_LABELS: Record<string, string> = { URGENTE: "Medio día", ALTA: "1 día", MEDIA: "3 días", BAJA: "5 días" };
export const TICKET_LOCATIONS = ["Oficina", "Bodega", "Producción", "Planta", "Comercial", "Otro"];
export const dueDateFor = (priority: string, from = new Date()) => new Date(from.getTime() + (TICKET_SLA_HOURS[priority] ?? 72) * 3600_000);
export const isTicketOverdue = (t: { dueDate: Date | null; status: string }, now = new Date()) =>
  Boolean(t.dueDate && !["FINALIZADO", "CANCELADO"].includes(t.status) && t.dueDate.getTime() < now.getTime());

export type TicketFieldDef = { key: string; label: string; type: "text" | "select" | "boolean"; options?: string[]; required?: boolean };

export function parseFields(schema: unknown): TicketFieldDef[] {
  if (!Array.isArray(schema)) return [];
  return schema.filter((f): f is TicketFieldDef => Boolean(f) && typeof (f as TicketFieldDef).key === "string");
}

/** Normaliza campos dinámicos escritos como líneas "Etiqueta | tipo | opción1, opción2 | obligatorio". */
export function fieldsFromText(text: string): TicketFieldDef[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [label, type = "text", options = "", req = ""] = line.split("|").map((s) => s.trim());
    const t = (["text", "select", "boolean"].includes(type) ? type : "text") as TicketFieldDef["type"];
    const key = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return { key, label, type: t, options: t === "select" ? options.split(",").map((o) => o.trim()).filter(Boolean) : undefined, required: /^(s[ií]|obligatorio|required|true)$/i.test(req) };
  }).filter((f) => f.key && f.label);
}
export const fieldsToText = (fields: TicketFieldDef[]) => fields.map((f) => [f.label, f.type, (f.options ?? []).join(", "), f.required ? "obligatorio" : ""].join(" | ").replace(/( \| )+$/, "")).join("\n");

/** El responsable debe pertenecer a alguno de los departamentos habilitados (o a cualquiera si no hay restricción). */
async function assigneeAllowed(ctx: ExecContext, allowedDepartmentIds: string[], userId: string) {
  const e = await ctx.db.employee.findFirst({ where: { userId, status: { not: "TERMINATED" } }, select: { departmentId: true } });
  if (allowedDepartmentIds.length === 0) return Boolean(e?.departmentId) || (await ctx.db.membership.count({ where: { userId, status: "ACTIVE" } })) > 0;
  return Boolean(e?.departmentId && allowedDepartmentIds.includes(e.departmentId));
}

/** RRHH, el responsable, el solicitante o un miembro de un departamento habilitado para la categoría. */
export async function canManageTicket(ctx: OrgContext, t: { employeeId: string; responsibleId: string | null; categoryId: string }) {
  if (ctx.can("hr.tickets.write")) return true;
  if (t.responsibleId && t.responsibleId === ctx.actorId) return true;
  const me = await myEmployee(ctx);
  if (!me) return false;
  if (t.employeeId === me.id) return true;
  if (!me.departmentId) return false;
  const cat = await ctx.db.hrRequestCategory.findFirst({ where: { id: t.categoryId }, select: { allowedDepartmentIds: true } });
  return Boolean(cat && cat.allowedDepartmentIds.length > 0 && cat.allowedDepartmentIds.includes(me.departmentId));
}

export async function createTicket(ctx: OrgContext, d: {
  categoryId: string; priority?: string; subject: string; description: string; location?: string | null;
  extraFields?: Record<string, string>; responsibleId?: string | null; fileIds?: string[];
}) {
  const me = await myEmployee(ctx);
  if (!me) fail("categoryId", "Necesitas una ficha de colaborador para crear solicitudes");
  if (!d.subject?.trim()) fail("subject", "Asunto obligatorio");
  if (!d.description?.trim()) fail("description", "Descripción obligatoria");
  const cat = await ctx.db.hrRequestCategory.findFirst({ where: { id: d.categoryId, active: true } });
  if (!cat) fail("categoryId", "Categoría no disponible");
  if (!ctx.can("hr.tickets.write") && cat!.allowedDepartmentIds.length > 0 && !(me!.departmentId && cat!.allowedDepartmentIds.includes(me!.departmentId))) {
    fail("categoryId", "Tu departamento no tiene acceso a esta categoría");
  }
  const fields = parseFields(cat!.fieldsSchema);
  const extra: Record<string, string> = {};
  for (const f of fields) {
    const v = d.extraFields?.[f.key]?.trim() ?? "";
    if (f.required && !v) fail(f.key, `El campo "${f.label}" es obligatorio`);
    if (f.type === "select" && v && f.options && !f.options.includes(v)) fail(f.key, `Valor inválido para "${f.label}"`);
    if (v) extra[f.key] = v;
  }
  const priority = TICKET_SLA_HOURS[d.priority ?? ""] ? d.priority! : "MEDIA";
  let responsibleId = cat!.defaultResponsibleId;
  if (d.responsibleId) {
    if (!(await assigneeAllowed(ctx, cat!.allowedDepartmentIds, d.responsibleId))) fail("responsibleId", "El responsable no pertenece a los departamentos de esta categoría");
    responsibleId = d.responsibleId;
  }
  const code = await nextNumber(ctx.db, ctx.orgId, "TK", 6);
  const t = await ctx.db.hrTicket.create({
    data: {
      organizationId: ctx.orgId, code, employeeId: me!.id, categoryId: cat!.id, priority, subject: d.subject.trim(), description: d.description.trim(),
      location: d.location?.trim() || null, extraFields: extra, responsibleId, dueDate: dueDateFor(priority),
    },
  });
  for (const fid of d.fileIds ?? []) await ctx.db.fileObject.update({ where: { id: fid }, data: { entityType: "hr_ticket", entityId: t.id } });
  await ctx.db.hrTicketEvent.create({ data: { organizationId: ctx.orgId, ticketId: t.id, actorId: ctx.actorId, type: "CREATED", toValue: code } });
  const targets = [...(await usersWithPermission(ctx, "hr.tickets.write")), ...(responsibleId ? [responsibleId] : [])].filter((u) => u !== ctx.actorId);
  await notify(ctx, targets, { title: `Solicitud ${code}: ${t.subject}`, body: `${cat!.name} · ${me!.name}`, link: `/hr/tickets/${t.id}` });
  await emitEvent(ctx, "HrTicketCreated", "hr_ticket", t.id, { code, category: cat!.name, priority });
  return t;
}

export async function updateTicket(ctx: OrgContext, id: string, d: { status?: string; priority?: string; responsibleId?: string | null; subject?: string; description?: string }) {
  const t = await ctx.db.hrTicket.findFirst({ where: { id }, include: { employee: true, category: true } });
  if (!t) fail("id", "Solicitud no encontrada");
  const privileged = ctx.can("hr.tickets.write");
  const manage = await canManageTicket(ctx, t!);
  const isOwner = t!.employee.userId === ctx.actorId;
  if (!manage) fail("id", "No autorizado");
  if (!privileged && (d.priority !== undefined || d.responsibleId !== undefined)) fail("priority", "Solo talento humano puede cambiar prioridad o responsable");
  if (!privileged && isOwner && t!.responsibleId !== ctx.actorId) {
    // El solicitante solo puede cancelar o editar mientras esté pendiente
    if (d.status && d.status !== "CANCELADO") fail("status", "Solo puedes cancelar tu solicitud");
    if (t!.status !== "PENDIENTE") fail("status", "Solo puedes modificar una solicitud pendiente");
  }
  if (d.subject !== undefined && !d.subject.trim()) fail("subject", "El asunto no puede quedar vacío");
  if (d.description !== undefined && !d.description.trim()) fail("description", "La descripción no puede quedar vacía");
  if (d.status && !["PENDIENTE", "EN_PROCESO", "ESPERANDO_RESPUESTA", "FINALIZADO", "CANCELADO"].includes(d.status)) fail("status", "Estado inválido");
  if (d.priority && !TICKET_SLA_HOURS[d.priority]) fail("priority", "Prioridad inválida");
  if (d.responsibleId && d.responsibleId !== t!.responsibleId && !(await assigneeAllowed(ctx, t!.category.allowedDepartmentIds, d.responsibleId))) fail("responsibleId", "El responsable no pertenece a los departamentos de esta categoría");

  const u = await ctx.db.hrTicket.update({
    where: { id },
    data: {
      status: d.status, priority: d.priority,
      dueDate: d.priority && d.priority !== t!.priority ? dueDateFor(d.priority, t!.createdAt) : undefined,
      responsibleId: d.responsibleId !== undefined ? d.responsibleId || null : undefined,
      subject: d.subject?.trim(), description: d.description?.trim(),
      resolvedAt: d.status === "FINALIZADO" ? new Date() : d.status ? null : undefined,
    },
  });
  const ev = (type: string, field: string, fromValue: string | null, toValue: string | null) =>
    ctx.db.hrTicketEvent.create({ data: { organizationId: ctx.orgId, ticketId: id, actorId: ctx.actorId, type, field, fromValue, toValue } });
  if (d.status && d.status !== t!.status) await ev("STATUS", "status", t!.status, d.status);
  if (d.priority && d.priority !== t!.priority) await ev("PRIORITY", "priority", t!.priority, d.priority);
  if (d.responsibleId !== undefined && (d.responsibleId || null) !== t!.responsibleId) {
    const names = await prisma.user.findMany({ where: { id: { in: [t!.responsibleId, d.responsibleId].filter(Boolean) as string[] } }, select: { id: true, name: true } });
    const n = (uid: string | null) => names.find((x) => x.id === uid)?.name ?? "Sin asignar";
    await ev("RESPONSIBLE", "responsible", n(t!.responsibleId), n(d.responsibleId || null));
    if (d.responsibleId && d.responsibleId !== ctx.actorId) await notify(ctx, [d.responsibleId], { title: `Te asignaron la solicitud ${t!.code}`, body: t!.subject, link: `/hr/tickets/${id}` });
  }
  if (d.subject !== undefined && d.subject.trim() !== t!.subject) await ev("EDITED", "subject", t!.subject, d.subject.trim());
  if (d.description !== undefined && d.description.trim() !== t!.description) await ev("EDITED", "description", null, null);
  if (d.status && d.status !== t!.status && t!.employee.userId && t!.employee.userId !== ctx.actorId) {
    await notify(ctx, [t!.employee.userId], { title: `Tu solicitud ${t!.code} cambió de estado`, body: d.status.replace(/_/g, " ").toLowerCase(), link: `/empleado/solicitudes/${id}` });
  }
  return u;
}

export async function commentTicket(ctx: OrgContext, id: string, message: string, fileIds: string[] = []) {
  const t = await ctx.db.hrTicket.findFirst({ where: { id }, include: { employee: true } });
  if (!t || !(await canManageTicket(ctx, t))) fail("id", "No autorizado");
  if (!message.trim() && fileIds.length === 0) fail("message", "Escribe un comentario o adjunta un archivo");
  if (message.trim()) {
    await ctx.db.hrTicketComment.create({ data: { organizationId: ctx.orgId, ticketId: id, userId: ctx.actorId!, message: message.trim() } });
    await ctx.db.hrTicketEvent.create({ data: { organizationId: ctx.orgId, ticketId: id, actorId: ctx.actorId, type: "COMMENT" } });
  }
  for (const fid of fileIds) {
    const f = await ctx.db.fileObject.update({ where: { id: fid }, data: { entityType: "hr_ticket", entityId: id } });
    await ctx.db.hrTicketEvent.create({ data: { organizationId: ctx.orgId, ticketId: id, actorId: ctx.actorId, type: "ATTACHMENT", toValue: f.name } });
  }
  const targets = [t!.employee.userId, t!.responsibleId].filter((u): u is string => Boolean(u) && u !== ctx.actorId);
  await notify(ctx, targets, { title: `Nuevo comentario en ${t!.code}`, body: message.slice(0, 140) || "Archivo adjunto", link: `/hr/tickets/${id}` });
}

// ───────────── Archivos de RRHH: quién puede abrirlos ─────────────

/** Regla de acceso a adjuntos de RRHH (soportes, documentos, desprendibles, tickets, hojas de vida). */
export async function canReadHrFile(ctx: OrgContext, f: { entityType: string | null; entityId: string | null; uploadedById: string | null }) {
  if (f.uploadedById && f.uploadedById === ctx.actorId) return true;
  if (!f.entityId) return false;
  const me = await myEmployee(ctx);
  const mine = (employeeId: string) => Boolean(me && me.id === employeeId);
  switch (f.entityType) {
    case "hr_time_off": {
      const t = await ctx.db.timeOffRequest.findFirst({ where: { id: f.entityId } });
      return Boolean(t && (ctx.can("hr.timeoff.read") || mine(t.employeeId) || (await isManagerOf(ctx, t.employeeId))));
    }
    case "hr_payslip": {
      const p = await ctx.db.payslip.findFirst({ where: { id: f.entityId } });
      return Boolean(p && (ctx.can("hr.payroll.read") || mine(p.employeeId)));
    }
    case "hr_document": {
      const d = await ctx.db.employeeDocument.findFirst({ where: { id: f.entityId } });
      return Boolean(d && (ctx.can("hr.employees.read") || mine(d.employeeId)));
    }
    case "hr_ticket": {
      const t = await ctx.db.hrTicket.findFirst({ where: { id: f.entityId } });
      return Boolean(t && (await canManageTicket(ctx, t)));
    }
    case "hr_candidate": return ctx.can("hr.recruiting.read");
    default: return false;
  }
}
