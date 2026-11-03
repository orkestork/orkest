import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { PageHeader } from "@/components/ui";
import { PayslipDoc } from "../../_docs";
import { orgForDocs } from "../../_org";

export const metadata = { title: "Desprendible" };

export default async function PayslipPage({ params }: PageProps<"/hr/payroll/[id]">) {
  const ctx = await requireModule("hr", "hr.payroll.read");
  if (ctx.restricted("deny:costs")) notFound();
  const { id } = await params;
  const p = await ctx.db.payslip.findFirst({ where: { id }, include: { employee: { include: { department: { select: { name: true } } } } } });
  if (!p) notFound();
  return (
    <>
      <div className="print:hidden"><PageHeader title={`Desprendible ${p.period}`} crumbs={[{ label: "Nómina", href: "/hr/payroll" }, { label: p.employee.name }]} /></div>
      <PayslipDoc org={await orgForDocs(ctx)} p={p} />
    </>
  );
}
