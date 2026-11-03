import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/core/prisma";
import { clearLoginFailures, loginBlocked, recordLoginFailure } from "@/lib/core/login-throttle";

/**
 * API REST v1, tareas programadas, cabeceras de seguridad y freno de intentos de login.
 * Requiere el servidor corriendo (BASE_URL, por defecto http://localhost:3002).
 * Crea llaves temporales en dos organizaciones y las borra al final.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3002";
let ok = 0;
const check = (name: string, fn: () => void) => { fn(); ok++; console.log(`✓ ${name}`); };

async function tempKey(slug: string, scopes: string[]) {
  const org = await prisma.organization.findFirstOrThrow({ where: { slug } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, status: "ACTIVE" } });
  const prefix = randomBytes(4).toString("hex"), secret = randomBytes(24).toString("hex");
  const key = await prisma.apiKey.create({ data: { organizationId: org.id, name: "test-api (temporal)", prefix, keyHash: createHash("sha256").update(secret).digest("hex"), scopes, createdById: m.userId } });
  return { org, key, token: `ok_${prefix}_${secret}` };
}
const get = (path: string, token?: string) => fetch(`${BASE}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, redirect: "manual" });

async function main() {
  // ── 1. Freno de login (lógica pura) ──
  const keys = ["e:x@test.co", "ip:1.2.3.4"];
  clearLoginFailures(keys);
  for (let i = 0; i < 7; i++) recordLoginFailure(keys);
  check("7 fallos todavía permiten intentar", () => assert.equal(loginBlocked(keys), null));
  recordLoginFailure(keys);
  check("al 8.º fallo se bloquea unos minutos", () => assert.ok((loginBlocked(keys) ?? 0) > 0));
  check("pasados 15 minutos se libera", () => assert.equal(loginBlocked(keys, Date.now() + 16 * 60_000), null));
  clearLoginFailures(keys);

  // ── 2. Cabeceras de seguridad ──
  const login = await get("/login");
  check("/login responde 200", () => assert.equal(login.status, 200));
  check("cabeceras: X-Frame-Options DENY, nosniff, HSTS, sin X-Powered-By", () => {
    assert.equal(login.headers.get("x-frame-options"), "DENY");
    assert.equal(login.headers.get("x-content-type-options"), "nosniff");
    assert.ok(login.headers.get("strict-transport-security"));
    assert.equal(login.headers.get("x-powered-by"), null);
  });

  // ── 3. Cron cerrado sin secreto ──
  const cron = await get("/api/cron/events");
  check("cron sin CRON_SECRET → 401", () => assert.equal(cron.status, 401));
  const cronBad = await get("/api/cron/events", "cualquier-cosa");
  check("cron con secreto falso → 401", () => assert.equal(cronBad.status, 401));

  // ── 4. API v1 ──
  const anon = await get("/api/v1/customers");
  check("API sin llave → 401", () => assert.equal(anon.status, 401));
  const fake = await get("/api/v1/customers", "ok_deadbeef_" + "0".repeat(48));
  check("API con llave inventada → 401", () => assert.equal(fake.status, 401));

  const A = await tempKey("presservac", ["*"]);
  const B = await tempKey("andina", ["crm.customers.read"]);
  try {
    const idx = await (await get("/api/v1", A.token)).json();
    check("GET /api/v1 identifica la organización y lista recursos", () => { assert.equal(idx.organizationId, A.org.id); assert.ok(idx.resources.length >= 5); });

    const list = await get("/api/v1/customers?limit=2", A.token);
    const lj = await list.json();
    check("lista paginada de clientes (límite respetado, total, hasMore)", () => { assert.equal(list.status, 200); assert.ok(lj.data.length <= 2); assert.ok(typeof lj.total === "number"); });
    check("no se exponen columnas internas", () => assert.ok(lj.data.every((r: Record<string, unknown>) => !("organizationId" in r))));

    // Campos personalizados obligatorios de la empresa (la API los valida igual que la pantalla)
    const defs = await prisma.customFieldDefinition.findMany({ where: { organizationId: A.org.id, entityType: "customer", active: true, required: true } });
    const sample = (d: (typeof defs)[number]) => {
      const opts = (d.options as { value?: string }[] | string[]) ?? [];
      const first = opts[0] && typeof opts[0] === "object" ? (opts[0] as { value?: string }).value : (opts[0] as string | undefined);
      return d.type === "select" ? first : d.type === "multiselect" ? [first] : d.type === "number" || d.type === "currency" ? 1 : d.type === "boolean" ? true : d.type.startsWith("date") ? "2026-11-03" : "prueba";
    };
    const customFields = Object.fromEntries(defs.map((d) => [d.key, sample(d)]));
    const created = await fetch(`${BASE}/api/v1/customers`, { method: "POST", headers: { authorization: `Bearer ${A.token}`, "content-type": "application/json" }, body: JSON.stringify({ name: `Cliente API ${Date.now()}`, email: "api@test.co", customFields }) });
    const cj = await created.json();
    check("POST /api/v1/customers crea (201)", () => { assert.equal(created.status, 201, JSON.stringify(cj)); assert.ok(cj.data.id); });
    const bad = await fetch(`${BASE}/api/v1/customers`, { method: "POST", headers: { authorization: `Bearer ${A.token}`, "content-type": "application/json" }, body: JSON.stringify({ email: "sin-nombre" }) });
    check("POST inválido → 422 con detalle", () => assert.equal(bad.status, 422));

    const one = await get(`/api/v1/customers/${cj.data.id}`, A.token);
    check("GET por id devuelve el registro", () => assert.equal(one.status, 200));

    const leak = await get(`/api/v1/customers/${cj.data.id}`, B.token);
    check("otra empresa no puede leer el cliente (404)", () => assert.equal(leak.status, 404));
    const bList = await (await get(`/api/v1/customers?q=Cliente%20API`, B.token)).json();
    check("otra empresa no lo ve en su lista", () => assert.ok(!bList.data.some((r: { id: string }) => r.id === cj.data.id)));

    const noScope = await get("/api/v1/products", B.token);
    check("llave sin permiso de productos → 403 (o 404 si la app no está activa)", () => assert.ok([403, 404].includes(noScope.status)));
    const noWrite = await fetch(`${BASE}/api/v1/customers`, { method: "POST", headers: { authorization: `Bearer ${B.token}`, "content-type": "application/json" }, body: "{}" });
    check("llave de solo lectura no crea → 403", () => assert.equal(noWrite.status, 403));
    const unknown = await get("/api/v1/nada", A.token);
    check("recurso desconocido → 404", () => assert.equal(unknown.status, 404));

    await prisma.customer.delete({ where: { id: cj.data.id } });
  } finally {
    await prisma.apiKey.deleteMany({ where: { id: { in: [A.key.id, B.key.id] } } });
  }
  console.log(`Resultado: ${ok} ✓  ·  0 ✗`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("✗", e); process.exit(1); });
