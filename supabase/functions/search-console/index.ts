// search-console - Google Search Console connector (Phase D).
//
// All OAuth token exchange/refresh + GSC API calls happen HERE (server-side).
// The refresh_token is stored via the service role and never returned to the
// browser. Identity is verified per request (getUser); workspace membership is
// checked before any token use. Mirrors the ai-proxy conventions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── CORS (mirrors ai-proxy) ──────────────────────────────────────────────────
const parseOriginList = (raw: string | undefined): string[] =>
  (raw ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);

const PRODUCTION_ALLOWLIST = [
  ...parseOriginList(Deno.env.get("ALLOWED_ORIGINS")),
  ...parseOriginList(Deno.env.get("APP_URL")),
];
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const isLocalOrigin = (origin: string): boolean => {
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
};
const isAllowedOrigin = (origin: string): boolean => {
  if (!origin) return false;
  if (isLocalOrigin(origin)) return true;
  return PRODUCTION_ALLOWLIST.includes(origin.replace(/\/$/, ""));
};
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

// ─── Config ───────────────────────────────────────────────────────────────────
interface GscConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
}
const loadConfig = (): GscConfig => {
  const clientId = Deno.env.get("GSC_CLIENT_ID");
  const clientSecret = Deno.env.get("GSC_CLIENT_SECRET");
  const redirectUri = Deno.env.get("GSC_REDIRECT_URI");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  // Supabase auto-injects SUPABASE_SERVICE_ROLE_KEY; fall back to a manual name.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const missing = [
    ["GSC_CLIENT_ID", clientId], ["GSC_CLIENT_SECRET", clientSecret],
    ["GSC_REDIRECT_URI", redirectUri], ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey], ["SUPABASE_ANON_KEY", anonKey],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`search-console is not configured: missing ${missing.join(", ")}`);
  return { clientId, clientSecret, redirectUri, supabaseUrl, serviceRoleKey, anonKey } as GscConfig;
};

// ─── Auth (mirrors ai-proxy getAuthenticatedUser) ─────────────────────────────
const getUserId = async (req: Request, cfg: GscConfig): Promise<string | null> => {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const sb = createClient(cfg.supabaseUrl, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data, error } = await sb.auth.getUser(token);
    return error || !data?.user ? null : data.user.id;
  } catch {
    return null;
  }
};

const svcClient = (cfg: GscConfig) =>
  createClient(cfg.supabaseUrl, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

const isMember = async (svc: ReturnType<typeof svcClient>, workspaceId: string, userId: string): Promise<boolean> => {
  const { data } = await svc.from("workspace_members").select("user_id")
    .eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  return Boolean(data);
};

// ─── Google OAuth helpers ─────────────────────────────────────────────────────
const exchangeAuthCode = async (cfg: GscConfig, code: string) => {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: cfg.clientId, client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri, grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description || data?.error || "Google code exchange failed");
  return data as { access_token: string; refresh_token?: string };
};

const refreshAccessToken = async (cfg: GscConfig, refreshToken: string) => {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: cfg.clientId,
      client_secret: cfg.clientSecret, grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const expired = data?.error === "invalid_grant";
    throw Object.assign(new Error(data?.error_description || "Token refresh failed"), { expired });
  }
  return data.access_token as string;
};

