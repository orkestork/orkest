/**
 * Vendedores de Odoo → usuarios de la organización en ORKEST, y asignación de cada pedido a su vendedor.
 * - Odoo solo se LEE (ver ./client.ts).
 * - Los usuarios nuevos quedan con rol Comercial y DESACTIVADOS: no pueden entrar hasta que un administrador
 *   los active en Ajustes → Usuarios (y les genere una contraseña).
 * - Idempotente: si el usuario o la membresía ya existen, se reutilizan.
 *
 * Uso suelto: npm run import:odoo:salespeople[:supabase]
 */
import { randomBytes } from "node:crypto";
import { odoo, readAll } from "./client";

// Registros de Odoo: forma dinámica por modelo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

export async function syncSalespeople(orgSlug: string, since: string) {
  const { prisma } = await import("@/lib/core/prisma");
  const { hashPassword } = await import("@/lib/core/auth");
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: orgSlug } });
  const role = await prisma.role.findFirstOrThrow({ where: { organizationId: org.id, key: "SALES" } });

  const groups = await odoo<R[]>("sale.order", "read_group", [[["date_order", ">=", since], ["user_id", "!=", false]], ["user_id"], ["user_id"]], { lazy: false });
  const odooUsers = await readAll<R>("res.users", [["id", "in", groups.map((g) => g.user_id[0])]], ["name", "login", "email"]);
  const userMap = new Map<number, string>();
  for (const u of odooUsers) {
    const login = String(u.login ?? "").trim().toLowerCase();
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login) ? login : `odoo-${u.id}@${orgSlug}.local`;
    const user = (await prisma.user.findUnique({ where: { email } }))
      ?? (await prisma.user.create({ data: { email, name: String(u.name), passwordHash: await hashPassword(randomBytes(24).toString("hex")) } }));
    const m = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: org.id, userId: user.id } } });
    if (!m) await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, roleId: role.id, title: "Vendedor (Odoo)", status: "DISABLED" } });
    userMap.set(u.id, user.id);
  }

  // Asigna el vendedor a cada pedido por número (S27168 → Alexander Quintero)
  const sos = await readAll<R>("sale.order", [["date_order", ">=", since], ["user_id", "!=", false]], ["name", "user_id"]);
  const byUser = new Map<string, string[]>();
  for (const s of sos) { const uid = userMap.get(s.user_id[0]); if (uid) byUser.set(uid, [...(byUser.get(uid) ?? []), s.name]); }
  let updated = 0;
  for (const [uid, numbers] of byUser) {
    for (let i = 0; i < numbers.length; i += 2000) {
      const r = await prisma.salesOrder.updateMany({ where: { organizationId: org.id, number: { in: numbers.slice(i, i + 2000) } }, data: { ownerId: uid } });
      updated += r.count;
    }
  }
  console.log(`  vendedores: ${odooUsers.length} (desactivados hasta que los actives) · pedidos asignados: ${updated}`);
}

if (process.argv[1]?.endsWith("salespeople.ts")) {
  if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
  const since = process.env.ODOO_SINCE ?? new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  syncSalespeople("kliniu", since).then(() => process.exit(0), (e) => { console.error("✖", e.message); process.exit(1); });
}
