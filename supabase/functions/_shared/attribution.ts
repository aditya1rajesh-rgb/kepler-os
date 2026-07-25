// Deno port of the pure attribution matchers in src/lib/tracking.js. Keep in sync
// with that file — both match a campaign by its immutable 8-char id-prefix suffix.

interface Campaign { id: string; title?: string; goal?: string; }

/** Match a GA4 sessionCampaignName (or any utm_campaign) back to a campaign. */
export const matchCampaign = (utmCampaignName: string, campaigns: Campaign[] = []): Campaign | null => {
  const name = String(utmCampaignName || "").toLowerCase();
  if (!name) return null;
  return campaigns.find((c) => {
    const id8 = String(c?.id || "").slice(0, 8).toLowerCase();
    return id8 && name.endsWith(id8);
  }) || null;
};

/** Match free text (e.g. a CRM record's Description) to a campaign by id-suffix. */
export const matchByText = (text: string, campaigns: Campaign[] = []): Campaign | null => {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  return campaigns.find((c) => {
    const id8 = String(c?.id || "").slice(0, 8).toLowerCase();
    return id8 && t.includes(id8);
  }) || null;
};
