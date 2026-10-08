import "dotenv/config";
import { prisma } from "@/lib/core/prisma";
import { signSession } from "@/lib/core/auth";
async function main() {
  const u = await prisma.user.findUniqueOrThrow({ where: { email: process.argv[2] } });
  const m = await prisma.membership.findFirst({ where: { userId: u.id } });
  console.log(await signSession({ sub: u.id, org: m?.organizationId }));
  await prisma.$disconnect();
}
main();
