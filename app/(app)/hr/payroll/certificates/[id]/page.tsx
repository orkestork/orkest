import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { prisma } from "@/lib/core/prisma";
import { PageHeader } from "@/components/ui";
import { CertificateDoc } from "../../../_docs";
import { orgForDocs } from "../../../_org";

export const metadata = { title: "Certificado laboral" };

export default async function CertificatePage({ params }: PageProps<"/hr/payroll/certificates/[id]">) {
  const ctx = await requireModule("hr", "hr.payroll.read");
  const { id } = await params;
  const c = await ctx.db.certificateRequest.findFirst({ where: { id, status: "APPROVED" }, include: { employee: { include: { department: { select: { name: true } } } } } });
  if (!c) notFound();
  const signer = c.reviewedById ? (await prisma.user.findUnique({ where: { id: c.reviewedById }, select: { name: true } }))?.name : null;
  return (
    <>
      <div className="print:hidden"><PageHeader title="Certificado laboral" crumbs={[{ label: "Certificados", href: "/hr/payroll/certificates" }, { label: c.employee.name }]} /></div>
      <CertificateDoc org={await orgForDocs(ctx)} c={c} signer={signer ?? "Talento humano"} />
    </>
  );
}
