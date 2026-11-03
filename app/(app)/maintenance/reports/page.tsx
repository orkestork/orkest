import { requireModule } from "@/lib/core/context";
import { OpsReportsPage } from "@/components/ops-reports/reports-page";

export const metadata = { title: "Informes" };

export default async function Reports({ searchParams }: PageProps<"/maintenance/reports">) {
  const ctx = await requireModule("maintenance", "maintenance.read");
  return <OpsReportsPage ctx={ctx} module="maintenance" sp={await searchParams} />;
}
