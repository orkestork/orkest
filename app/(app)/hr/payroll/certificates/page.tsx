import NextLink from "next/link";
import { requireModule } from "@/lib/core/context";
import { btn, Card, PageHeader, Table, td } from "@/components/ui";
import { REQUEST_STATUS } from "@/lib/ui/hr-labels";
import { dateTime } from "@/lib/ui/format";
import { decideCertificateAction } from "../../actions";
import { DecisionForm, Pill } from "../../_ui";
import { PayrollTabs } from "../_tabs";

export const metadata = { title: "Certificados laborales" };

export default async function Certificates() {
  const ctx = await requireModule("hr", "hr.payroll.read");
  const rows = await ctx.db.certificateRequest.findMany({ include: { employee: { select: { id: true, name: true } } }, orderBy: [{ status: "desc" }, { createdAt: "desc" }], take: 300 });
  const pending = rows.filter((r) => r.status === "PENDING").length;
  return (
    <>
      <PageHeader title="Certificados laborales" subtitle="Aprueba o rechaza las solicitudes de certificado. Al aprobar, el colaborador lo descarga desde su portal." />
      <PayrollTabs active="/hr/payroll/certificates" pendingCerts={pending} />
      <Card padded={false}>
        <Table head={["Colaborador", "Solicitado", "Incluye salario", "Dirigido a", "Estado", "Acciones"]} empty={rows.length === 0}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={td}><NextLink href={`/hr/employees/${r.employee.id}`} className="font-medium hover:underline">{r.employee.name}</NextLink></td>
              <td className={td}>{dateTime(r.createdAt)}</td>
              <td className={td}>{r.includeSalary ? "Sí" : "No"}</td>
              <td className={td}>{r.addressee ?? "A quien interese"}</td>
              <td className={td}><Pill map={REQUEST_STATUS} value={r.status} />{r.reviewNote && <div className="max-w-48 text-xs text-slate-500">{r.reviewNote}</div>}</td>
              <td className={td}>
                {r.status === "PENDING" && ctx.can("hr.payroll.write") && <DecisionForm action={decideCertificateAction} id={r.id} compact />}
                {r.status === "APPROVED" && <NextLink href={`/hr/payroll/certificates/${r.id}`} className={btn.small}>Ver certificado</NextLink>}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
