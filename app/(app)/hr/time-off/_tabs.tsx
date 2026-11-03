import { Tabs } from "../_ui";

export function TimeOffTabs({ active }: { active: string }) {
  return <Tabs active={active} items={[{ label: "Ausencias", href: "/hr/time-off" }, { label: "Horas extras", href: "/hr/time-off/overtime" }, { label: "Asistencia", href: "/hr/time-off/attendance" }]} />;
}
