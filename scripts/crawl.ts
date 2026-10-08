import "dotenv/config";
import { prisma } from "@/lib/core/prisma";
import { signSession } from "@/lib/core/auth";

/**
 * Rastreador de calidad: para cada usuario recorre todos los enlaces internos visibles
 * y reporta errores 500, 404, enlaces visibles que terminan en "sin permiso" y textos técnicos filtrados.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const USERS = ["admin@presservac.co", "gerencia@presservac.co", "comercial@presservac.co", "inventario@presservac.co", "calidad@presservac.co", "finanzas@presservac.co", "produccion@presservac.co", "admin@andina.co", "plataforma@or-k.co"];
const LEAKS = [/PrismaClient/, /Invalid `/, /Unhandled Runtime Error/, /Application error/, /NEXT_REDIRECT/, /\[object Object\]/, />undefined</, />NaN</, /Internal Server Error/];
const MAX = Number(process.env.MAX ?? 260);

const norm = (href: string) => {
  const u = new URL(href, BASE);
  // Reduce variantes de query (paginación/orden) para no explotar el recorrido
  for (const k of ["page", "dir", "offset"]) u.searchParams.delete(k);
  return u.pathname + (u.search ? u.search : "");
};

async function crawl(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const m = await prisma.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  const token = await signSession({ sub: user.id, org: m?.organizationId });
  const seen = new Set<string>(), queue = ["/"];
  const issues: string[] = [];
  const perPattern = new Map<string, number>();
  while (queue.length && seen.size < MAX) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    // Limita páginas por patrón (/x/<id>) para cubrir variedad sin repetir 500 fichas iguales
    const pattern = path.replace(/[a-z0-9]{20,}/g, ":id").replace(/\?.*/, "?");
    if ((perPattern.get(pattern) ?? 0) >= 3) continue;
    perPattern.set(pattern, (perPattern.get(pattern) ?? 0) + 1);
    seen.add(path);
    let res: Response;
    try { res = await fetch(BASE + path, { headers: { cookie: `orkest_session=${token}` }, redirect: "manual" }); }
    catch (e) { issues.push(`ERR  ${path} ${(e as Error).message}`); continue; }
    const loc = res.headers.get("location") ?? "";
    if (res.status >= 300 && res.status < 400) {
      if (loc.includes("/forbidden")) issues.push(`403  ${path} → enlace visible pero sin permiso (${decodeURIComponent(loc.split("p=")[1] ?? "")})`);
      else if (loc.includes("/login")) issues.push(`AUTH ${path} → redirige a login`);
      else if (!seen.has(norm(loc))) queue.push(norm(loc));
      continue;
    }
    if (res.status === 404) { issues.push(`404  ${path}`); continue; }
    if (res.status >= 500) { issues.push(`500  ${path}`); continue; }
    const html = await res.text();
    for (const re of LEAKS) if (re.test(html.replace(/<script[\s\S]*?<\/script>/g, ""))) issues.push(`LEAK ${path} contiene ${re}`);
    for (const mm of html.matchAll(/href="(\/[^"#]*)"/g)) {
      const h = mm[1].replace(/&amp;/g, "&");
      if (h.startsWith("/_next") || h.startsWith("/brand") || h.startsWith("/api") || h.includes("/print") || h === "/login") continue;
      const n = norm(h);
      if (!seen.has(n)) queue.push(n);
    }
  }
  return { email, pages: seen.size, issues: [...new Set(issues)] };
}

async function main() {
  let total = 0;
  for (const u of USERS) {
    const r = await crawl(u);
    total += r.issues.length;
    console.log(`\n■ ${r.email} — ${r.pages} páginas, ${r.issues.length} hallazgos`);
    for (const i of r.issues) console.log("   " + i);
  }
  console.log(`\nTOTAL hallazgos: ${total}`);
}
main().finally(() => prisma.$disconnect());
