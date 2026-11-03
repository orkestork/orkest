import { Tabs } from "../_ui";

export function CommsTabs({ active }: { active: string }) {
  return <Tabs active={active} items={[{ label: "Noticias", href: "/hr/news" }, { label: "Beneficios", href: "/hr/news/benefits" }]} />;
}
