import { requireModule } from "@/lib/core/context";
import { campaignScope, campaignSellers, listCampaigns } from "@/lib/apps/campaigns";
import { getUsdRate } from "@/lib/apps/trm";
import { localNow } from "@/lib/apps/commercial-calendar";
import { CampaignsPanel } from "./campaigns-panel";

export const metadata = { title: "Campañas" };

/** Campañas de pauta: KPIs, ROAS frente a la meta (×), matriz diaria por campaña. */
export default async function CampaignsPage() {
  const ctx = await requireModule("campaigns", "campaigns.read");
  const s = await campaignScope(ctx);
  const [campaigns, sellers, trm] = await Promise.all([
    listCampaigns(ctx, s),
    campaignSellers(ctx, s),
    getUsdRate(s.currency, localNow(s.tz).key),
  ]);
  // El filtro de vendedor incluye a quien tenga campañas aunque ya no pueda editar.
  const sellerOpts = new Map(sellers.map((x) => [x.id, x.name]));
  for (const c of campaigns) if (!sellerOpts.has(c.seller.id)) sellerOpts.set(c.seller.id, c.seller.name);

  return (
    <CampaignsPanel
      campaigns={campaigns}
      sellers={sellers}
      sellerFilterOptions={[...sellerOpts].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "es"))}
      currency={s.currency}
      orgName={ctx.org.name}
      trm={trm}
      today={localNow(s.tz).key}
      currentUserId={ctx.user.id}
      canWrite={ctx.can("campaigns.write")}
      canAssign={!s.own}
      canExport={!ctx.restricted("deny:export")}
    />
  );
}
