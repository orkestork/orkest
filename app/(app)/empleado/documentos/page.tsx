import NextLink from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader, Table, td } from "@/components/ui";
import { fileUrl } from "@/lib/core/files";
import { dateTime } from "@/lib/ui/format";
import { DOCUMENT_CATEGORY, REQUEST_STATUS } from "@/lib/ui/hr-labels";
import { cancelMyRequest, submitCertificate, uploadEmployeeDocument } from "../../hr/actions";
import { dday, Pill } from "../../hr/_ui";
import { NoProfile, portal } from "../_me";

export const metadata = { title: "Mis documentos" };

export default async function MyDocuments() {
  const { ctx, me } = await portal();
  if (!me) return <NoProfile title="Documentos" />;
  const [docs, certs] = await Promise.all([
    ctx.db.employeeDocument.findMany({ where: { employeeId: me.id }, orderBy: { createdAt: "desc" } }),
    ctx.db.certificateRequest.findMany({ where: { employeeId: me.id }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <>
      <PageHeader title="Documentos" subtitle="Tus contratos y soportes, y certificados laborales." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Certificados laborales" padded={false}>
            <Table head={["Solicitado", "Incluye salario", "Estado", ""]} empty={certs.length === 0}>
              {certs.map((c) => (
                <tr key={c.id}>
                  <td className={td}>{dateTime(c.createdAt)}</td>
                  <td className={td}>{c.includeSalary ? "Sí" : "No"}</td>
                  <td className={td}><Pill map={REQUEST_STATUS} value={c.status} />{c.reviewNote && <div className="text-xs text-slate-500">{c.reviewNote}</div>}</td>
                  <td className={td}>
                    {c.status === "APPROVED" && <NextLink href={`/empleado/documentos/certificado/${c.id}`} className={btn.small}>Descargar</NextLink>}
                    {c.status === "PENDING" && <form action={cancelMyRequest}><input type="hidden" name="kind" value="certificate" /><input type="hidden" name="id" value={c.id} /><button className="text-xs text-[var(--ork-pink)] hover:underline">Cancelar</button></form>}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Mis documentos" padded={false}>
            <Table head={["Documento", "Categoría", "Vence", "Cargado"]} empty={docs.length === 0}>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className={td}><a href={fileUrl(d.fileId)} target="_blank" className="font-medium text-[var(--ork-violet)] hover:underline">{d.name}</a></td>
                  <td className={td}>{DOCUMENT_CATEGORY[d.category]}</td><td className={td}>{dday(d.expiresAt)}</td><td className={td}>{dday(d.createdAt)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Solicitar certificado laboral">
            <ActionForm action={submitCertificate} className="space-y-3">
              <Field label="Dirigido a" hint="Vacío: «A quien interese»"><input name="addressee" className={input} placeholder="Ej. Banco de Bogotá" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="includeSalary" /> Incluir salario</label>
              <SubmitButton className={btn.primary}>Solicitar</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Cargar un documento">
            <ActionForm action={uploadEmployeeDocument} className="space-y-3">
              <input type="hidden" name="self" value="1" />
              <Field label="Nombre"><input name="name" className={input} placeholder="Ej. Diploma, certificado de estudio" /></Field>
              <Field label="Archivo *" hint="PDF o imagen · máx. 8 MB"><input type="file" name="file" required className="text-sm" /></Field>
              <SubmitButton className={btn.secondary}>Cargar</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
