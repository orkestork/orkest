/**
 * Aplica la configuración declarativa de una organización (config/orgs/<slug>.json):
 * hoy, campos personalizados de Studio. Idempotente: crea o actualiza por clave, nunca borra.
 * Uso: tsx scripts/org-config.ts config/orgs/<slug>.json
 */
import { readFileSync } from "node:fs";

type FieldCfg = { entityType: string; key: string; label: string; type: string; options?: string[]; required?: boolean; helpText?: string };

export async function applyOrgConfig(file: string) {
  const { prisma } = await import("@/lib/core/prisma");
  const cfg = JSON.parse(readFileSync(file, "utf8")) as { slug: string; customFields?: FieldCfg[] };
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: cfg.slug } });
  for (const [i, f] of (cfg.customFields ?? []).entries()) {
    const data = {
      label: f.label, type: f.type, required: f.required ?? false, helpText: f.helpText ?? null, position: i, active: true,
      options: (f.options ?? []).map((o) => ({ value: o, label: o })),
    };
    await prisma.customFieldDefinition.upsert({
      where: { organizationId_entityType_key: { organizationId: org.id, entityType: f.entityType, key: f.key } },
      update: data, create: { organizationId: org.id, entityType: f.entityType, key: f.key, validation: {}, ...data },
    });
  }
  console.log(`✔ ${cfg.slug}: ${cfg.customFields?.length ?? 0} campos personalizados aplicados`);
}

if (process.argv[1]?.endsWith("org-config.ts")) {
  if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
  applyOrgConfig(process.argv[2]).then(() => process.exit(0), (e) => { console.error("✖", e.message); process.exit(1); });
}
