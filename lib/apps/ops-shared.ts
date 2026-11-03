/**
 * Utilidades compartidas por Operaciones (planta, mantenimiento, logística).
 * Fechas civiles "YYYY-MM-DD" se guardan a mediodía UTC: ninguna zona horaria las corre de día.
 */
import { ValidationError } from "./crm";

export const civil = (d: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ValidationError({ date: "Fecha inválida" });
  return new Date(`${d}T12:00:00.000Z`);
};
export const dayStart = (d: string) => new Date(`${d}T00:00:00.000Z`);
export const dayEnd = (d: string) => new Date(`${d}T23:59:59.999Z`);
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
/** Hora de reloj "HH:mm" de un día civil, guardada como UTC (la resta da minutos reales). */
export const clock = (d: string, hhmm: string) => {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) throw new ValidationError({ time: "Hora inválida" });
  return new Date(`${d}T${hhmm}:00.000Z`);
};
export const hhmm = (d: Date) => d.toISOString().slice(11, 16);

/** Hoy en Bogotá como "YYYY-MM-DD". */
export const todayKey = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
export const addDaysKey = (d: string, n: number) => dayKey(new Date(civil(d).getTime() + n * 86400_000));

/** Rango por defecto de listas: últimos 30 días. */
export function rangeFrom(sp: Record<string, string | string[] | undefined>, days = 30) {
  const to = typeof sp.to === "string" && sp.to ? sp.to : todayKey();
  const from = typeof sp.from === "string" && sp.from ? sp.from : addDaysKey(to, -days);
  return { from, to, where: { gte: dayStart(from), lte: dayEnd(to) } };
}

export function nonNegative(v: unknown, field: string, opts: { integer?: boolean; required?: boolean } = {}) {
  const raw = String(v ?? "").trim();
  if (!raw) {
    if (opts.required) throw new ValidationError({ [field]: `Falta ${field}` });
    return null;
  }
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || (opts.integer && !Number.isInteger(n))) throw new ValidationError({ [field]: `Valor inválido en ${field}` });
  return n;
}

export const LABELS = {
  maintenanceStatus: { PENDING: ["Pendiente", "slate"], IN_PROGRESS: ["En ejecución", "amber"], DONE: ["Completada", "emerald"], CANCELLED: ["Cancelada", "rose"] },
  priority: { LOW: ["Baja", "slate"], MEDIUM: ["Media", "blue"], HIGH: ["Alta", "amber"], URGENT: ["Urgente", "rose"] },
  maintenanceType: { PREVENTIVE: ["Preventivo", "blue"], CORRECTIVE: ["Correctivo (falla)", "amber"] },
  equipmentStatus: { OPERATIVE: ["Operativo", "emerald"], MAINTENANCE: ["En mantenimiento", "amber"], DOWN: ["Fuera de servicio", "rose"] },
  equipmentType: { MACHINE: ["Máquina", "violet"], MOLD: ["Molde", "blue"], TOOL: ["Herramienta", "slate"], INFRA: ["Infraestructura", "slate"] },
  quoteStatus: { REQUESTED: ["Solicitada", "slate"], APPROVED: ["Aprobada", "emerald"], REJECTED: ["Rechazada", "rose"], PURCHASED: ["Comprada", "violet"] },
  moldStatus: { AVAILABLE: ["Disponible", "emerald"], IN_USE: ["En uso", "violet"], MAINTENANCE: ["En mantenimiento", "amber"] },
  routeStatus: { PLANNED: ["Planeada", "slate"], IN_PROGRESS: ["En ruta", "amber"], DONE: ["Finalizada", "emerald"] },
  stopStatus: { PENDING: ["Pendiente", "slate"], DELIVERED: ["Entregado", "emerald"], FAILED: ["No entregado", "rose"] },
  vehicleType: { CAMIONETA: ["Camioneta", "slate"], MOTO: ["Moto", "slate"], FURGON: ["Furgón", "slate"], CAMION: ["Camión", "slate"] },
  costCategory: { COMBUSTIBLE: ["Combustible", "amber"], MANTENIMIENTO: ["Mantenimiento", "violet"], PEAJES: ["Peajes", "blue"], OTRO: ["Otro", "slate"] },
  incidentStatus: { OPEN: ["Abierta", "rose"], RESOLVED: ["Resuelta", "emerald"] },
} satisfies Record<string, Record<string, [string, string]>>;

export function oneOf<T extends string>(v: unknown, allowed: Record<T, unknown>, field: string): T {
  const s = String(v ?? "");
  if (!(s in allowed)) throw new ValidationError({ [field]: `Valor no permitido en ${field}` });
  return s as T;
}
