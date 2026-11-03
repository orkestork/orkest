import type { ExecContext } from "@/lib/core/context";
import { ValidationError } from "./crm";
import { logisticsKpis } from "./logistics";
import { maintenanceKpis } from "./maintenance";
import { assemblyKpis, injectionKpis, moldKpis } from "./plant";
import { civil, dayEnd, dayStart } from "./ops-shared";

/**
 * Informes de operaciones: el responsable de cada área cierra un periodo guardando
 * una foto de sus indicadores (no cambian aunque luego se corrijan registros) y notas.
 */
export const REPORT_MODULES = {
  logistics: { label: "Logística", base: "/logistics" },
  maintenance: { label: "Mantenimiento", base: "/maintenance" },
  manufacturing: { label: "Producción", base: "/manufacturing" },
} as const;
export type ReportModule = keyof typeof REPORT_MODULES;

export const KPI_LABELS: Record<string, string> = {
  rutasTotal: "Rutas", rutasFinalizadas: "Rutas finalizadas", paradasEnRuta: "Paradas en ruta", paradasEntregadas: "Paradas entregadas", costoTotal: "Costo de transporte", novedadesAbiertas: "Novedades abiertas",
  ordenesAbiertas: "Órdenes abiertas", preventivas: "Preventivas", correctivas: "Correctivas", completadas: "Completadas", tiempoMuertoMin: "Tiempo muerto (min)", equiposFueraServicio: "Equipos fuera de servicio", itemsBajoMinimo: "Repuestos bajo mínimo",
  corridasInyeccion: "Corridas de inyección", piezasProducidas: "Piezas producidas", piezasBuenas: "Piezas buenas", calidadInyeccionPct: "Calidad inyección %", paradasMin: "Paradas (min)",
  cambiosCompletados: "Cambios de molde", tiempoPromedioCambioMin: "Promedio por cambio (min)", tiempoTotalCambioMin: "Tiempo total de cambio (min)", cambiosAbiertos: "Montajes abiertos", moldesEnUso: "Moldes en uso", moldesTotal: "Moldes",
  corridas: "Corridas de ensamble", unidadesEnsambladas: "Unidades ensambladas", unidadesBuenas: "Unidades buenas", unidadesDefectuosas: "Defectuosas", calidadPct: "Calidad ensamble %", unidadesPorHoraHombre: "Unidades / hora-hombre",
};

export async function buildKpis(ctx: ExecContext, module: ReportModule, from: string, to: string): Promise<Record<string, number>> {
  const range = { gte: dayStart(from), lte: dayEnd(to) };
  if (module === "logistics") return logisticsKpis(ctx, range);
  if (module === "maintenance") return maintenanceKpis(ctx, range);
  return { ...(await injectionKpis(ctx, range)), ...(await moldKpis(ctx, range)), ...(await assemblyKpis(ctx, range)) };
}

export async function createReport(ctx: ExecContext, module: ReportModule, d: { from: string; to: string; notes?: string }) {
  if (!(module in REPORT_MODULES)) throw new ValidationError({ module: "Área inválida" });
  if (d.from > d.to) throw new ValidationError({ from: "El inicio del periodo no puede ser posterior al fin" });
  const kpis = await buildKpis(ctx, module, d.from, d.to);
  return ctx.db.operationsReport.create({ data: { organizationId: ctx.orgId, module, periodStart: civil(d.from), periodEnd: civil(d.to), authorId: ctx.actorId ?? "", kpis, notes: d.notes?.trim() || null } });
}
