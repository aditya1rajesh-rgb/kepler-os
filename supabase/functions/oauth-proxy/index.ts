// oauth-proxy - generic OAuth-redirect connector backend (Phase D standardization).
//
// The OAuth analog of connector-proxy: one function handles the redirect-grant
// flow for EVERY OAuth connector, so adding one = a registry entry + (when a
// module consumes it) a small query adapter here. No bespoke per-provider
// function anymore (this supersedes the GSC-only `search-console`).
//
// Families share one registered app (client id/secret/redirect) reused across
// their connectors; only the scopes differ (set client-side). Token exchange +
// refresh + all API calls happen HERE (service role); the refresh/access token
// is stored in the hidden `refresh_token` column and never returned to the browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── CORS (mirrors connector-proxy) ───────────────────────────────────────────
const parseOriginList = (raw: string | undefined): string[] =>
  (raw ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
const PRODUCTION_ALLOWLIST = [
  ...parseOriginList(Deno.env.get("ALLOWED_ORIGINS")),
  ...parseOriginList(Deno.env.get("APP_URL")),
];
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const isLocalOrigin = (origin: string): boolean => {
  try { return LOCAL_HOSTNAMES.has(new URL(origin).hostname); } catch { return false; }
};
const isAllowedOrigin = (origin: string): boolean =>
  Boolean(origin) && (isLocalOrigin(origin) || PRODUCTION_ALLOWLIST.includes(origin.replace(/\/$/, "")));
const corsHeaders = (origin: string): Record<string, string> => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  else if (PRODUCTION_ALLOWLIST.length > 0) headers["Access-Control-Allow-Origin"] = PRODUCTION_ALLOWLIST[0];
  return headers;
};
const json = (payload: unknown, status: number, base: Record<string, string>) =>
  new Response(JSON.stringify(payload), { status, headers: { ...base, "Content-Type": "application/json" } });
const fail = (message: string, status: number, base: Record<string, string>) =>
  json({ error: { message } }, status, base);

