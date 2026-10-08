"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/core/prisma";
import { actionContext } from "@/lib/core/context";
import { audit } from "@/lib/core/notify";
import { json } from "@/lib/core/db";
import { normalizeTheme } from "@/lib/ui/theme";

export async function saveAppearance(d: { theme: unknown; displayName: string; logoUrl: string }) {
  const ctx = await actionContext("org.settings.manage");
  const theme = normalizeTheme(d.theme);
  const logo = d.logoUrl.trim();
  if (logo && !/^https:\/\/\S+$/i.test(logo) && !logo.startsWith("/")) return { error: "El logo debe ser una URL https:// (o una ruta interna)" };
  const branding = { ...(ctx.org.branding as object), displayName: d.displayName.trim() || undefined, logoUrl: logo || undefined, primaryColor: theme.accent, theme };
  await prisma.organization.update({ where: { id: ctx.orgId }, data: { branding: json(branding) } });
  await audit(ctx, "AppearanceUpdated", "organization", ctx.orgId, { theme });
  revalidatePath("/", "layout");
  return { ok: true };
}
