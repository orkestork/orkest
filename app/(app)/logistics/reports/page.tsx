import { requireModule } from "@/lib/core/context";
import { OpsReportsPage } from "@/components/ops-reports/reports-page";

export const metadata = { title: "Informes" };

export default async function Reports({ searchParams }: PageProps<"/logistics/reports">) {
  const ctx = await requireModule("logistics", "logistics.read");
  return <OpsReportsPage ctx={ctx} module="logistics" sp={await searchParams} />;
}
