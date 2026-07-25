// Server-side Google Analytics 4 + Search Console data for the metrics-snapshot cron.
//
// These mirror the query logic in oauth-proxy (which serves the browser). They're
// duplicated here rather than imported so the scheduled function stays self-contained
// and a refactor of the user-facing proxy can't break the cron. Keep in sync with
// oauth-proxy's gscQuery / ga4CampaignReport if their shapes change.

const googleClientId = () => Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? Deno.env.get("GSC_CLIENT_ID");
const googleClientSecret = () => Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? Deno.env.get("GSC_CLIENT_SECRET");

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const gaNum = (v: unknown) => Number(v ?? 0) || 0;

/** Mint a short-lived access token from a stored Google refresh token. */
export const googleAccessToken = async (refreshToken: string): Promise<string> => {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: googleClientId()!,
      client_secret: googleClientSecret()!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description || data?.error || "Google token refresh failed");
  return data.access_token as string;
};

/** GA4 sessions/users/conversions by utm_campaign (sessionCampaignName), last 28d. */
export const ga4CampaignReport = async (accessToken: string, property: string) => {
  const run = (metrics: Array<{ name: string }>) =>
    fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        dimensions: [{ name: "sessionCampaignName" }],
        metrics,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 100,
      }),
    });
  let res = await run([{ name: "sessions" }, { name: "totalUsers" }, { name: "keyEvents" }]);
  const hasConversions = res.ok;
  if (!res.ok) res = await run([{ name: "sessions" }, { name: "totalUsers" }]);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "GA4 campaign report failed");
  const rows = (data.rows ?? []).map((r: { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }) => ({
    campaign: r.dimensionValues?.[0]?.value || "(unattributed)",
    sessions: gaNum(r.metricValues?.[0]?.value),
    users: gaNum(r.metricValues?.[1]?.value),
    conversions: hasConversions ? gaNum(r.metricValues?.[2]?.value) : 0,
  }));
  return { rows, hasConversions };
};

/** GSC aggregate totals (no dimensions) over a 28-day window ending 3 days ago. */
export const gscTotals = async (accessToken: string, propertyUrl: string) => {
  const end = new Date(Date.now() - 3 * 86400000);
  const start = new Date(end.getTime() - 28 * 86400000);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: isoDate(start), endDate: isoDate(end), rowLimit: 1 }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Search Console query failed");
  const row = data.rows?.[0];
  return {
    clicks: gaNum(row?.clicks),
    impressions: gaNum(row?.impressions),
    ctr: Number(row?.ctr ?? 0) || 0,
  };
};
