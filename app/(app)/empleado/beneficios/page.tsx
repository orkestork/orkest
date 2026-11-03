import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, input, PageHeader, Table, td } from "@/components/ui";
import { dateTime } from "@/lib/ui/format";
import { BENEFIT_CATEGORY, REQUEST_STATUS } from "@/lib/ui/hr-labels";
import { cancelMyRequest, submitBenefitRequest } from "../../hr/actions";
import { dday, Pill } from "../../hr/_ui";
import { NoProfile, portal } from "../_me";

export const metadata = { title: "Beneficios" };

export default async function MyBenefits() {
  const { ctx, me } = await portal();
  if (!me) return <NoProfile title="Beneficios" />;
  const now = new Date();
  const [benefits, mine] = await Promise.all([
    ctx.db.benefit.findMany({ where: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }, orderBy: [{ isFeatured: "desc" }, { order: "asc" }, { title: "asc" }] }),
    ctx.db.benefitRequest.findMany({ where: { employeeId: me.id }, include: { benefit: { select: { title: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const pendingFor = new Set(mine.filter((r) => r.status === "PENDING").map((r) => r.benefitId));
  return (
    <>
      <PageHeader title="Beneficios" subtitle="Beneficios y convenios que la empresa ofrece. Solicita los que quieras usar." />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {benefits.length === 0 && <Card><p className="text-sm text-slate-400">Todavía no hay beneficios publicados.</p></Card>}
        {benefits.map((b) => (
          <Card key={b.id} className={b.isFeatured ? "ring-1 ring-[var(--ork-violet)]/30" : ""}>
            <p className="flex flex-wrap items-center gap-2 font-medium">{b.title}{b.isFeatured && <Badge tone="violet">Destacado</Badge>}</p>
            <p className="text-xs text-slate-500">{BENEFIT_CATEGORY[b.category]}{b.frequency ? ` · ${b.frequency}` : ""}{b.expiresAt ? ` · hasta ${dday(b.expiresAt)}` : ""}</p>
            <p className="mt-2 text-sm">{b.description}</p>
            {b.detail && <p className="mt-2 whitespace-pre-line text-xs text-slate-500">{b.detail}</p>}
            {pendingFor.has(b.id) ? <p className="mt-3 text-xs text-amber-700">Tienes una solicitud pendiente.</p> : (
              <ActionForm action={submitBenefitRequest} className="mt-3 flex gap-2">
                <input type="hidden" name="benefitId" value={b.id} />
                <input name="note" placeholder="Comentario (opcional)" className={`${input} py-1 text-xs`} />
                <SubmitButton className={btn.small} pendingText="…">Solicitar</SubmitButton>
              </ActionForm>
            )}
          </Card>
        ))}
      </div>
      <Card title="Mis solicitudes" padded={false}>
        <Table head={["Beneficio", "Fecha", "Estado", ""]} empty={mine.length === 0}>
          {mine.map((r) => (
            <tr key={r.id}>
              <td className={td}>{r.benefit.title}</td><td className={td}>{dateTime(r.createdAt)}</td>
              <td className={td}><Pill map={REQUEST_STATUS} value={r.status} />{r.reviewNote && <div className="text-xs text-slate-500">{r.reviewNote}</div>}</td>
              <td className={td}>{r.status === "PENDING" && <form action={cancelMyRequest}><input type="hidden" name="kind" value="benefit" /><input type="hidden" name="id" value={r.id} /><button className="text-xs text-[var(--ork-pink)] hover:underline">Cancelar</button></form>}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
