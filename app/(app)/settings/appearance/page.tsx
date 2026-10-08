import { requirePermission } from "@/lib/core/context";
import { PageHeader } from "@/components/ui";
import { normalizeTheme } from "@/lib/ui/theme";
import { AppearanceEditor } from "./editor";

export const metadata = { title: "Apariencia" };

export default async function Appearance() {
  const ctx = await requirePermission("org.settings.manage");
  const b = ctx.org.branding;
  return (
    <>
      <PageHeader title="Apariencia" subtitle="Colores de la interfaz, fondo, tarjetas y el paquete de íconos de las apps. Elige un tema listo o ajusta cada detalle; la vista previa cambia al instante." />
      <AppearanceEditor initial={normalizeTheme(b.theme, b.primaryColor)} initialName={b.displayName ?? ""} initialLogo={b.logoUrl ?? ""} orgName={ctx.org.name} />
    </>
  );
}
