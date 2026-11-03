import { notFound } from "next/navigation";
import { prisma } from "@/lib/core/prisma";
import { PageHeader } from "@/components/ui";
import { CertificateDoc } from "../../../../hr/_docs";
import { orgForDocs } from "../../../../hr/_org";
import { portal } from "../../../_me";

export const metadata = { title: "Certificado laboral" };

export default async function MyCertificate({ params }: PageProps<"/empleado/documentos/certificado/[id]">) {
  const { ctx, me } = await portal();
  const { id } = await params;
  const c = me && await ctx.db.certificateRequest.findFirst({ where: { id, employeeId: me.id, status: "APPROVED" }, include: { employee: { include: { department: { select: { name: true } } } } } });
  if (!c) notFound();
  const signer = c.reviewedById ? (await prisma.user.findUnique({ where: { id: c.reviewedById }, select: { name: true } }))?.name : null;
  return (
    <>
      <div className="print:hidden"><PageHeader title="Certificado laboral" crumbs={[{ label: "Documentos", href: "/empleado/documentos" }, { label: "Certificado" }]} /></div>
      <CertificateDoc org={await orgForDocs(ctx)} c={c} signer={signer ?? "Talento humano"} />
    </>
  );
}
