import { requirePermission } from "@/lib/core/context";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { inviteUser, resetMemberPassword, updateMembership } from "../actions";

export const metadata = { title: "Usuarios" };

export default async function Users() {
  const ctx = await requirePermission("org.users.manage");
  const [members, roles] = await Promise.all([
    ctx.db.membership.findMany({ include: { user: true, role: true }, orderBy: { createdAt: "asc" } }),
    ctx.db.role.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Usuarios" subtitle="Un usuario puede pertenecer a varias organizaciones con un rol distinto en cada una." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Usuario", "Cargo", "Rol", "Estado", ""]}>
            {members.map((m) => (
              <tr key={m.id}>
                <td className={td}><p className="font-medium">{m.user.name}</p><p className="text-xs text-slate-400">{m.user.email}</p></td>
                <td className={td}>{m.title ?? "—"}</td>
                <td className={td}>
                  {m.userId === ctx.user.id ? <Badge>{m.role.name}</Badge> : (
                    <form action={updateMembership} className="flex gap-1">
                      <input type="hidden" name="id" value={m.id} />
                      <select name="roleId" defaultValue={m.roleId} className="rounded-md border border-slate-300 px-2 py-1 text-xs">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                      <button className={btn.small}>Cambiar</button>
                    </form>
                  )}
                </td>
                <td className={td}><Badge tone={m.status === "ACTIVE" ? "emerald" : "slate"}>{m.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge></td>
                <td className={td}>
                  {m.userId !== ctx.user.id && (
                    <div className="flex flex-wrap items-center gap-1">
                      <form action={updateMembership}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value={m.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} /><button className={btn.ghost}>{m.status === "ACTIVE" ? "Desactivar" : "Activar"}</button></form>
                      <ActionForm action={resetMemberPassword}><input type="hidden" name="id" value={m.id} /><SubmitButton className={btn.ghost} pendingText="Generando…">Generar contraseña</SubmitButton></ActionForm>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Agregar usuario">
          <ActionForm action={inviteUser} className="space-y-3">
            <Field label="Email *"><input name="email" type="email" required className={input} /></Field>
            <Field label="Nombre"><input name="name" className={input} /></Field>
            <Field label="Cargo"><input name="title" className={input} /></Field>
            <Field label="Rol"><select name="roleId" className={input}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
            <SubmitButton className={btn.primary}>Agregar</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
