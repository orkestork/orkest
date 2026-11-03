import type { OrgContext } from "@/lib/core/context";
import { orgUsers } from "@/lib/core/members";

/** Opciones del formulario de colaborador: departamentos, posibles jefes y usuarios sin ficha. */
export async function formOptions(ctx: OrgContext, currentUserId?: string | null) {
  const [departments, managers, users, linked] = await Promise.all([
    ctx.db.orgUnit.findMany({ where: { kind: "DEPARTMENT", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.db.employee.findMany({ where: { status: { not: "TERMINATED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    orgUsers(ctx),
    ctx.db.employee.findMany({ where: { userId: { not: null } }, select: { userId: true } }),
  ]);
  const taken = new Set(linked.map((l) => l.userId).filter((u) => u !== currentUserId));
  return { departments, managers, users: users.filter((u) => !taken.has(u.id)).map(({ id, name, email }) => ({ id, name, email })) };
}
