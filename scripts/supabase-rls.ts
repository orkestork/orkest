import { Client } from "pg";

/**
 * Activa Row Level Security en toda tabla del esquema public que aún no la tenga (idempotente).
 * Sin políticas, la Data API de Supabase (roles anon/authenticated) no puede leer nada;
 * la app entra con el rol dueño de las tablas, que no está sujeto a RLS.
 * Uso: npm run db:rls:supabase
 */
async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query<{ t: string }>(
    `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`);
  for (const r of rows) await c.query(`alter table public."${r.t.replace(/"/g, '""')}" enable row level security`);
  const { rows: [tot] } = await c.query<{ n: string; on: string }>(
    `select count(*) n, count(*) filter (where c.relrowsecurity) "on" from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`);
  console.log(`RLS activada en ${rows.length} tablas nuevas · ${tot.on}/${tot.n} tablas protegidas`);
  await c.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
