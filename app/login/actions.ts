"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/core/prisma";
import { clearSession, verifyPassword, writeSession } from "@/lib/core/auth";
import type { ActionResult } from "@/components/action-form";

export async function login(_: ActionResult, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return { error: "Credenciales inválidas" };
  const first = await prisma.membership.findFirst({ where: { userId: user.id, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  await writeSession({ sub: user.id, org: first?.organizationId });
  const next = String(form.get("next") ?? "");
  if (!first) redirect(user.isPlatformAdmin ? "/platform" : "/onboarding/new");
  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}
