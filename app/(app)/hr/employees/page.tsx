import NextLink from "next/link";
import { requireModule } from "@/lib/core/context";
import { btn, input, PageHeader } from "@/components/ui";
import { DataTable, type Column, type Row } from "@/components/list/data-table";
import { Avatar } from "@/components/list/status-pill";
import { CONTRACT_TYPE, EMPLOYEE_STATUS, optsT } from "@/lib/ui/hr-labels";
import { money } from "@/lib/ui/format";
import { dday, Pill, Select } from "../_ui";
import { EmployeeTabs } from "./_tabs";

export const metadata = { title: "Colaboradores" };

export default async function Employees({ searchParams }: PageProps<"/hr/employees">) {
  const ctx = await requireModule("hr", "hr.employees.read");
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const dept = String(sp.dept ?? "");
  const status = String(sp.status ?? "ACTIVE_ALL");
  const showSalary = ctx.can("hr.payroll.read") && !ctx.restricted("deny:costs");
  const [employees, depts] = await Promise.all([
    ctx.db.employee.findMany({
      where: {
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { documentNumber: { contains: q } }, { position: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
        ...(dept ? { departmentId: dept } : {}),
        ...(status === "ACTIVE_ALL" ? { status: { not: "TERMINATED" } } : status ? { status } : {}),
      },
      include: { department: true, manager: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    ctx.db.orgUnit.findMany({ where: { kind: "DEPARTMENT" }, orderBy: { name: "asc" } }),
  ]);

  const columns: Column[] = [
    { key: "name", label: "Colaborador", sortable: true },
    { key: "documentNumber", label: "Documento", width: "130px" },
    { key: "position", label: "Cargo", sortable: true },
    { key: "department", label: "Departamento", sortable: true, width: "160px" },
    { key: "manager", label: "Jefe inmediato", optional: true, width: "170px" },
    { key: "contract", label: "Contrato", optional: true, hidden: true, width: "160px" },
    { key: "hireDate", label: "Ingreso", sortable: true, width: "120px" },
    ...(showSalary ? [{ key: "salary", label: "Salario", align: "right" as const, optional: true, sum: true, width: "140px" }] : []),
    { key: "status", label: "Estado", width: "110px" },
  ];
  const rows: Row[] = employees.map((e) => ({
    id: e.id, href: `/hr/employees/${e.id}`,
    cells: {
      name: <span className="flex items-center gap-2"><Avatar name={e.name} label={false} /><span><span className="font-medium">{e.name}</span>{!e.userId && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">sin acceso</span>}</span></span>,
      documentNumber: e.documentNumber ?? "—", position: e.position ?? "—", department: e.department?.name ?? "—", manager: e.manager?.name ?? "—",
      contract: CONTRACT_TYPE[e.contractType] ?? e.contractType, hireDate: dday(e.hireDate), salary: e.salaryAmount != null ? money(e.salaryAmount) : "—",
      status: <Pill map={EMPLOYEE_STATUS} value={e.status} />,
    },
    raw: { name: e.name, documentNumber: e.documentNumber ?? "", position: e.position ?? "", department: e.department?.name ?? "", manager: e.manager?.name ?? "", contract: e.contractType, hireDate: e.hireDate?.toISOString().slice(0, 10) ?? "", salary: Number(e.salaryAmount ?? 0), status: e.status },
  }));

  return (
    <>
      <PageHeader title="Colaboradores" subtitle={`${employees.length} ${status === "TERMINATED" ? "retirados" : "en la plantilla"}`}
        actions={ctx.can("hr.employees.write") && <NextLink href="/hr/employees/new" className={btn.primary}>Nuevo colaborador</NextLink>} />
      <EmployeeTabs active="/hr/employees" />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, documento, cargo o correo" className={`${input} max-w-sm`} />
        <Select name="dept" defaultValue={dept} empty="Todos los departamentos" options={depts.map((d) => ({ value: d.id, label: d.name }))} className="max-w-56" />
        <Select name="status" defaultValue={status} options={[{ value: "ACTIVE_ALL", label: "Vigentes" }, ...optsT(EMPLOYEE_STATUS), { value: "", label: "Todos" }]} className="max-w-40" />
        <button className={btn.secondary}>Filtrar</button>
      </form>
      <DataTable storageKey="hr-employees" columns={columns} rows={rows} moneyColumns={["salary"]} canExport={!ctx.restricted("deny:export")} />
    </>
  );
}
