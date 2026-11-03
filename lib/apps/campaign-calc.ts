// Cálculos puros de campañas (sin imports de servidor): seguros para componentes cliente.
// La inversión publicitaria se captura en USD y la venta en la moneda de la organización;
// la TRM de cada fecha convierte la inversión antes de calcular ROAS / KPI.

export function calcROAS(sales: number, investment: number): number {
  if (investment <= 0) return 0;
  return sales / investment;
}

function safeDiv(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : 0;
}

export function calcKpiMensajes(transacciones: number, mensajes: number): number {
  return safeDiv(transacciones, mensajes);
}

/** Convierte el presupuesto en USD a moneda local con la TRM de la fecha. */
export function calcPresupuestoCOP(presupuestoPublicidad: number, trm: number): number {
  return Math.max(0, presupuestoPublicidad || 0) * Math.max(0, trm || 0);
}

/** KPI = TOTAL VENDIDO / TOTAL INVERTIDO (ambos en la misma moneda). */
export function calcKpiConversion(ventaDelDia: number, presupuestoCOP: number): number {
  return safeDiv(ventaDelDia, presupuestoCOP);
}

export function calcMetaDiaria(presupuestoCOP: number, multiple = 10): number {
  return Math.max(0, presupuestoCOP) * multiple;
}

// ─── Matriz diaria de campaña ───

export type CampaignDailyInput = {
  id: string;
  fecha: string; // "YYYY-MM-DD"
  mensajes: number;
  transacciones: number;
  presupuestoPublicidad: number; // USD
  ventaDelDia: number;
  trm: number; // moneda local por USD vigente la fecha
};

export type CampaignDailyRow = CampaignDailyInput & {
  kpiMensajes: number;
  presupuestoCOP: number;
  kpiConversion: number;
  metaDiaria: number;
  ventaAcumulada: number;
};

export type CampaignDailyTotals = {
  totalMensajes: number;
  totalTransacciones: number;
  totalInversionUSD: number;
  totalInversion: number;
  totalVentas: number;
  conversionGeneral: number;
  kpiGeneral: number;
};

/** Ordena por fecha y calcula KPIs por fila. "Venta acumulada" replica la hoja original: la venta del día (el total va en el pie). */
export function buildCampaignDailyRows(entries: CampaignDailyInput[], multiple = 10): CampaignDailyRow[] {
  const sorted = [...entries].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return sorted.map((e) => {
    const presupuestoCOP = calcPresupuestoCOP(e.presupuestoPublicidad, e.trm);
    return {
      ...e,
      kpiMensajes: calcKpiMensajes(e.transacciones, e.mensajes),
      presupuestoCOP,
      kpiConversion: calcKpiConversion(e.ventaDelDia, presupuestoCOP),
      metaDiaria: calcMetaDiaria(presupuestoCOP, multiple),
      ventaAcumulada: e.ventaDelDia,
    };
  });
}

export function calcCampaignDailyTotals(entries: CampaignDailyInput[]): CampaignDailyTotals {
  const totalMensajes = entries.reduce((s, e) => s + (e.mensajes || 0), 0);
  const totalTransacciones = entries.reduce((s, e) => s + (e.transacciones || 0), 0);
  const totalInversionUSD = entries.reduce((s, e) => s + (e.presupuestoPublicidad || 0), 0);
  const totalInversion = entries.reduce((s, e) => s + calcPresupuestoCOP(e.presupuestoPublicidad, e.trm), 0);
  const totalVentas = entries.reduce((s, e) => s + (e.ventaDelDia || 0), 0);
  return {
    totalMensajes, totalTransacciones, totalInversionUSD, totalInversion, totalVentas,
    conversionGeneral: safeDiv(totalTransacciones, totalMensajes),
    kpiGeneral: safeDiv(totalVentas, totalInversion),
  };
}

// ─── Semáforos ───

export type Tone = "emerald" | "amber" | "rose" | "slate" | "lime";

/** KPI Mensajes (transacciones / mensajes): ≥ 20 % verde, ≥ 10 % ámbar, si no rojo. */
export function kpiMensajesTone(ratio: number): Tone {
  if (ratio >= 0.2) return "emerald";
  if (ratio >= 0.1) return "amber";
  return "rose";
}

/** KPI Conversión (venta / inversión): ≥ 8x verde, ≥ 5x ámbar, si no rojo. */
export function kpiConversionTone(x: number): Tone {
  if (x >= 8) return "emerald";
  if (x >= 5) return "amber";
  return "rose";
}

/** Estado visual de campaña: ROAS frente a su meta (×), o pausada. */
export type DisplayStatus = "meta" | "rentable" | "revision" | "riesgo" | "pausada";

export function displayStatus(status: string, roas: number, targetMultiple: number): DisplayStatus {
  if (status && status !== "ACTIVE") return "pausada";
  const target = targetMultiple || 10;
  if (roas <= 0) return "revision";
  if (roas >= target) return "meta";
  if (roas >= target * 0.7) return "rentable";
  if (roas >= target * 0.4) return "revision";
  return "riesgo";
}

export const DISPLAY_STATUS: Record<DisplayStatus, { label: string; tone: Tone }> = {
  meta: { label: "Meta cumplida", tone: "emerald" },
  rentable: { label: "Aceptable", tone: "lime" },
  revision: { label: "En revisión", tone: "amber" },
  riesgo: { label: "En riesgo", tone: "rose" },
  pausada: { label: "Pausada", tone: "slate" },
};

/** Colores de semáforo (texto, fondo, barra) en la paleta de ORKEST. */
export const TONE_COLOR: Record<Tone, { fg: string; bg: string; bar: string }> = {
  emerald: { fg: "#047857", bg: "#ecfdf5", bar: "#10b981" },
  lime: { fg: "#4d7c0f", bg: "#f7fee7", bar: "#84cc16" },
  amber: { fg: "#b45309", bg: "#fffbeb", bar: "#f59e0b" },
  rose: { fg: "#be123c", bg: "#fff1f2", bar: "#e31572" },
  slate: { fg: "#5c544b", bg: "#f2eee8", bar: "#a39a8e" },
};

export const PLATFORMS = ["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "Otro"];
