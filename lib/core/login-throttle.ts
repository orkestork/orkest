/**
 * Freno de fuerza bruta para el inicio de sesión: tras 8 intentos fallidos para el mismo correo
 * o la misma IP en 15 minutos, se bloquea 15 minutos. Vive en memoria de cada instancia del servidor;
 * en despliegues con muchas instancias conviene moverlo a un almacén compartido (Redis / Upstash).
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const fails = new Map<string, number[]>();

const recent = (key: string, now: number) => (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

export function loginBlocked(keys: string[], now = Date.now()) {
  const worst = Math.max(0, ...keys.map((k) => recent(k, now).length));
  if (worst < MAX_FAILS) return null;
  const oldest = Math.min(...keys.flatMap((k) => recent(k, now)));
  return Math.ceil((WINDOW_MS - (now - oldest)) / 60000);
}

export function recordLoginFailure(keys: string[], now = Date.now()) {
  for (const k of keys) fails.set(k, [...recent(k, now), now]);
  if (fails.size > 10_000) for (const [k] of fails) { if (!recent(k, now).length) fails.delete(k); }
}

export function clearLoginFailures(keys: string[]) {
  for (const k of keys) fails.delete(k);
}
