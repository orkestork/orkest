// Calendario de actividad comercial — lógica pura (sin DB), segura para cliente y servidor.
// Fechas como "YYYY-MM-DD" en el calendario local de la organización (Organization.timezone).
// En la base se guardan como DATE; "hoy" y la hora límite se calculan en la zona de la organización.

export const DEFAULT_DEADLINE_MINUTES = 20 * 60; // 8:00 pm
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6]; // lun-sáb (0 = domingo)

export type DayStatus = "GREEN" | "YELLOW" | "RED" | "GRAY" | "PENDING" | "FUTURE";
export type GrayReason = "holiday" | "nonworking" | "inactive" | "untracked";

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, timeZone: string) {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    fmtCache.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { key: `${p.year}-${p.month}-${p.day}`, hh: p.hour, mm: p.minute };
}

/** Fecha y minutos del día "ahora" en la zona de la organización. */
export function localNow(timeZone: string, now = Date.now()) {
  const p = parts(now, timeZone);
  return { key: p.key, minutes: Number(p.hh) * 60 + Number(p.mm) };
}

/** Instante → "YYYY-MM-DD HH:MM" local (comparable como texto). */
export function localStamp(ms: number, timeZone: string): string {
  const p = parts(ms, timeZone);
  return `${p.key} ${p.hh}:${p.mm}`;
}

/** Instante → "YYYY-MM-DD" local. */
export function localKey(ms: number, timeZone: string): string {
  return parts(ms, timeZone).key;
}

/** Columna DATE (llega como medianoche UTC) → "YYYY-MM-DD". */
export function dateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → valor para una columna DATE. */
export function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

export const isDateKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(keyToDate(v).getTime());

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

export function monthKeys(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export type DayInput = {
  date: string;
  todayKey: string;
  nowMinutes: number;
  deadlineMinutes: number;
  trackingStart: string;
  workDays: number[];
  isHoliday: boolean;
  active: boolean;
  hasClose: boolean;
  salesTotal: number;
  rowsCount: number;
  /** Primer reporte con venta > 0 o cierre, como "YYYY-MM-DD HH:MM" local. */
  firstReportAt: string | null;
};

export type DayResult = { status: DayStatus; late: boolean; reason?: GrayReason };

export function computeDayStatus(i: DayInput): DayResult {
  const reported = i.hasClose || i.salesTotal > 0;
  const workday = i.workDays.includes(weekday(i.date));

  if (!i.active) return { status: "GRAY", late: false, reason: "inactive" };
  const untracked = i.date < i.trackingStart;
  // Antes del seguimiento no hay log de eventos: lo vendido se ve en verde, pero sin exigir ni medir retraso.
  if (reported && untracked) return { status: "GREEN", late: false, reason: "untracked" };
  if (untracked) return { status: "GRAY", late: false, reason: "untracked" };
  if (reported) {
    const deadline = `${i.date} ${hhmm(i.deadlineMinutes)}`;
    return { status: "GREEN", late: i.firstReportAt !== null && i.firstReportAt > deadline };
  }
  if (i.isHoliday) return { status: "GRAY", late: false, reason: "holiday" };
  if (!workday) return { status: "GRAY", late: false, reason: "nonworking" };
  if (i.date > i.todayKey) return { status: "FUTURE", late: false };
  if (i.date === i.todayKey && i.nowMinutes < i.deadlineMinutes) {
    return { status: i.rowsCount > 0 ? "YELLOW" : "PENDING", late: false };
  }
  return { status: "RED", late: false };
}

// ─── Tipos que viajan del servidor a la UI ───

export type CellRow = {
  campaignId: string;
  name: string;
  platform: string;
  venta: number;
  presupuestoUsd: number;
  mensajes: number;
  transacciones: number;
};

export type CellNewCampaign = {
  id: string;
  name: string;
  platform: string;
  status: string;
  createdAt: string;
  initialUsd: number | null;
};

export type CellEvent = { kind: string; value: number; at: string; actor: string };

export type Cell = {
  date: string;
  status: DayStatus;
  late: boolean;
  reason?: GrayReason;
  total: number;
  campaignsWithSales: number;
  rows: CellRow[];
  newCampaigns: CellNewCampaign[];
  closed: boolean;
  noSales: boolean;
  lastUpdate: string | null;
  events: CellEvent[];
};

export type SellerCalendar = {
  id: string;
  name: string;
  workDays: number[];
  cells: Record<string, Cell>;
};

/** Cumplimiento = verdes / (verdes + rojos) sobre días laborables exigibles. */
export function compliance(cells: Cell[], workDaysOf: (date: string) => boolean) {
  let done = 0;
  let expected = 0;
  for (const c of cells) {
    if (c.reason === "untracked" || !workDaysOf(c.date)) continue;
    if (c.status === "GREEN") { done++; expected++; }
    else if (c.status === "RED") expected++;
  }
  return { done, expected, pct: expected ? Math.round((done / expected) * 100) : null };
}
