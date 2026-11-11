/**
 * Finanzas: gestión financiera del mes (basado en el módulo de finanzas de OR-K WORK).
 *
 * No duplica datos: lee lo que ya registran otras apps y le suma lo que no tiene otro hogar.
 *  - Ingresos: facturas de cliente (Facturación, sin IVA) + otros ingresos (FinIncome)
 *  - Cobros y cartera: pagos recibidos y saldos abiertos (Facturación)
 *  - Costos: facturas de proveedor (Compras), nómina (Talento humano), flota (Logística),
 *            gastos sueltos (FinExpense) y gastos fijos aún no pagados (FinRecurringCost)
 *  - Presupuesto por categoría (FinBudget)
 */
import type { ExecContext } from "@/lib/core/context";
import { emitEvent } from "@/lib/core/events";
import { registerPayment as pay } from "./invoicing";
import { ValidationError } from "./crm";

/** Compatibilidad: abono a factura de cliente con el diario de banco por defecto. */
export async function registerPayment(ctx: ExecContext, invoiceId: string, amount: number) {
  await pay(ctx, { invoiceId, amount });
}

/* ─────────────────────────────── Categorías ─────────────────────────────── */

/** `auto`: la llenan otras apps; no se registran a mano. */
export const FIN_CATEGORIES = [
  { id: "payroll", label: "Nómina", group: "Personas", auto: true },
  { id: "contractors", label: "Contratistas y servicios externos", group: "Personas" },
  { id: "training", label: "Capacitación y bienestar", group: "Personas" },
  { id: "purchases", label: "Compras a proveedores", group: "Operación", auto: true },
  { id: "fleet", label: "Flota y transporte", group: "Operación", auto: true },
  { id: "rent", label: "Arriendo y sede", group: "Operación" },
  { id: "utilities", label: "Servicios públicos", group: "Operación" },
  { id: "internet", label: "Internet y telefonía", group: "Operación" },
  { id: "software", label: "Software y suscripciones", group: "Operación" },
  { id: "equipment", label: "Equipos y tecnología", group: "Operación" },
  { id: "maintenance", label: "Mantenimiento y reparaciones", group: "Operación" },
  { id: "supplies", label: "Papelería, aseo y cafetería", group: "Operación" },
  { id: "marketing", label: "Marketing y publicidad", group: "Comercial" },
  { id: "travel", label: "Viáticos y desplazamientos", group: "Comercial" },
  { id: "professional", label: "Contabilidad, legal y asesorías", group: "Administración" },
  { id: "taxes", label: "Impuestos (ICA, renta, 4×1000…)", group: "Administración" },
  { id: "banking", label: "Bancos y comisiones", group: "Administración" },
  { id: "insurance", label: "Seguros", group: "Administración" },
  { id: "other", label: "Otros", group: "Administración" },
] as const;

export type FinCategory = (typeof FIN_CATEGORIES)[number]["id"];
const CATEGORY_IDS = new Set<string>(FIN_CATEGORIES.map((c) => c.id));
export const CATEGORY_LABEL = Object.fromEntries(FIN_CATEGORIES.map((c) => [c.id, c.label])) as Record<string, string>;
/** Categorías que se pueden registrar a mano (gastos y gastos fijos). */
export const MANUAL_CATEGORIES = FIN_CATEGORIES.filter((c) => !("auto" in c && c.auto));

export const FREQ_MONTHS = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 } as const;
export type Frequency = keyof typeof FREQ_MONTHS;
export const FREQ_LABEL: Record<Frequency, string> = { monthly: "Mensual", quarterly: "Trimestral", semiannual: "Semestral", annual: "Anual" };

/* ─────────────────────────────── Fechas (YYYY-MM) ─────────────────────────────── */

/*
 * Dos clases de fecha:
 *  - Columnas @db.Date (gastos, ingresos, gastos fijos): un día sin hora, guardado a medianoche UTC → se leen en UTC.
 *  - Columnas con hora (facturas, pagos, flota, contratos): un instante → se leen en hora de Colombia (UTC−5, sin horario de verano),
 *    para que una factura del 31 a las 8 p. m. cuente en ese mes y "hoy" no salte al día siguiente después de las 7 p. m.
 */
