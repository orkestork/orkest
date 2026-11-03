import { requireModule } from "@/lib/core/context";
import { OpsReportsPage } from "@/components/ops-reports/reports-page";

export const metadata = { title: "Informes" };

export default async function Reports({ searchParams }: PageProps<"/manufacturing/reports">) {
  const ctx = await requireModule("manufacturing", "manufacturing.read");
  return <OpsReportsPage ctx={ctx} module="manufacturing" sp={await searchParams} />;
}
