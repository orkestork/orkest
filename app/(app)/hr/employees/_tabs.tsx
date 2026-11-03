import { Tabs } from "../_ui";

export function EmployeeTabs({ active }: { active: string }) {
  return (
    <Tabs active={active} items={[
      { label: "Colaboradores", href: "/hr/employees" },
      { label: "Departamentos", href: "/hr/employees/departments" },
      { label: "Documentos", href: "/hr/employees/documents" },
      { label: "Dotación", href: "/hr/employees/assets" },
    ]} />
  );
}
