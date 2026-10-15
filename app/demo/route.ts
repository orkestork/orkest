import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/core/prisma";
import { writeSession } from "@/lib/core/auth";

/** Acceso público de pruebas: si PUBLIC_DEMO_EMAIL está definido, abre sesión como ese usuario sin clave. */
export async function GET(req: NextRequest) {
  const email = process.env.PUBLIC_DEMO_EMAIL?.trim().toLowerCase();
  if (!email) return NextResponse.redirect(new URL("/login", req.url));
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const first = await prisma.membership.findFirst({ where: { userId: user.id, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  await writeSession({ sub: user.id, org: first?.organizationId });
  const next = req.nextUrl.searchParams.get("next") ?? "";
  return NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/", req.url));
}
