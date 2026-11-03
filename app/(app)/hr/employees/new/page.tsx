import { requireModule } from "@/lib/core/context";
import { Card, PageHeader } from "@/components/ui";
import { EmployeeForm } from "../_form";
import { formOptions } from "../_data";

export const metadata = { title: "Nuevo colaborador" };

export default async function NewEmployee() {
  const ctx = await requireModule("hr", "hr.employees.write");
  const o = await formOptions(ctx);
  return (
    <>
      <PageHeader title="Nuevo colaborador" crumbs={[{ label: "Talento humano", href: "/hr" }, { label: "Colaboradores", href: "/hr/employees" }, { label: "Nuevo" }]} />
      <Card><EmployeeForm {...o} canSalary={ctx.can("hr.payroll.write")} /></Card>
    </>
  );
}
