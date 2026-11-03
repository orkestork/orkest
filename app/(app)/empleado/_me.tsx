import { requireModule } from "@/lib/core/context";
import { myEmployee } from "@/lib/apps/hr";
import { Empty, PageHeader } from "@/components/ui";

/** Contexto del portal: exige la app y el permiso, y resuelve la ficha del colaborador (puede no existir). */
export async function portal() {
  const ctx = await requireModule("employee_portal", "hr.portal");
  const me = await myEmployee(ctx);
  return { ctx, me };
}

export function NoProfile({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Empty title="Tu usuario aún no tiene ficha de colaborador.">Pide a talento humano que te vincule para ver tus vacaciones, nómina y solicitudes.</Empty>
    </>
  );
}
