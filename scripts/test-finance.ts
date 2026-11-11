import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "@/lib/core/prisma";
import { tenantDb } from "@/lib/core/db";
import type { ExecContext } from "@/lib/core/context";
import {
  addMonths, localDay, localYm, copyBudgetFromPrevious, createExpense, createIncome, dayDate, dueInMonth, lastMonths, loadFinance,
  monthlyEquivalent, payRecurring, saveBudget, saveRecurring,
} from "@/lib/apps/finance";

/** Finanzas: cálculo de cuotas, lectura del mes desde otras apps, escritura, validaciones y aislamiento. */
function pure() {
  const base = { amount: 1200, frequency: "monthly", dueDay: 31, startOn: dayDate("2026-01-01"), endOn: null, active: true };
  assert.equal(dueInMonth(base, "2026-02"), "2026-02-28"); // día 31 en febrero → último día
  assert.equal(dueInMonth(base, "2026-04"), "2026-04-30");
  assert.equal(dueInMonth(base, "2025-12"), null); // antes de empezar
  assert.equal(dueInMonth({ ...base, active: false }, "2026-03"), null);
  assert.equal(dueInMonth({ ...base, endOn: dayDate("2026-03-01") }, "2026-04"), null); // después de terminar
  assert.equal(dueInMonth({ ...base, endOn: dayDate("2026-03-01") }, "2026-03"), "2026-03-31");
  const q = { ...base, frequency: "quarterly", dueDay: 10 };
  assert.deepEqual(lastMonths("2026-07", 7).map((m) => dueInMonth(q, m)), ["2026-01-10", null, null, "2026-04-10", null, null, "2026-07-10"]);
  const a = { ...base, frequency: "annual", dueDay: 15, startOn: dayDate("2025-05-01") };
  assert.equal(dueInMonth(a, "2026-05"), "2026-05-15");
  assert.equal(dueInMonth(a, "2026-06"), null);
  assert.equal(monthlyEquivalent({ amount: 1200, frequency: "annual" }), 100);
  assert.equal(monthlyEquivalent({ amount: 900, frequency: "quarterly" }), 300);
  assert.equal(addMonths("2026-11", 2), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.deepEqual(lastMonths("2026-02", 3), ["2025-12", "2026-01", "2026-02"]);
  // 31 de octubre 8 p. m. en Colombia = 1 de noviembre 01:00 UTC → cuenta en octubre
  assert.equal(localYm(new Date("2026-11-01T01:00:00Z")), "2026-10");
  assert.equal(localDay(new Date("2026-11-12T03:30:00Z")), "2026-11-11");
  console.log("1. cuotas por frecuencia, meses cortos, inicio/fin, equivalente mensual y hora de Colombia: ok");
}

async function cleanup(slugs: string[]) {
  const ids = (await prisma.organization.findMany({ where: { slug: { in: slugs } }, select: { id: true } })).map((o) => o.id);
  if (!ids.length) return;
  const w = { where: { organizationId: { in: ids } } };
  await prisma.finExpense.deleteMany(w);
  await prisma.finRecurringCost.deleteMany(w);
  await prisma.finIncome.deleteMany(w);
  await prisma.finBudget.deleteMany(w);
  await prisma.payment.deleteMany(w);
  await prisma.invoice.deleteMany(w);
  await prisma.bill.deleteMany(w);
  await prisma.payslip.deleteMany(w);
  await prisma.employee.deleteMany(w);
  await prisma.transportCost.deleteMany(w);
  await prisma.customer.deleteMany(w);
  await prisma.supplier.deleteMany(w);
  await prisma.domainEvent.deleteMany(w);
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  pure();
  await cleanup(["test-fin", "test-fin-b"]);
  const o = await prisma.organization.create({ data: { slug: "test-fin", name: "Test Finanzas", status: "ACTIVE" } });
  const ob = await prisma.organization.create({ data: { slug: "test-fin-b", name: "Otra", status: "ACTIVE" } });
  const db = tenantDb(o.id);
  const ctx: ExecContext = { orgId: o.id, db, actorId: null };
  const ctxB: ExecContext = { orgId: ob.id, db: tenantDb(ob.id), actorId: null };

  const ym = localDay().slice(0, 7);
  const prev = addMonths(ym, -1);
  const mid = (m: string) => new Date(`${m}-12T15:00:00Z`);

  // Datos de otras apps
  const cust = await db.customer.create({ data: { organizationId: o.id, name: "Cliente Uno" } });
  const sup = await db.supplier.create({ data: { organizationId: o.id, name: "Proveedor Uno" } });
  await db.invoice.create({ data: { organizationId: o.id, number: "FV-1", customerId: cust.id, subtotal: 10_000, tax: 1_900, total: 11_900, balance: 4_000, issuedAt: mid(ym), dueDate: mid(ym), status: "issued" } });
  await db.invoice.create({ data: { organizationId: o.id, number: "NC-1", type: "OUT_REFUND", customerId: cust.id, subtotal: 1_000, total: 1_190, balance: 0, issuedAt: mid(ym), dueDate: mid(ym), status: "paid" } });
  await db.invoice.create({ data: { organizationId: o.id, number: "FV-0", customerId: cust.id, subtotal: 99_999, total: 99_999, balance: 0, issuedAt: mid(ym), dueDate: mid(ym), status: "void" } }); // anulada: no cuenta
  await db.invoice.create({ data: { organizationId: o.id, number: "FV-P", customerId: cust.id, subtotal: 5_000, total: 5_950, balance: 0, issuedAt: mid(prev), dueDate: mid(prev), status: "paid" } });
  await db.payment.create({ data: { organizationId: o.id, number: "P-1", direction: "INBOUND", journalId: "x", partnerName: "Cliente Uno", amount: 7_900, date: mid(ym) } });
  await db.bill.create({ data: { organizationId: o.id, number: "FP-1", supplierId: sup.id, subtotal: 3_000, tax: 570, total: 3_570, balance: 3_570, issuedAt: mid(ym), dueDate: new Date(Date.now() + 5 * 86_400_000) } });
  await db.transportCost.create({ data: { organizationId: o.id, vehicleId: "v", date: mid(ym), category: "COMBUSTIBLE", amount: 700, createdById: "x" } });
  const emp = await db.employee.create({ data: { organizationId: o.id, name: "Ana", salaryAmount: 2_000, salaryPeriod: "MONTHLY", hireDate: dayDate("2020-01-01") } });
  await db.payslip.create({ data: { organizationId: o.id, employeeId: emp.id, period: prev, grossAmount: 1_800, deductions: 0, netAmount: 1_800 } });

  // Escritura de Finanzas
  const rent = await saveRecurring(ctx, { name: "Arriendo", category: "rent", amount: 5_000, frequency: "monthly", dueDay: 28, startOn: addMonths(ym, -3) });
  await saveRecurring(ctx, { name: "Seguro", category: "insurance", amount: 12_000, frequency: "annual", dueDay: 1, startOn: addMonths(ym, 1) });
  await createExpense(ctx, { spentOn: `${ym}-02`, category: "travel", amount: 400, customerId: cust.id, description: "Visita" });
  await createIncome(ctx, { receivedOn: `${ym}-03`, description: "Intereses", amount: 250, status: "received", customerId: cust.id });
  await createIncome(ctx, { receivedOn: `${ym}-20`, description: "Cuota futura", amount: 600, status: "scheduled" });

  let f = await loadFinance(ctx, ym);
  assert.equal(f.income.invoiced, 9_000); // 10.000 − 1.000 de nota crédito, sin IVA, sin anuladas
  assert.equal(f.income.other, 250);
  assert.equal(f.income.scheduled, 600);
  assert.equal(f.income.total, 9_250);
  assert.equal(f.collected, 7_900);
  assert.equal(f.receivable, 4_000);
  assert.equal(f.payable, 3_570);
  assert.equal(f.cost.by.purchases, 3_000);
  assert.equal(f.cost.by.fleet, 700);
  assert.equal(f.cost.by.payroll, 2_000); // mes actual sin desprendibles → estimada por salario
  assert.equal(f.cost.payrollEstimated, true);
  assert.equal(f.cost.by.rent, 5_000); // pendiente del mes
  assert.equal(f.cost.by.insurance, undefined); // empieza el mes siguiente
  assert.equal(f.cost.by.travel, 400);
  assert.equal(f.cost.total, 3_000 + 700 + 2_000 + 5_000 + 400);
  assert.equal(f.fixedMonthly, 5_000 + 1_000);
  assert.ok(f.upcoming.some((u) => u.kind === "bill" && u.amount === 3_570));
  const pf = await loadFinance(ctx, prev);
  assert.equal(pf.cost.by.payroll, 1_800); // mes pasado: desprendibles reales
  assert.equal(pf.cost.payrollEstimated, false);
  assert.equal(pf.income.invoiced, 5_000);
  assert.equal(pf.cost.by.rent, undefined); // un mes pasado no suma cuotas sin pagar
  assert.equal(f.trend.at(-2)!.income, 5_000);
  const p = f.profitability.find((r) => r.id === cust.id)!;
  assert.deepEqual([p.invoiced, p.other, p.direct, p.margin, p.invoices], [14_000, 250, 400, 13_850, 2]);
  console.log("2. lectura del mes: facturas sin IVA, notas crédito, anuladas, cobros, cartera, compras, flota, nómina real y estimada: ok");

  // Pagar la cuota de un gasto fijo: deja de estar pendiente y no se puede pagar dos veces
  await payRecurring(ctx, rent.id, ym);
  f = await loadFinance(ctx, ym);
  assert.equal(f.cost.pending.length, 0);
  assert.equal(f.cost.by.rent, 5_000); // ahora como gasto real, no doble
  assert.equal(f.expenses.find((e) => e.recurringId === rent.id)!.spentOn.toISOString().slice(0, 10), `${ym}-28`);
  await assert.rejects(() => payRecurring(ctx, rent.id, ym), /ya está registrada/);
  console.log("3. pagar cuota de gasto fijo (fecha de vencimiento, sin duplicar): ok");

  // Presupuesto: guarda, borra en cero, copia sin pisar
  await saveBudget(ctx, prev, { rent: 5_000, travel: 300, payroll: 2_000 });
  await saveBudget(ctx, ym, { rent: 6_000 });
  assert.equal(await copyBudgetFromPrevious(ctx, ym), 2);
  f = await loadFinance(ctx, ym);
  assert.deepEqual(f.budget, { rent: 6_000, travel: 300, payroll: 2_000 });
  await saveBudget(ctx, ym, { rent: 6_000, travel: "", payroll: 0 });
  assert.deepEqual((await loadFinance(ctx, ym)).budget, { rent: 6_000 });
  await assert.rejects(() => copyBudgetFromPrevious(ctx, addMonths(ym, -6)), /No hay presupuesto/);
  console.log("4. presupuesto: guardar, borrar en cero, copiar del mes anterior sin pisar: ok");

  // Validaciones
  await assert.rejects(() => createExpense(ctx, { spentOn: `${ym}-02`, category: "travel", amount: -5 }), /mayor o igual a cero/);
  await assert.rejects(() => createExpense(ctx, { spentOn: `${ym}-02`, category: "payroll", amount: 5 }), /Categoría inválida/); // automática
  await assert.rejects(() => createExpense(ctx, { spentOn: "ayer", category: "travel", amount: 5 }), /Fecha inválida/);
  await assert.rejects(() => saveRecurring(ctx, { name: "X", category: "rent", amount: 1, frequency: "weekly", dueDay: 1, startOn: ym }), /Frecuencia/);
  await assert.rejects(() => saveRecurring(ctx, { name: "X", category: "rent", amount: 1, frequency: "monthly", dueDay: 40, startOn: ym }), /1 a 31/);
  await assert.rejects(() => saveRecurring(ctx, { name: "X", category: "rent", amount: 1, frequency: "monthly", dueDay: 1, startOn: ym, endOn: addMonths(ym, -2) }), /anterior al inicio/);
  await assert.rejects(() => createIncome(ctx, { receivedOn: `${ym}-01`, description: "", amount: 1, status: "received" }), /Describe/);
  console.log("5. validaciones (valor negativo, categoría automática, fecha, frecuencia, día, rango, concepto): ok");

  // Aislamiento entre empresas
  const fb = await loadFinance(ctxB, ym);
  assert.equal(fb.income.total, 0);
  assert.equal(fb.cost.total, 0);
  assert.equal(fb.recurring.length, 0);
  assert.equal(fb.profitability.length, 0);
  await assert.rejects(() => createExpense(ctxB, { spentOn: `${ym}-02`, category: "travel", amount: 5, customerId: cust.id }), /Cliente no encontrado/);
  await assert.rejects(() => createExpense(ctxB, { spentOn: `${ym}-02`, category: "rent", amount: 5, recurringId: rent.id }), /Gasto fijo no encontrado/);
  await assert.rejects(() => payRecurring(ctxB, rent.id, ym));
  assert.equal(await ctxB.db.finExpense.deleteMany({}).then((r) => r.count), 0);
  assert.equal(await db.finExpense.count(), 2); // viaje + cuota de arriendo pagada
  console.log("6. aislamiento: otra empresa no ve ni usa clientes, gastos fijos ni gastos ajenos: ok");

  await cleanup(["test-fin", "test-fin-b"]);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