// ─── Config + auth (mirrors connector-proxy) ──────────────────────────────────
interface Cfg { supabaseUrl: string; serviceRoleKey: string; anonKey: string; }
const loadConfig = (): Cfg => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const missing = [["SUPABASE_URL", supabaseUrl], ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey], ["SUPABASE_ANON_KEY", anonKey]]
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`oauth-proxy is not configured: missing ${missing.join(", ")}`);
  return { supabaseUrl, serviceRoleKey, anonKey } as Cfg;
};
const getUserId = async (req: Request, cfg: Cfg): Promise<string | null> => {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const sb = createClient(cfg.supabaseUrl, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data, error } = await sb.auth.getUser(token);
    return error || !data?.user ? null : data.user.id;
  } catch { return null; }
};
const svcClient = (cfg: Cfg) =>
  createClient(cfg.supabaseUrl, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const isMember = async (svc: ReturnType<typeof svcClient>, workspaceId: string, userId: string): Promise<boolean> => {
  const { data } = await svc.from("workspace_members").select("user_id")
    .eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  return Boolean(data);
};

// ─── OAuth families ───────────────────────────────────────────────────────────
// One registered app per family; env names fall back to the legacy GSC_* so an
// already-configured Search Console keeps working after this supersedes search-console.
const META_GRAPH = "https://graph.facebook.com/v21.0";
interface Family {
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  redirectUri: () => string | undefined;
  // Exchange an auth code for a durable token. Google → refresh_token; Meta has
  // no refresh token, so we store a long-lived (~60-day) access token in its place.
  exchange: (fam: Family, code: string) => Promise<{ token: string; expiresIn?: number }>;
  // Mint a usable access token from the stored durable token.
  accessToken: (fam: Family, stored: string) => Promise<string>;
}
const FAMILIES: Record<string, Family> = {
  google: {
    clientId: () => Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? Deno.env.get("GSC_CLIENT_ID"),
    clientSecret: () => Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? Deno.env.get("GSC_CLIENT_SECRET"),
    redirectUri: () => Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI") ?? Deno.env.get("GSC_REDIRECT_URI"),
    exchange: async (fam, code) => {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code, client_id: fam.clientId()!, client_secret: fam.clientSecret()!,
          redirect_uri: fam.redirectUri()!, grant_type: "authorization_code",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error_description || data?.error || "Google code exchange failed");
      if (!data.refresh_token) {
        throw new Error("Google did not return a refresh token - remove KEPLER from your Google account's third-party access and reconnect.");
      }
      return { token: data.refresh_token as string };
    },
    accessToken: async (fam, refreshToken) => {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken, client_id: fam.clientId()!,
          client_secret: fam.clientSecret()!, grant_type: "refresh_token",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const expired = data?.error === "invalid_grant";
        throw Object.assign(new Error(data?.error_description || "Token refresh failed"), { expired });
      }
      return data.access_token as string;
    },
  },
  meta: {
    clientId: () => Deno.env.get("META_OAUTH_CLIENT_ID"),
    clientSecret: () => Deno.env.get("META_OAUTH_CLIENT_SECRET"),
    redirectUri: () => Deno.env.get("META_OAUTH_REDIRECT_URI"),
    exchange: async (fam, code) => {
      // 1) code → short-lived token.
      const shortRes = await fetch(`${META_GRAPH}/oauth/access_token?` + new URLSearchParams({
        client_id: fam.clientId()!, client_secret: fam.clientSecret()!,
        redirect_uri: fam.redirectUri()!, code,
      }).toString());
      const shortData = await shortRes.json();
      if (!shortRes.ok) throw new Error(shortData?.error?.message || "Meta code exchange failed");
      // 2) short-lived → long-lived (~60 days). Meta has no refresh token.
      const longRes = await fetch(`${META_GRAPH}/oauth/access_token?` + new URLSearchParams({
        grant_type: "fb_exchange_token", client_id: fam.clientId()!,
        client_secret: fam.clientSecret()!, fb_exchange_token: shortData.access_token,
      }).toString());
      const longData = await longRes.json();
      if (!longRes.ok) throw new Error(longData?.error?.message || "Meta long-lived token exchange failed");
      return { token: longData.access_token as string, expiresIn: Number(longData.expires_in) || undefined };
    },
    // The stored long-lived token IS the access token - use it directly.
    accessToken: async (_fam, stored) => stored,
  },
  linkedin: {
    clientId: () => Deno.env.get("LINKEDIN_OAUTH_CLIENT_ID"),
    clientSecret: () => Deno.env.get("LINKEDIN_OAUTH_CLIENT_SECRET"),
    redirectUri: () => Deno.env.get("LINKEDIN_OAUTH_REDIRECT_URI"),
    exchange: async (fam, code) => {
      const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code", code,
          client_id: fam.clientId()!, client_secret: fam.clientSecret()!,
          redirect_uri: fam.redirectUri()!,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error_description || data?.error || "LinkedIn code exchange failed");
      // Member access tokens last ~60 days and aren't refreshable by default,
      // so we store the access token directly (like Meta) with its expiry.
      return { token: data.access_token as string, expiresIn: Number(data.expires_in) || undefined };
    },
    accessToken: async (_fam, stored) => stored,
  },
};

// ─── Provider registry (family + optional consumption adapter) ────────────────
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
// GSC: 28-day window ending 3 days ago (GSC data lags ~2-3 days).
const gscQuery = async (accessToken: string, row: { property_url?: string }) => {
  if (!row?.property_url) throw new Error("No Search Console property selected");
  const end = new Date(Date.now() - 3 * 86400000);
  const start = new Date(end.getTime() - 28 * 86400000);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(row.property_url)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: isoDate(start), endDate: isoDate(end), dimensions: ["query"], rowLimit: 100 }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Search Console query failed");
  const rows = (data.rows ?? []).map((r: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }) => ({
    query: r.keys?.[0] ?? "", clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? 0,
  }));
  return { rows };
};