const listSites = async (accessToken: string): Promise<string[]> => {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Could not list Search Console sites");
  return (data.siteEntry ?? [])
    .filter((s: { permissionLevel?: string }) => s.permissionLevel !== "siteUnverifiedUser")
    .map((s: { siteUrl: string }) => s.siteUrl);
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const queryAnalytics = async (accessToken: string, siteUrl: string) => {
  // GSC data lags ~2-3 days; use a 28-day window ending 3 days ago.
  const end = new Date(Date.now() - 3 * 86400000);
  const start = new Date(end.getTime() - 28 * 86400000);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: isoDate(start), endDate: isoDate(end), dimensions: ["query"], rowLimit: 100 }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Search Console query failed");
  return (data.rows ?? []).map((r: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }) => ({
    query: r.keys?.[0] ?? "",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
};

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const base = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: base });
  if (req.method !== "POST") return fail("Method not allowed", 405, base);

  let cfg: GscConfig;
  try {
    cfg = loadConfig();
  } catch (e) {
    return fail((e as Error).message, 500, base);
  }

  const userId = await getUserId(req, cfg);
  if (!userId) return fail("Unauthorized", 401, base);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body", 400, base);
  }
  const action = String(body.action ?? "");
  const svc = svcClient(cfg);

  try {
    // exchangeCode: state carries the workspaceId; verify membership before storing.
    if (action === "exchangeCode") {
      let workspaceId = "";
      try {
        workspaceId = JSON.parse(atob(String(body.state ?? ""))).workspaceId ?? "";
      } catch { /* invalid state */ }
      if (!workspaceId) return fail("Invalid OAuth state", 400, base);
      if (!(await isMember(svc, workspaceId, userId))) return fail("Not a member of this workspace", 403, base);

      const tokens = await exchangeAuthCode(cfg, String(body.code ?? ""));
      if (!tokens.refresh_token) {
        return fail("Google did not return a refresh token - remove KEPLER from your Google account's third-party access and reconnect.", 400, base);
      }
      const sites = await listSites(tokens.access_token);
      const propertyUrl = sites.length === 1 ? sites[0] : "";
      const { error } = await svc.from("workspace_integrations").upsert({
        workspace_id: workspaceId,
        provider: "gsc",
        refresh_token: tokens.refresh_token,
        property_url: propertyUrl,
        status: "connected",
        meta: { sites },
        last_error: "",
      }, { onConflict: "workspace_id,provider" });
      if (error) throw error;
      return json({ sites, propertyUrl }, 200, base);
    }

    // All other actions target an existing integration for a workspace.
    const workspaceId = String(body.workspaceId ?? "");
    if (!workspaceId) return fail("workspaceId is required", 400, base);
    if (!(await isMember(svc, workspaceId, userId))) return fail("Not a member of this workspace", 403, base);

    if (action === "setProperty") {
      const { error } = await svc.from("workspace_integrations")
        .update({ property_url: String(body.propertyUrl ?? "") })
        .eq("workspace_id", workspaceId).eq("provider", "gsc");
      if (error) throw error;
      return json({ ok: true }, 200, base);
    }

    if (action === "disconnect") {
      const { error } = await svc.from("workspace_integrations")
        .delete().eq("workspace_id", workspaceId).eq("provider", "gsc");
      if (error) throw error;
      return json({ ok: true }, 200, base);
    }

    if (action === "query") {
      const { data: row, error } = await svc.from("workspace_integrations")
        .select("refresh_token, property_url").eq("workspace_id", workspaceId).eq("provider", "gsc").maybeSingle();
      if (error) throw error;
      if (!row?.refresh_token) return fail("Search Console is not connected", 400, base);
      if (!row.property_url) return fail("No Search Console property selected", 400, base);
      try {
        const accessToken = await refreshAccessToken(cfg, row.refresh_token);
        const rows = await queryAnalytics(accessToken, row.property_url);
        await svc.from("workspace_integrations")
          .update({ last_sync_at: new Date().toISOString(), status: "connected", last_error: "" })
          .eq("workspace_id", workspaceId).eq("provider", "gsc");
        return json({ rows, propertyUrl: row.property_url }, 200, base);
      } catch (e) {
        const err = e as Error & { expired?: boolean };
        if (err.expired) {
          await svc.from("workspace_integrations").update({ status: "expired", last_error: "Token expired - reconnect." })
            .eq("workspace_id", workspaceId).eq("provider", "gsc");
          return fail("Search Console access expired - please reconnect.", 401, base);
        }
        throw err;
      }
    }

    return fail(`Unknown action: ${action}`, 400, base);
  } catch (e) {
    return fail((e as Error).message ?? "Search Console request failed", 502, base);
  }
});
