import type { ExecContext } from "./context";

export async function orgUsers(ctx: ExecContext) {
  const ms = await ctx.db.membership.findMany({ where: { status: "ACTIVE" }, include: { user: true, role: true }, orderBy: { createdAt: "asc" } });
  return ms.map((m) => ({ id: m.userId, name: m.user.name, email: m.user.email, roleKey: m.role.key, roleName: m.role.name }));
}
