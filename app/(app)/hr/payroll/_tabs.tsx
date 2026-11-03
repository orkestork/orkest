import { Tabs } from "../_ui";

export function PayrollTabs({ active, pendingCerts }: { active: string; pendingCerts?: number }) {
  return (
    <Tabs active={active} items={[
      { label: "Desprendibles", href: "/hr/payroll" },
      { label: "Pagos", href: "/hr/payroll/payments" },
      { label: "Aportes", href: "/hr/payroll/contributions" },
      { label: "Certificados", href: "/hr/payroll/certificates", count: pendingCerts },
    ]} />
  );
}
