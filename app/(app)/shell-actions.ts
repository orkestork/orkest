"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/core/prisma";
import { getSessionUser, actionContext } from "@/lib/core/context";
import { writeSession } from "@/lib/core/auth";

/** Organization Switcher: valida membership y cambia el workspace activo. */
export async function switchOrganization(form: FormData) {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  const orgId = String(form.get("orgId"));
  const m = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId: s.user.id } } });
  if (!m || m.status !== "ACTIVE") throw new Error("No perteneces a esa organización");
  await writeSession({ sub: s.user.id, org: orgId });
  redirect("/");
}

export async function markNotificationsRead() {
  const ctx = await actionContext();
  await ctx.db.notification.updateMany({ where: { userId: ctx.user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}
