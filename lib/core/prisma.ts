import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Cliente SIN alcance de organización.
 * Úsalo solo en el Core (auth, memberships, plataforma, outbox).
 * El código de módulos debe usar `ctx.db` (cliente con alcance de tenant).
 */
const globalForPrisma = globalThis as typeof globalThis & { __orkestPrisma?: PrismaClient };

function createClient() {
  // DB_POOL_MAX: conexiones del pool. La base local de desarrollo (prisma dev) admite pocas; en producción subirlo (p. ej. 10).
  const max = Number(process.env.DB_POOL_MAX ?? (process.env.NODE_ENV === "production" ? 10 : 2));
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max, idleTimeoutMillis: 10_000 });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.__orkestPrisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__orkestPrisma = prisma;
