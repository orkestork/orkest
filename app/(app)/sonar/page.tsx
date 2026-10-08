import Link from "@/components/plink";
import { requireModule } from "@/lib/core/context";
import { orgUsers } from "@/lib/core/members";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { date } from "@/lib/ui/format";
import { saveSonarSession } from "../knowledge/actions";

export const metadata = { title: "Sonar" };

export default async function Sonar() {
  const ctx = await requireModule("sonar", "sonar.read");
  const [sessions, users] = await Promise.all([
    ctx.db.sonarSession.findMany({ include: { _count: { select: { items: true } } }, orderBy: { date: "desc" } }),
    orgUsers(ctx),
  ]);
  return (
    <>
      <PageHeader title="ORKEST Sonar" subtitle="Sesiones para convertir conocimiento empresarial en capacidades estructuradas: hallazgos, problemas, decisiones, acciones, procesos y riesgos." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={["Sesión", "Área", "Registros", "Estado", "Fecha"]} empty={sessions.length === 0}>
            {sessions.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className={td}><Link href={`/sonar/${s.id}`} className="font-medium hover:underline">{s.title}</Link></td>
                <td className={td}>{s.area ?? "—"}</td>
                <td className={td}>{s._count.items}</td>
                <td className={td}><Badge tone={s.status === "open" ? "blue" : "slate"}>{s.status === "open" ? "Abierta" : "Cerrada"}</Badge></td>
                <td className={td}>{date(s.date)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {ctx.can("sonar.write") && (
          <Card title="Nueva sesión">
            <ActionForm action={saveSonarSession} className="space-y-3">
              <Field label="Título *"><input name="title" required className={input} /></Field>
              <Field label="Área"><input name="area" className={input} /></Field>
              <Field label="Participantes">
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {users.map((u) => <label key={u.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="participants" value={u.id} />{u.name}</label>)}
                </div>
              </Field>
              <Field label="Objetivo / resumen"><textarea name="summary" rows={3} className={input} /></Field>
              <SubmitButton className={btn.primary}>Crear sesión</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