const gaNum = (v: unknown) => Number(v ?? 0) || 0;
// GA4: list the properties this account can read (drives the picker).
const ga4ListProperties = async (accessToken: string) => {
  const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Could not list GA4 properties");
  const out: Array<{ id: string; label: string }> = [];
  for (const acc of data.accountSummaries ?? []) {
    for (const p of acc.propertySummaries ?? []) {
      out.push({ id: p.property, label: `${acc.displayName} - ${p.displayName}` });
    }
  }
  return out;
};
// GA4 attribution: sessions/users/conversions BY utm_campaign (sessionCampaignName).
// Tries keyEvents (GA4's post-2024 name for conversions); retries without it on
// properties/API versions that reject it, returning conversions=null in that case.
const ga4CampaignReport = async (accessToken: string, property: string) => {
  const run = (metrics: Array<{ name: string }>) => fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
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
    conversions: hasConversions ? gaNum(r.metricValues?.[2]?.value) : null,
  }));
  return { rows, hasConversions };
};
// GA4: last-28-days traffic by channel. Core metrics only (sessions/users/views)
// - deliberately avoids conversions/keyEvents, whose name changed in 2024 and
// would hard-fail on some properties.
const ga4Query = async (accessToken: string, row: { property_url?: string }, params: Record<string, unknown> = {}) => {
  const property = row?.property_url;
  if (!property) throw new Error("No GA4 property selected");
  if (params?.mode === "byCampaign") return ga4CampaignReport(accessToken, property);
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }],
      metricAggregations: ["TOTAL"],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 25,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "GA4 report failed");
  const mapRow = (r: { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }) => ({
    channel: r.dimensionValues?.[0]?.value || "(other)",
    sessions: gaNum(r.metricValues?.[0]?.value),
    users: gaNum(r.metricValues?.[1]?.value),
    pageViews: gaNum(r.metricValues?.[2]?.value),
  });
  const rows = (data.rows ?? []).map(mapRow);
  const totalRow = (data.totals ?? [])[0];
  const totals = totalRow
    ? { sessions: gaNum(totalRow.metricValues?.[0]?.value), users: gaNum(totalRow.metricValues?.[1]?.value), pageViews: gaNum(totalRow.metricValues?.[2]?.value) }
    : rows.reduce((a, r) => ({ sessions: a.sessions + r.sessions, users: a.users + r.users, pageViews: a.pageViews + r.pageViews }), { sessions: 0, users: 0, pageViews: 0 });
  return { rows, totals };
};