export const TZ = "America/Bogota";
const TZ_OFFSET = "-05:00";
/** Mes de una columna @db.Date. */
export const ymOf = (d: Date) => d.toISOString().slice(0, 7);
/** Día local (YYYY-MM-DD) de un instante; sin argumento, hoy. */
export const localDay = (d: Date = new Date()) => d.toLocaleDateString("en-CA", { timeZone: TZ });
/** Mes local (YYYY-MM) de un instante. */
export const localYm = (d: Date) => localDay(d).slice(0, 7);
/** Inicio del mes en hora local, para filtrar columnas con hora. */
const localMonthStart = (ym: string) => new Date(`${ym}-01T00:00:00${TZ_OFFSET}`);
const ymIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
export const addMonths = (ym: string, n: number) => fromIndex(ymIndex(ym) + n);
/** Últimos N meses (el más antiguo primero), terminando en `ym`. */
export const lastMonths = (ym: string, n: number) => Array.from({ length: n }, (_, i) => addMonths(ym, i - n + 1));
export const monthStart = (ym: string) => new Date(`${ym}-01T00:00:00.000Z`);
export const monthLabel = (ym: string, opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("es-CO", { ...opts, timeZone: "UTC" });
export const isYm = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
/** Fecha YYYY-MM-DD → Date a medianoche UTC (columnas @db.Date). */
export const dayDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/* ─────────────────────────────── Gastos fijos ─────────────────────────────── */

export type RecurringLike = { amount: number; frequency: string; dueDay: number; startOn: Date; endOn: Date | null; active: boolean };
const freqMonths = (f: string) => FREQ_MONTHS[f as Frequency] ?? 1;

/** Lo que pesa un gasto fijo por mes (anual / 12, etc.). */
export const monthlyEquivalent = (r: Pick<RecurringLike, "amount" | "frequency">) => r.amount / freqMonths(r.frequency);

/** Si el gasto fijo se cobra en `ym`, el día (YYYY-MM-DD); si no, null. */
export function dueInMonth(r: RecurringLike, ym: string): string | null {
  if (!r.active) return null;
  const m = ymIndex(ym);
  const start = ymIndex(ymOf(r.startOn));
  if (m < start) return null;
  if (r.endOn && m > ymIndex(ymOf(r.endOn))) return null;
  if ((m - start) % freqMonths(r.frequency) !== 0) return null;
  const [y, mo] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${ym}-${String(Math.min(r.dueDay, last)).padStart(2, "0")}`;
}

/* ─────────────────────────────── Lectura del mes ─────────────────────────────── */

const n = (v: unknown) => Number(v ?? 0);
const sumBy = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

/** Salario mensual equivalente de un colaborador (para estimar nómina sin desprendibles). */
function monthlySalary(e: { salaryAmount: unknown; salaryPeriod: string }) {
  const s = n(e.salaryAmount);
  return e.salaryPeriod === "BIWEEKLY" ? s * 2 : e.salaryPeriod === "HOURLY" ? s * 192 : s;
}

export type Upcoming = { date: string; label: string; detail: string; amount: number; kind: "fixed" | "bill" | "payroll"; href?: string };

/**
 * Todo lo que necesita el tablero de Finanzas para `ym`, más 12 meses de tendencia.
 * Lee de las apps activas o no: si una app no tiene datos, simplemente suma cero.
 */
export async function loadFinance(ctx: ExecContext, ym: string) {
  const months = lastMonths(ym, 12);
  const from = monthStart(months[0]);
  const to = monthStart(addMonths(ym, 1));
  // Mismos límites en hora local para columnas con hora
  const fromL = localMonthStart(months[0]);
  const toL = localMonthStart(addMonths(ym, 1));
  const today = localDay();
  const thisYm = today.slice(0, 7);
  const [year, month] = ym.split("-").map(Number);

  const [recurring, expenses, otherIncome, budgets, invoices, bills, payments, fleet, payslips, employees, openInvoices, openBills, unpaidPayslips] = await Promise.all([
    ctx.db.finRecurringCost.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    ctx.db.finExpense.findMany({ where: { spentOn: { gte: from, lt: to } }, orderBy: { spentOn: "desc" } }),
    ctx.db.finIncome.findMany({ where: { receivedOn: { gte: from, lt: monthStart(addMonths(ym, 13)) } }, orderBy: { receivedOn: "desc" } }),
    ctx.db.finBudget.findMany({ where: { year, month } }),
    ctx.db.invoice.findMany({
      where: { issuedAt: { gte: fromL, lt: toL }, status: { in: ["issued", "paid"] } },
      select: { id: true, number: true, type: true, subtotal: true, issuedAt: true, customerId: true, customer: { select: { name: true } } },
    }),
    ctx.db.bill.findMany({ where: { issuedAt: { gte: fromL, lt: toL }, status: { not: "void" } }, select: { subtotal: true, issuedAt: true } }),
    ctx.db.payment.findMany({ where: { date: { gte: localMonthStart(ym), lt: toL }, direction: "INBOUND" }, select: { amount: true } }),
    ctx.db.transportCost.findMany({ where: { date: { gte: fromL, lt: toL } }, select: { amount: true, date: true } }),
    ctx.db.payslip.findMany({ where: { period: { gte: months[0], lt: `${addMonths(ym, 1)}` } }, select: { period: true, grossAmount: true } }),
    ctx.db.employee.findMany({
      where: { status: { in: ["ACTIVE", "ON_LEAVE"] }, salaryAmount: { not: null } },
      select: { salaryAmount: true, salaryPeriod: true, hireDate: true, terminationDate: true },
    }),
    ctx.db.invoice.findMany({ where: { type: "OUT_INVOICE", status: "issued" }, select: { balance: true } }),
    ctx.db.bill.findMany({ where: { status: "posted" }, select: { id: true, number: true, balance: true, dueDate: true, supplier: { select: { name: true } } } }),
    ctx.db.payslip.findMany({ where: { isPaid: false, paymentDueDate: { not: null } }, select: { netAmount: true, paymentDueDate: true, period: true } }),
  ]);

  const rec = recurring.map((r) => ({ ...r, amount: n(r.amount) }));
  const inMonth = (d: Date, m: string) => ymOf(d) === m; // columnas @db.Date
  const inMonthL = (d: Date, m: string) => localYm(d) === m; // columnas con hora

  /** Nómina de un mes: desprendibles cargados; si no hay y es el mes actual o futuro, estimada por salarios. */
  const payrollOf = (m: string) => {
    const slips = payslips.filter((p) => p.period.startsWith(m));
    if (slips.length) return { amount: sumBy(slips, (p) => n(p.grossAmount)), estimated: false };
    if (m < thisYm) return { amount: 0, estimated: false };
    const start = localMonthStart(m), end = localMonthStart(addMonths(m, 1));
    const active = employees.filter((e) => (!e.hireDate || e.hireDate < end) && (!e.terminationDate || e.terminationDate >= start));
    const amount = sumBy(active, monthlySalary);
    return { amount, estimated: amount > 0 };
  };

  /** Costos de un mes por categoría (incluye gastos fijos aún sin pagar desde el mes actual). */
  const costsOf = (m: string) => {
    const by: Record<string, number> = {};
    const add = (cat: string, v: number) => { if (v) by[cat] = (by[cat] ?? 0) + v; };
    const ex = expenses.filter((e) => inMonth(e.spentOn, m));
    for (const e of ex) add(e.category, n(e.amount));
    add("purchases", sumBy(bills.filter((b) => inMonthL(b.issuedAt, m)), (b) => n(b.subtotal)));
    add("fleet", sumBy(fleet.filter((f) => inMonthL(f.date, m)), (f) => n(f.amount)));
    const payroll = payrollOf(m);
    add("payroll", payroll.amount);
    const paid = new Set(ex.map((e) => e.recurringId).filter(Boolean));
    const pending = m >= thisYm ? rec.filter((r) => dueInMonth(r, m) && !paid.has(r.id)) : [];
    for (const r of pending) add(r.category, r.amount);
    return { by, total: Object.values(by).reduce((a, b) => a + b, 0), pending, payrollEstimated: payroll.estimated };
  };

  /** Ingresos de un mes: facturas (sin IVA, menos notas crédito) + otros ingresos recibidos. */
  const incomeOf = (m: string) => {
    const inv = invoices.filter((i) => inMonthL(i.issuedAt, m));
    const invoiced = sumBy(inv, (i) => (i.type === "OUT_REFUND" ? -1 : 1) * n(i.subtotal));
    const other = sumBy(otherIncome.filter((i) => i.status === "received" && inMonth(i.receivedOn, m)), (i) => n(i.amount));
    const scheduled = sumBy(otherIncome.filter((i) => i.status === "scheduled" && inMonth(i.receivedOn, m)), (i) => n(i.amount));
    return { invoiced, other, scheduled, total: invoiced + other };
  };

  const cost = costsOf(ym);
  const income = incomeOf(ym);
  const trend = months.map((m) => ({ m, income: incomeOf(m).total, cost: costsOf(m).total }));

  /* Próximos pagos (30 días) */
  const horizon = localDay(new Date(Date.now() + 30 * 86_400_000));
  const nextYms = [thisYm, addMonths(thisYm, 1)];
  const paidNow = new Set(
    (await ctx.db.finExpense.findMany({ where: { spentOn: { gte: monthStart(thisYm), lt: monthStart(addMonths(thisYm, 2)) }, recurringId: { not: null } }, select: { recurringId: true, spentOn: true } }))
      .map((e) => `${e.recurringId}:${ymOf(e.spentOn)}`),
  );
  const upcoming: Upcoming[] = [
    ...rec.flatMap((r) =>
      nextYms
        .map((m) => ({ m, due: dueInMonth(r, m) }))
        .filter((x): x is { m: string; due: string } => !!x.due && x.due >= today && x.due <= horizon && !paidNow.has(`${r.id}:${x.m}`))
        .map((x) => ({ date: x.due, label: r.name, detail: CATEGORY_LABEL[r.category] ?? r.category, amount: r.amount, kind: "fixed" as const, href: "/finance/fixed" })),
    ),
    ...openBills
      .filter((b) => n(b.balance) > 0 && localDay(b.dueDate) <= horizon)
      .map((b) => ({ date: localDay(b.dueDate), label: b.supplier.name, detail: `Factura ${b.number}`, amount: n(b.balance), kind: "bill" as const, href: "/invoicing/bills" })),
    ...unpaidPayslips
      .filter((p) => localDay(p.paymentDueDate!) <= horizon)
      .reduce<Upcoming[]>((acc, p) => {
        const d = localDay(p.paymentDueDate!);
        const row = acc.find((x) => x.date === d);
        if (row) row.amount += n(p.netAmount);
        else acc.push({ date: d, label: "Nómina", detail: `Periodo ${p.period}`, amount: n(p.netAmount), kind: "payroll", href: "/hr/payroll" });
        return acc;
      }, []),
  ].sort((a, b) => a.date.localeCompare(b.date));

  /* Rentabilidad por cliente (12 meses): facturado sin IVA + otros ingresos − gastos cargados al cliente */
  const yearExpenses = await ctx.db.finExpense.findMany({ where: { spentOn: { gte: from, lt: to }, customerId: { not: null } }, select: { customerId: true, amount: true } });
  const byCustomer = new Map<string, { id: string; name: string; invoiced: number; other: number; direct: number; invoices: number }>();
  const row = (id: string, name = "") => {
    let r = byCustomer.get(id);
    if (!r) byCustomer.set(id, (r = { id, name, invoiced: 0, other: 0, direct: 0, invoices: 0 }));
    if (name && !r.name) r.name = name;
    return r;
  };
  for (const i of invoices) {
    const r = row(i.customerId, i.customer.name);
    r.invoiced += (i.type === "OUT_REFUND" ? -1 : 1) * n(i.subtotal);
    if (i.type === "OUT_INVOICE") r.invoices++;
  }
  for (const i of otherIncome) if (i.customerId && i.status === "received" && i.receivedOn < to) row(i.customerId).other += n(i.amount);
  for (const e of yearExpenses) row(e.customerId!).direct += n(e.amount);
  const missing = [...byCustomer.values()].filter((r) => !r.name).map((r) => r.id);
  if (missing.length) {
    for (const c of await ctx.db.customer.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } })) row(c.id).name = c.name;
  }
  const profitability = [...byCustomer.values()]
    .map((r) => ({ ...r, revenue: r.invoiced + r.other, margin: r.invoiced + r.other - r.direct }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    ym, months, today,
    recurring: rec,
    expenses: expenses.filter((e) => inMonth(e.spentOn, ym)).map((e) => ({ ...e, amount: n(e.amount) })),
    otherIncome: otherIncome.map((i) => ({ ...i, amount: n(i.amount) })),
    invoices: invoices.filter((i) => inMonthL(i.issuedAt, ym)).map((i) => ({ ...i, subtotal: n(i.subtotal) })),
    budget: Object.fromEntries(budgets.map((b) => [b.category, n(b.amount)])) as Record<string, number>,
    cost, income, trend, upcoming, profitability,
    collected: sumBy(payments, (p) => n(p.amount)),
    receivable: sumBy(openInvoices, (i) => n(i.balance)),
    payable: sumBy(openBills, (b) => n(b.balance)),
    fixedMonthly: sumBy(rec.filter((r) => r.active && (!r.endOn || ymOf(r.endOn) >= ym)), monthlyEquivalent),
  };
}

export type FinanceData = Awaited<ReturnType<typeof loadFinance>>;

/* ─────────────────────────────── Escritura ─────────────────────────────── */

const money = (v: unknown, field = "amount") => {
  const x = Number(v);
  if (!Number.isFinite(x) || x < 0) throw new ValidationError({ [field]: "El valor debe ser un número mayor o igual a cero" });
  return Math.round(x * 100) / 100;
};
const ymd = (v: unknown, field: string) => {
  const s = String(v ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ValidationError({ [field]: "Fecha inválida" });
  return dayDate(s);
};
const category = (v: unknown, allowAuto = false) => {
  const c = String(v ?? "");
  const def = FIN_CATEGORIES.find((x) => x.id === c);
  if (!CATEGORY_IDS.has(c) || (!allowAuto && def && "auto" in def && def.auto)) throw new ValidationError({ category: "Categoría inválida" });
  return c;
};
async function customerOrNull(ctx: ExecContext, id: unknown) {
  const s = String(id ?? "");
  if (!s) return null;
  // ctx.db filtra por organización: un id de otra empresa no se encuentra
  const c = await ctx.db.customer.findUnique({ where: { id: s }, select: { id: true } });
  if (!c) throw new ValidationError({ customerId: "Cliente no encontrado" });
  return c.id;
}

export async function createExpense(ctx: ExecContext, d: { spentOn: string; category: string; amount: unknown; vendor?: string; description?: string; customerId?: string; recurringId?: string }) {
  let recurringId: string | null = null;
  if (d.recurringId) {
    const r = await ctx.db.finRecurringCost.findUnique({ where: { id: d.recurringId }, select: { id: true } });
    if (!r) throw new ValidationError({ recurringId: "Gasto fijo no encontrado" });
    recurringId = r.id;
  }
  const e = await ctx.db.finExpense.create({
    data: {
      organizationId: ctx.orgId, spentOn: ymd(d.spentOn, "spentOn"), category: category(d.category), amount: money(d.amount),
      vendor: d.vendor?.trim() ?? "", description: d.description?.trim() ?? "", customerId: await customerOrNull(ctx, d.customerId),
      recurringId, createdById: ctx.actorId,
    },
  });
  await emitEvent(ctx, "FinExpenseCreated", "fin_expense", e.id, { category: e.category, amount: Number(e.amount) });
  return e;
}

/** Registra el pago de la cuota de un gasto fijo en un mes (crea el gasto enlazado). */
export async function payRecurring(ctx: ExecContext, recurringId: string, ym: string) {
  const r = await ctx.db.finRecurringCost.findUniqueOrThrow({ where: { id: recurringId } });
  const due = dueInMonth({ ...r, amount: Number(r.amount) }, ym) ?? `${ym}-01`;
  const already = await ctx.db.finExpense.findFirst({ where: { recurringId, spentOn: { gte: monthStart(ym), lt: monthStart(addMonths(ym, 1)) } } });
  if (already) throw new Error("Esta cuota ya está registrada como pagada");
  return createExpense(ctx, { spentOn: due, category: r.category, amount: Number(r.amount), vendor: r.vendor, description: r.name, recurringId });
}

export async function saveRecurring(ctx: ExecContext, d: { id?: string; name: string; category: string; amount: unknown; frequency: string; dueDay: unknown; startOn: string; endOn?: string; vendor?: string; notes?: string }) {
  if (!d.name?.trim()) throw new ValidationError({ name: "Nombre obligatorio" });
  if (!(d.frequency in FREQ_MONTHS)) throw new ValidationError({ frequency: "Frecuencia inválida" });
  const dueDay = Math.trunc(Number(d.dueDay));
  if (!(dueDay >= 1 && dueDay <= 31)) throw new ValidationError({ dueDay: "El día de pago va de 1 a 31" });
  const startOn = ymd(`${String(d.startOn).slice(0, 7)}-01`, "startOn");
  const endOn = d.endOn ? ymd(`${String(d.endOn).slice(0, 7)}-01`, "endOn") : null;
  if (endOn && endOn < startOn) throw new ValidationError({ endOn: "La fecha final es anterior al inicio" });
  const data = {
    name: d.name.trim(), category: category(d.category), amount: money(d.amount), frequency: d.frequency, dueDay,
    startOn, endOn, vendor: d.vendor?.trim() ?? "", notes: d.notes?.trim() ?? "",
  };
  return d.id
    ? ctx.db.finRecurringCost.update({ where: { id: d.id }, data })
    : ctx.db.finRecurringCost.create({ data: { ...data, organizationId: ctx.orgId, createdById: ctx.actorId } });
}

export async function createIncome(ctx: ExecContext, d: { receivedOn: string; description: string; amount: unknown; status: string; customerId?: string }) {
  if (!d.description?.trim()) throw new ValidationError({ description: "Describe el ingreso" });
  if (d.status !== "received" && d.status !== "scheduled") throw new ValidationError({ status: "Estado inválido" });
  return ctx.db.finIncome.create({
    data: {
      organizationId: ctx.orgId, receivedOn: ymd(d.receivedOn, "receivedOn"), description: d.description.trim(), amount: money(d.amount),
      status: d.status, customerId: await customerOrNull(ctx, d.customerId), createdById: ctx.actorId,
    },
  });
}

/** Guarda el presupuesto de un mes: una fila por categoría con valor > 0; las vacías se borran. */
export async function saveBudget(ctx: ExecContext, ym: string, values: Record<string, unknown>) {
  if (!isYm(ym)) throw new ValidationError({ month: "Mes inválido" });
  const [year, month] = ym.split("-").map(Number);
  for (const c of FIN_CATEGORIES) {
    const raw = values[c.id];
    const amount = raw === "" || raw == null ? 0 : money(raw, c.id);
    if (amount > 0) {
      await ctx.db.finBudget.upsert({
        where: { organizationId_year_month_category: { organizationId: ctx.orgId, year, month, category: c.id } },
        create: { organizationId: ctx.orgId, year, month, category: c.id, amount },
        update: { amount },
      });
    } else {
      await ctx.db.finBudget.deleteMany({ where: { year, month, category: c.id } });
    }
  }
}

/** Copia el presupuesto del mes anterior al mes indicado (solo categorías vacías). */
export async function copyBudgetFromPrevious(ctx: ExecContext, ym: string) {
  const prev = addMonths(ym, -1);
  const [py, pm] = prev.split("-").map(Number);
  const [year, month] = ym.split("-").map(Number);
  const [src, existing] = await Promise.all([
    ctx.db.finBudget.findMany({ where: { year: py, month: pm } }),
    ctx.db.finBudget.findMany({ where: { year, month }, select: { category: true } }),
  ]);
  const has = new Set(existing.map((b) => b.category));
  const rows = src.filter((b) => !has.has(b.category));
  if (!src.length) throw new Error(`No hay presupuesto en ${monthLabel(prev)} para copiar`);
  if (rows.length) await ctx.db.finBudget.createMany({ data: rows.map((b) => ({ organizationId: ctx.orgId, year, month, category: b.category, amount: b.amount })) });
  return rows.length;
}
