import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { PayslipDoc } from "../../../hr/_docs";
import { orgForDocs } from "../../../hr/_org";
import { portal } from "../../_me";

export const metadata = { title: "Desprendible" };

export default async function MyPayslip({ params }: PageProps<"/empleado/nomina/[id]">) {
  const { ctx, me } = await portal();
  const { id } = await params;
  const p = me && await ctx.db.payslip.findFirst({ where: { id, employeeId: me.id }, include: { employee: { include: { department: { select: { name: true } } } } } });
  if (!p) notFound();
  return (
    <>
      <div className="print:hidden"><PageHeader title={`Desprendible ${p.period}`} crumbs={[{ label: "Nómina", href: "/empleado/nomina" }, { label: p.period }]} /></div>
      <PayslipDoc org={await orgForDocs(ctx)} p={p} />
    </>
  );
}