// Meta Ad Library: competitors' live ads to ground differentiated creative.
// ad_reached_countries is REQUIRED; ad_type=ALL (all ads) is broadly available
// only for EU-reached ads under the DSA - elsewhere results skew to political/
// issue ads. Needs search_terms (or a page id) to scope the query.
const metaAdLibraryQuery = async (accessToken: string, _row: Record<string, unknown>, params: Record<string, unknown>) => {
  const countriesRaw = params?.countries;
  const countries = Array.isArray(countriesRaw) && countriesRaw.length ? countriesRaw : ["US"];
  const qs = new URLSearchParams({
    access_token: accessToken,
    ad_reached_countries: JSON.stringify(countries),
    ad_active_status: String(params?.activeStatus ?? "ALL"),
    ad_type: String(params?.adType ?? "ALL"),
    search_terms: String(params?.searchTerms ?? ""),
    limit: String(Math.min(Number(params?.limit) || 25, 50)),
    fields: "id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_snapshot_url,publisher_platforms,ad_delivery_start_time",
  });
  const res = await fetch(`${META_GRAPH}/ads_archive?${qs.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Meta Ad Library query failed");
  const ads = ((data.data ?? []) as Array<Record<string, unknown>>).map((a) => ({
    id: String(a.id ?? ""),
    pageName: String(a.page_name ?? ""),
    bodies: (a.ad_creative_bodies ?? []) as string[],
    titles: (a.ad_creative_link_titles ?? []) as string[],
    descriptions: (a.ad_creative_link_descriptions ?? []) as string[],
    platforms: (a.publisher_platforms ?? []) as string[],
    snapshotUrl: String(a.ad_snapshot_url ?? ""),
    startTime: String(a.ad_delivery_start_time ?? ""),
  }));
  return { ads };
};

// LinkedIn: publish a text post to the authenticated member's feed via the
// modern Posts API. Reserved commentary chars are escaped so plain copy
// (parentheses, brackets) doesn't 422; # and @ are left so tags/mentions render.
const LINKEDIN_VERSION = "202606";
const escapeLiCommentary = (text: string) =>
  String(text ?? "").replace(/[\\(){}\[\]<>]/g, (c) => `\\${c}`);
const linkedinPublish = async (accessToken: string, row: Record<string, unknown>, payload: Record<string, unknown>) => {
  const authorUrn = (row.meta as Record<string, unknown> | undefined)?.authorUrn as string | undefined;
  if (!authorUrn) throw new Error("LinkedIn author not found - reconnect the account.");
  const text = String(payload?.text ?? "").trim();
  if (!text) throw new Error("Nothing to publish - the post is empty.");
  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: authorUrn,
      commentary: escapeLiCommentary(text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) {
    if (res.status === 401) throw Object.assign(new Error("LinkedIn access expired"), { expired: true });
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `LinkedIn publish failed (${res.status})`);
  }
  const postUrn = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "";
  return { ok: true, postUrn, postUrl: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : "" };
};

interface Provider {
  family: string;
  // Optional: pull data for a consuming module. Absent = connectable but no
  // consumption wired yet (Ads/Meta - added alongside their module UI).
  query?: (accessToken: string, row: Record<string, unknown>, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  // Optional: list selectable resources (e.g. GA4 properties) for a picker.
  listProperties?: (accessToken: string) => Promise<Array<{ id: string; label: string }>>;
  // Optional: publish content to the provider (e.g. a post to LinkedIn).
  publish?: (accessToken: string, row: Record<string, unknown>, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
}
const PROVIDERS: Record<string, Provider> = {
  "gsc": { family: "google", query: gscQuery },
  "ga4": { family: "google", listProperties: ga4ListProperties, query: ga4Query },
  "google-ads": { family: "google" },
  "meta-ads": { family: "meta" },
  "meta-ad-library": { family: "meta", query: metaAdLibraryQuery },
  "linkedin": { family: "linkedin", publish: linkedinPublish },
};

// List GSC properties so a single-property account auto-selects on connect.
const listGscSites = async (accessToken: string): Promise<string[]> => {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) return [];
  return (data.siteEntry ?? [])
    .filter((s: { permissionLevel?: string }) => s.permissionLevel !== "siteUnverifiedUser")
    .map((s: { siteUrl: string }) => s.siteUrl);
};

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const base = corsHeaders(req.headers.get("Origin") ?? "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: base });
  if (req.method !== "POST") return fail("Method not allowed", 405, base);

  let cfg: Cfg;
  try { cfg = loadConfig(); } catch (e) { return fail((e as Error).message, 500, base); }

  const userId = await getUserId(req, cfg);
  if (!userId) return fail("Unauthorized", 401, base);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("Invalid JSON body", 400, base); }
  const action = String(body.action ?? "");
  const svc = svcClient(cfg);

  try {
    // exchangeCode: state carries { workspaceId, connectorId }; store the token.
    if (action === "exchangeCode") {
      let workspaceId = "";
      let connectorId = "";
      try {
        const parsed = JSON.parse(atob(String(body.state ?? "")));
        workspaceId = parsed.workspaceId ?? "";
        connectorId = parsed.connectorId ?? "gsc";
      } catch { /* invalid state */ }
      if (!workspaceId) return fail("Invalid OAuth state", 400, base);
      const provider = PROVIDERS[connectorId];
      if (!provider) return fail(`Unknown OAuth connector: ${connectorId}`, 400, base);
      if (!(await isMember(svc, workspaceId, userId))) return fail("Not a member of this workspace", 403, base);

      const fam = FAMILIES[provider.family];
      if (!fam.clientId() || !fam.clientSecret() || !fam.redirectUri()) {
        return fail(`${provider.family} OAuth is not configured on the server.`, 500, base);
      }
      const { token, expiresIn } = await fam.exchange(fam, String(body.code ?? ""));

      // GSC convenience: discover properties + auto-select a lone one.
      let sites: string[] = [];
      let propertyUrl = "";
      if (connectorId === "gsc") {
        const at = await fam.accessToken(fam, token);
        sites = await listGscSites(at);
        propertyUrl = sites.length === 1 ? sites[0] : "";
      }
      // LinkedIn: capture the member's Person URN now - posts need it as author.
      let authorUrn = "";
      if (provider.family === "linkedin") {
        const at = await fam.accessToken(fam, token);
        const uiRes = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${at}` } });
        const ui = await uiRes.json().catch(() => ({}));
        if (!uiRes.ok || !ui?.sub) throw new Error(ui?.message || "Could not read your LinkedIn profile - reconnect.");
        authorUrn = `urn:li:person:${ui.sub}`;
      }
      const meta: Record<string, unknown> = { family: provider.family };
      if (sites.length) meta.sites = sites;
      if (authorUrn) meta.authorUrn = authorUrn;
      if (expiresIn) meta.expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      const { error } = await svc.from("workspace_integrations").upsert({
        workspace_id: workspaceId,
        provider: connectorId,
        refresh_token: token,
        property_url: propertyUrl,
        status: "connected",
        meta,
        last_error: "",
      }, { onConflict: "workspace_id,provider" });
      if (error) throw error;
      return json({ ok: true, sites, propertyUrl }, 200, base);
    }

    // Remaining actions target an existing integration.
    const workspaceId = String(body.workspaceId ?? "");
    const connectorId = String(body.provider ?? "");
    if (!workspaceId) return fail("workspaceId is required", 400, base);
    if (!(await isMember(svc, workspaceId, userId))) return fail("Not a member of this workspace", 403, base);

    if (action === "setProperty") {
      const { error } = await svc.from("workspace_integrations")
        .update({ property_url: String(body.propertyUrl ?? "") })
        .eq("workspace_id", workspaceId).eq("provider", connectorId || "gsc");
      if (error) throw error;
      return json({ ok: true }, 200, base);
    }

    if (action === "disconnect") {
      const { error } = await svc.from("workspace_integrations")
        .delete().eq("workspace_id", workspaceId).eq("provider", connectorId);
      if (error) throw error;
      return json({ ok: true }, 200, base);
    }

    if (action === "listProperties") {
      const provider = PROVIDERS[connectorId];
      if (!provider?.listProperties) return fail(`Listing properties for ${connectorId} isn't supported.`, 400, base);
      const { data: row } = await svc.from("workspace_integrations")
        .select("refresh_token").eq("workspace_id", workspaceId).eq("provider", connectorId).maybeSingle();
      if (!row?.refresh_token) return fail("Not connected", 400, base);
      const fam = FAMILIES[provider.family];
      const accessToken = await fam.accessToken(fam, row.refresh_token);
      const properties = await provider.listProperties(accessToken);
      return json({ properties }, 200, base);
    }

    if (action === "query") {
      const provider = PROVIDERS[connectorId];
      if (!provider) return fail(`Unknown OAuth connector: ${connectorId}`, 400, base);
      if (!provider.query) return fail(`Pulling data from ${connectorId} isn't available yet.`, 400, base);
      const { data: row, error } = await svc.from("workspace_integrations")
        .select("refresh_token, property_url, meta").eq("workspace_id", workspaceId).eq("provider", connectorId).maybeSingle();
      if (error) throw error;
      if (!row?.refresh_token) return fail("Not connected", 400, base);
      const fam = FAMILIES[provider.family];
      try {
        const accessToken = await fam.accessToken(fam, row.refresh_token);
        const result = await provider.query(accessToken, row as Record<string, unknown>, body);
        await svc.from("workspace_integrations")
          .update({ last_sync_at: new Date().toISOString(), status: "connected", last_error: "" })
          .eq("workspace_id", workspaceId).eq("provider", connectorId);
        return json({ ...result, propertyUrl: row.property_url }, 200, base);
      } catch (e) {
        const err = e as Error & { expired?: boolean };
        if (err.expired) {
          await svc.from("workspace_integrations").update({ status: "expired", last_error: "Access expired - reconnect." })
            .eq("workspace_id", workspaceId).eq("provider", connectorId);
          return fail(`${connectorId} access expired - please reconnect.`, 401, base);
        }
        throw err;
      }
    }

    if (action === "publish") {
      const provider = PROVIDERS[connectorId];
      if (!provider?.publish) return fail(`Publishing to ${connectorId} isn't available.`, 400, base);
      const { data: row, error } = await svc.from("workspace_integrations")
        .select("refresh_token, meta").eq("workspace_id", workspaceId).eq("provider", connectorId).maybeSingle();
      if (error) throw error;
      if (!row?.refresh_token) return fail("Not connected", 400, base);
      const fam = FAMILIES[provider.family];
      try {
        const accessToken = await fam.accessToken(fam, row.refresh_token);
        const result = await provider.publish(accessToken, row as Record<string, unknown>, (body.payload ?? {}) as Record<string, unknown>);
        await svc.from("workspace_integrations")
          .update({ last_sync_at: new Date().toISOString(), status: "connected", last_error: "" })
          .eq("workspace_id", workspaceId).eq("provider", connectorId);
        return json(result, 200, base);
      } catch (e) {
        const err = e as Error & { expired?: boolean };
        if (err.expired) {
          await svc.from("workspace_integrations").update({ status: "expired", last_error: "Access expired - reconnect." })
            .eq("workspace_id", workspaceId).eq("provider", connectorId);
          return fail(`${connectorId} access expired - please reconnect.`, 401, base);
        }
        throw err;
      }
    }

    return fail(`Unknown action: ${action}`, 400, base);
  } catch (e) {
    return fail((e as Error).message ?? "OAuth request failed", 502, base);
  }
});
