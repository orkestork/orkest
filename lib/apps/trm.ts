// Tasa de cambio USD → moneda de la organización por fecha (la pauta se paga en USD).
// COP: TRM histórica oficial (datos.gov.co). Otras monedas: tasa vigente (open.er-api.com).
// Caché en memoria por moneda y fecha; si no hay red se usa la última conocida o un respaldo.

const TRM_DATASET = "https://www.datos.gov.co/resource/32sa-8pi3.json";
const LATEST_API = "https://open.er-api.com/v6/latest/USD";
const FALLBACK: Record<string, number> = { COP: 4000, USD: 1 };

const cache = new Map<string, number>();
let latest: { at: number; rates: Record<string, number> } | null = null;

async function getJson(url: string, revalidate: number): Promise<unknown> {
  try {
    const res = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(6000) } as RequestInit);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function latestRate(currency: string): Promise<number | null> {
  if (!latest || Date.now() - latest.at > 3600_000) {
    const data = (await getJson(LATEST_API, 3600)) as { rates?: Record<string, number> } | null;
    if (data?.rates) latest = { at: Date.now(), rates: data.rates };
  }
  const r = latest?.rates[currency];
  return typeof r === "number" && r > 0 ? r : null;
}

/** TRM COP de un rango, en una sola consulta: cada fecha toma la tasa vigente ese día. */
async function historicalCop(keys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (keys.length === 0) return out;
  const sorted = [...keys].sort();
  const where = `vigenciahasta>='${sorted[0]}T00:00:00.000' AND vigenciadesde<='${sorted[sorted.length - 1]}T23:59:59.999'`;
  const url = `${TRM_DATASET}?$where=${encodeURIComponent(where)}&$limit=5000&$order=${encodeURIComponent("vigenciadesde ASC")}`;
  const data = (await getJson(url, 86400)) as { valor: string; vigenciadesde: string; vigenciahasta: string }[] | null;
  if (!Array.isArray(data)) return out;
  const spans = data
    .map((d) => ({ from: d.vigenciadesde.slice(0, 10), to: d.vigenciahasta.slice(0, 10), rate: parseFloat(d.valor) }))
    .filter((s) => Number.isFinite(s.rate) && s.rate > 0);
  for (const k of keys) {
    const s = spans.find((x) => x.from <= k && k <= x.to);
    if (s) out.set(k, s.rate);
  }
  return out;
}

/** Tasas USD → `currency` para varias fechas "YYYY-MM-DD". */
export async function getUsdRates(currency: string, keys: string[]): Promise<Record<string, number>> {
  const cur = (currency || "COP").toUpperCase();
  const result: Record<string, number> = {};
  if (cur === "USD") {
    for (const k of keys) result[k] = 1;
    return result;
  }
  const missing = [...new Set(keys)].filter((k) => !cache.has(`${cur}|${k}`));
  if (missing.length) {
    const found = cur === "COP" ? await historicalCop(missing) : new Map<string, number>();
    const fallback = (await latestRate(cur)) ?? FALLBACK[cur] ?? 1;
    const today = new Date().toISOString().slice(0, 10);
    for (const k of missing) {
      const rate = found.get(k);
      // Solo se fija en caché lo histórico; lo de hoy/futuro (sin dato aún) se vuelve a consultar luego.
      if (rate) cache.set(`${cur}|${k}`, rate);
      else if (k < today && cur === "COP" && found.size > 0) cache.set(`${cur}|${k}`, fallback);
      result[k] = rate ?? fallback;
    }
  }
  for (const k of keys) result[k] ??= cache.get(`${cur}|${k}`)!;
  return result;
}

export async function getUsdRate(currency: string, key: string): Promise<number> {
  return (await getUsdRates(currency, [key]))[key];
}
