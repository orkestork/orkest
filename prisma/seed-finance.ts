import type { ExecContext } from "@/lib/core/context";
import { addMonths, localDay, createExpense, createIncome, saveBudget, saveRecurring } from "@/lib/apps/finance";

/** Datos de ejemplo de Finanzas: gastos fijos, algunos gastos sueltos, un ingreso proyectado y presupuesto del mes. */
export async function seedFinance(ctx: ExecContext, opts: { customerId?: string }) {
  const ym = localDay().slice(0, 7);
  const start = addMonths(ym, -6);
  const fixed = [
    { name: "Arriendo planta y bodega", category: "rent", amount: 18_500_000, dueDay: 5, vendor: "Inmobiliaria Andina" },
    { name: "Energía planta", category: "utilities", amount: 7_200_000, dueDay: 15, vendor: "Enel" },
    { name: "Internet y telefonía", category: "internet", amount: 890_000, dueDay: 10, vendor: "Claro Empresas" },
    { name: "Licencias de software", category: "software", amount: 2_400_000, dueDay: 1, vendor: "Varios" },
    { name: "Póliza todo riesgo", category: "insurance", amount: 21_600_000, dueDay: 20, vendor: "Seguros Bolívar", frequency: "annual" },
    { name: "Revisoría fiscal", category: "professional", amount: 3_500_000, dueDay: 28, vendor: "Contadores Asociados" },
  ];
  for (const f of fixed) await saveRecurring(ctx, { frequency: "monthly", startOn: start, ...f });

  // Gastos sueltos de los últimos meses (para que la tendencia tenga historia)
  for (let i = 5; i >= 0; i--) {
    const m = addMonths(ym, -i);
    await createExpense(ctx, { spentOn: `${m}-08`, category: "supplies", amount: 450_000 + i * 35_000, description: "Aseo y cafetería" });
    await createExpense(ctx, { spentOn: `${m}-18`, category: "maintenance", amount: 1_200_000 + (i % 3) * 400_000, description: "Repuestos y mantenimiento menor" });
    if (i > 0) await createExpense(ctx, { spentOn: `${m}-05`, category: "rent", amount: 18_500_000, description: "Arriendo planta y bodega", vendor: "Inmobiliaria Andina" });
  }
  await createExpense(ctx, { spentOn: `${ym}-03`, category: "travel", amount: 1_850_000, description: "Visita técnica a cliente", customerId: opts.customerId });
  await createIncome(ctx, { receivedOn: `${addMonths(ym, 1)}-10`, description: "Devolución de saldo a favor (DIAN)", amount: 6_300_000, status: "scheduled" });

  await saveBudget(ctx, ym, {
    payroll: 95_000_000, purchases: 120_000_000, fleet: 6_000_000, rent: 18_500_000, utilities: 7_500_000, internet: 900_000,
    software: 2_500_000, maintenance: 3_000_000, supplies: 600_000, travel: 2_000_000, professional: 3_500_000,
  });
}
