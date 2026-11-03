import { requireModule } from "@/lib/core/context";
import { campaignScope } from "@/lib/apps/campaigns";
import { loadCalendar } from "@/lib/apps/commercial-calendar-data";
import { localNow } from "@/lib/apps/commercial-calendar";
import { CalendarView } from "./calendar-view";

export const metadata = { title: "Calendario comercial" };

/** Calendario de cumplimiento del reporte diario de ventas por vendedor. */
export default async function CommercialCalendarPage({ searchParams }: PageProps<"/campaigns/calendar">) {
  const ctx = await requireModule("campaigns", "campaigns.read");
  const s = await campaignScope(ctx);
  const sp = await searchParams;
  const nowMonth = localNow(s.tz).key.slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : nowMonth;
  const platform = typeof sp.platform === "string" ? sp.platform : "";
  const data = await loadCalendar(ctx, s, { month, platform: platform || undefined });

  return (
    <CalendarView
      data={data}
      platform={platform}
      nowMonth={nowMonth}
      userId={ctx.user.id}
      canManage={s.manage}
      canWrite={ctx.can("campaigns.write")}
      currency={s.currency}
      showCampaignsLink={ctx.can("campaigns.read")}
    />
  );
}
