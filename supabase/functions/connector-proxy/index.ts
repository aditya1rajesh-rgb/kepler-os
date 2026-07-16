// connector-proxy - generic self-service connector backend (Phase D framework).
//
// Handles API-key connectors so that CONNECTING is pure UI: the user pastes a
// credential, we validate it against the provider, and store it in the hidden
// `credentials` column (server-side only, read via service role). Adding a new
// connector TYPE = one entry in PROVIDER_ADAPTERS + flipping it 'available' in
// the client registry. No backend change per CONNECTION. Mirrors search-console.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ZOHO_DC, zohoAccessToken, zohoToken } from "../_shared/zoho.ts";

// ─── CORS (mirrors ai-proxy / search-console) ─────────────────────────────────
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

// ─── Config + auth (mirrors search-console) ───────────────────────────────────
interface Cfg { supabaseUrl: string; serviceRoleKey: string; anonKey: string; }
const loadConfig = (): Cfg => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  // Supabase auto-injects SUPABASE_SERVICE_ROLE_KEY into every edge function;
  // fall back to SERVICE_ROLE_KEY if an operator set that name manually.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const missing = [["SUPABASE_URL", supabaseUrl], ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey], ["SUPABASE_ANON_KEY", anonKey]]
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`connector-proxy is not configured: missing ${missing.join(", ")}`);
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

// ─── Provider adapters ────────────────────────────────────────────────────────
// Each adapter validates a credential against the real API (proves "auto-integrate")
// and returns lightweight meta. Add a connector TYPE = add an entry here.
type Creds = Record<string, string>;
interface Adapter {
  // Validate a stored credential against the provider (used by `test`, and by
  // `connect` for adapters that store the pasted credential as-is).
  validate: (creds: Creds) => Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }>;
  // Optional: transform the pasted credential at connect time before storing it
  // (e.g. Zoho exchanges a short-lived grant token for a permanent refresh token,
  // so we never persist the grant token). Returning credentials replaces what is
  // stored; validate is then what `test` uses thereafter.
  onConnect?: (creds: Creds) => Promise<{ ok: boolean; credentials?: Creds; meta?: Record<string, unknown>; error?: string }>;
  // Optional: a consumption WRITE action (e.g. push an outreach sequence into a CRM).
  push?: (creds: Creds, payload: Record<string, unknown>) => Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }>;
  // Optional: a consumption READ action (e.g. list CRM contacts to target).
  fetch?: (creds: Creds, params: Record<string, unknown>) => Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }>;
}

// ─── Zoho helpers (Self Client OAuth) ─────────────────────────────────────────
// Token/DC/session helpers live in ../_shared/zoho.ts, shared with the
// send-scheduler and inbox-monitor functions. Send-mail is deliberately NOT a
// connector-proxy action — the browser never sends email (§9); only the
// scheduled send-scheduler dispatches sends after enforcing the invariants.

const PROVIDER_ADAPTERS: Record<string, Adapter> = {
  hubspot: {
    validate: async (creds) => {
      const key = String(creds?.apiKey ?? "").trim();
      if (!key) return { ok: false, error: "Missing HubSpot access token." };
      const res = await fetch("https://api.hubapi.com/account-info/v3/details", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401 || res.status === 403) return { ok: false, error: "Invalid HubSpot token (unauthorized)." };
      if (!res.ok) return { ok: false, error: `HubSpot rejected the token (${res.status}).` };
      const data = await res.json().catch(() => ({}));
      return { ok: true, meta: { portalId: data?.portalId ?? null, timeZone: data?.timeZone ?? null } };
    },
  },
  apollo: {
    validate: async (creds) => {
      const key = String(creds?.apiKey ?? "").trim();
      if (!key) return { ok: false, error: "Missing Apollo API key." };
      // As of Sep 2024 Apollo requires the key in the X-Api-Key header (not query/body).
      const res = await fetch("https://api.apollo.io/v1/auth/health", {
        headers: { "X-Api-Key": key, "Content-Type": "application/json", "Cache-Control": "no-cache" },
      });
      if (res.status === 401 || res.status === 403) return { ok: false, error: "Invalid Apollo API key (unauthorized)." };
      if (!res.ok) return { ok: false, error: `Apollo rejected the key (${res.status}).` };
      const data = await res.json().catch(() => ({}));
      const healthy = data?.healthy ?? data?.is_logged_in ?? true;
      if (healthy === false) return { ok: false, error: "Apollo API key is not active." };
      // Health passes for ANY key, but People Search (used for prospecting) 403s
      // scoped keys - probe it now so a scoped key is rejected here, not mid-search.
      // api_search costs no Apollo credits.
      const probe = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
        method: "POST",
        headers: { "X-Api-Key": key, "Content-Type": "application/json", "Cache-Control": "no-cache" },
        body: JSON.stringify({ person_titles: ["ceo"], page: 1, per_page: 1 }),
      });
      if (probe.status === 401 || probe.status === 403) {
        return { ok: false, error: "This Apollo key can't run People Search - it must be a MASTER key (scoped keys are rejected). Use your master key from Apollo → Settings → API keys." };
      }
      return { ok: true, meta: { healthy: true, master: probe.ok } };
    },
    // Prospecting: net-new People Search. Use the api_search endpoint (the plain
    // /search 403s on Basic plans). Search returns NO emails - enrichment is a
    // separate credit-based call - so email comes back empty here.
    fetch: async (creds, params) => {
      const key = String(creds?.apiKey ?? "").trim();
      if (!key) return { ok: false, error: "Missing Apollo API key." };
      const body: Record<string, unknown> = {
        page: Number(params?.page) || 1,
        per_page: Math.min(Number(params?.perPage) || 25, 100),
      };
      const titles = params?.titles;
      const locations = params?.locations;
      const seniorities = params?.seniorities;
      const employeeRanges = params?.employeeRanges;
      if (Array.isArray(titles) && titles.length) body.person_titles = titles;
      if (Array.isArray(locations) && locations.length) body.person_locations = locations;
      // Signal/trigger filters (cold-outreach "build the list on signals"):
      // seniority + company size sharpen the ICP beyond title alone.
      if (Array.isArray(seniorities) && seniorities.length) body.person_seniorities = seniorities;
      if (Array.isArray(employeeRanges) && employeeRanges.length) body.organization_num_employees_ranges = employeeRanges;
      // ABM: scope the People Search to specific companies (contacts AT a target
      // account) by domain. Apollo People Search takes newline-separated domains;
      // the Gemini validation pass downstream drops any off-account rows anyway,
      // so an imperfect scope degrades safely rather than returning junk.
      const organizationDomains = params?.organizationDomains;
      if (Array.isArray(organizationDomains) && organizationDomains.length) {
        body.q_organization_domains = organizationDomains.join("\n");
      }
      if (params?.keywords) body.q_keywords = String(params.keywords);
      const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
        method: "POST",
        headers: { "X-Api-Key": key, "Content-Type": "application/json", "Cache-Control": "no-cache" },
        body: JSON.stringify(body),
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "Apollo rejected the search (403) - People Search requires a MASTER key (scoped keys are rejected). Reconnect Apollo with your master key." };
      }
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) return { ok: false, error: `Apollo search failed (${res.status}).` };
      const d = data as {
        people?: Array<Record<string, unknown>>;
        contacts?: Array<Record<string, unknown>>;
        pagination?: { total_entries?: number };
        total_entries?: number;
      };
      const raw = d?.people ?? d?.contacts ?? [];
      const people = raw.map((p) => {
        const org = (p.organization ?? p.account ?? {}) as Record<string, unknown>;
        const email = String(p.email ?? "");
        return {
          externalId: String(p.id ?? ""),
          firstName: String(p.first_name ?? ""),
          lastName: String(p.last_name ?? ""),
          title: String(p.title ?? ""),
          company: String(org.name ?? p.organization_name ?? ""),
          linkedinUrl: String(p.linkedin_url ?? ""),
          location: [p.city, p.state, p.country].filter(Boolean).join(", "),
          email: email.includes("not_unlocked") ? "" : email,
          // Org firmographics Apollo already returns (previously discarded) -
          // real signal for ABM account enrichment + per-contact seniority.
          seniority: String(p.seniority ?? ""),
          employeeCount: typeof org.estimated_num_employees === "number" ? org.estimated_num_employees : null,
          industry: String(org.industry ?? ""),
          website: String(org.website_url ?? ""),
        };
      });
      return { ok: true, result: { people, total: d?.pagination?.total_entries ?? d?.total_entries ?? people.length } };
    },
  },
  zoho: {
    // Self Client: the user pastes client id/secret + a freshly generated grant
    // token (code) + data center. We exchange it ONCE for a permanent refresh
    // token and store only that (the grant token is short-lived + single-use).
    onConnect: async (creds) => {
      const dc = String(creds?.dc ?? "us").toLowerCase();
      const conf = ZOHO_DC[dc];
      if (!conf) return { ok: false, error: "Pick a valid Zoho data center." };
      const clientId = String(creds?.clientId ?? "").trim();
      const clientSecret = String(creds?.clientSecret ?? "").trim();
      const code = String(creds?.grantToken ?? "").trim();
      if (!clientId || !clientSecret || !code) {
        return { ok: false, error: "Client ID, client secret, and grant token are all required." };
      }
      // Self clients have no redirect URI, so redirect_uri is intentionally omitted.
      const { res, data } = await zohoToken(conf.accounts, {
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
      });
      const refreshToken = data?.refresh_token as string | undefined;
      if (!res.ok || data?.error || !refreshToken) {
        return {
          ok: false,
          error: `Zoho rejected the grant token${data?.error ? ` (${data.error})` : ""}. Grant tokens expire within minutes - generate a fresh one and connect right away.`,
        };
      }
      return {
        ok: true,
        credentials: { clientId, clientSecret, refreshToken, dc },
        meta: { dc, apiDomain: (data?.api_domain as string) || conf.api },
      };
    },
    // `test`: prove the stored refresh token still mints an access token.
    validate: async (creds) => {
      const at = await zohoAccessToken(creds);
      return at.ok ? { ok: true, meta: { dc: creds?.dc ?? "us" } } : { ok: false, error: at.error };
    },
    // `push`: upsert a Contact, then create one dated Task per sequence step,
    // each linked to the contact via Who_Id. Date math + step shaping happen on
    // the client; this stays a dumb writer.
    push: async (creds, payload) => {
      const at = await zohoAccessToken(creds);
      if (!at.ok || !at.token) return { ok: false, error: at.error || "Could not authenticate with Zoho." };
      const headers = { Authorization: `Zoho-oauthtoken ${at.token}`, "Content-Type": "application/json" };

      // Campaign attribution stamp (measurement): the client passes the campaign's
      // utm as `campaignTag`; we write it into each record's Description so the
      // Measurement module can attribute CRM records back per campaign.
      const tag = String((payload as { campaignTag?: unknown })?.campaignTag ?? "").trim().slice(0, 200);

      // Prospecting path: create Zoho Leads from Apollo prospects (Company +
      // Last_Name are the only mandatory Lead fields). Distinct from the outreach
      // sequence path below (contact + dated tasks).
      if (Array.isArray((payload as { prospects?: unknown })?.prospects)) {
        const prospects = (payload as { prospects: Array<Record<string, string>> }).prospects;
        const records = prospects.slice(0, 100).map((p) => {
          const rec: Record<string, unknown> = {
            Last_Name: (p.lastName || p.firstName || p.email || "Prospect").trim().slice(0, 120),
            Company: (p.company || "Unknown").trim().slice(0, 200),
            Lead_Source: "Apollo",
          };
          if (p.firstName) rec.First_Name = p.firstName.trim();
          if (p.email) rec.Email = p.email.trim();
          if (p.title) rec.Designation = p.title.trim().slice(0, 100);
          if (tag) rec.Description = tag;
          return rec;
        });
        if (!records.length) return { ok: false, error: "No prospects to push." };
        const leadRes = await fetch(`${at.api}/crm/v7/Leads`, { method: "POST", headers, body: JSON.stringify({ data: records }) });
        const leadData = await leadRes.json().catch(() => ({} as Record<string, unknown>));
        const leadRows = ((leadData as { data?: Array<Record<string, unknown>> })?.data) ?? [];
        const leadsCreated = leadRows.filter((r) => r?.status === "success").length;
        if (!leadRes.ok || leadsCreated === 0) {
          const msg = leadRows[0]?.message as string | undefined;
          return { ok: false, error: `Zoho lead creation failed${msg ? `: ${msg}` : ` (${leadRes.status})`}.` };
        }
        return { ok: true, result: { leadsCreated } };
      }

      const contact = (payload?.contact ?? {}) as Record<string, string>;
      const email = String(contact.email ?? "").trim();
      const lastName =
        String(contact.lastName ?? "").trim() ||
        String(contact.firstName ?? "").trim() ||
        (email ? email.split("@")[0] : "");
      if (!lastName) return { ok: false, error: "A recipient last name or email is required." };

      const record: Record<string, unknown> = { Last_Name: lastName };
      if (contact.firstName) record.First_Name = String(contact.firstName).trim();
      if (email) record.Email = email;
      if (tag) record.Description = tag;

      const upsertRes = await fetch(`${at.api}/crm/v7/Contacts/upsert`, {
        method: "POST",
        headers,
        body: JSON.stringify({ data: [record], ...(email ? { duplicate_check_fields: ["Email"] } : {}) }),
      });
      const upsertData = await upsertRes.json().catch(() => ({} as Record<string, unknown>));
      const rec = (upsertData?.data as Array<Record<string, unknown>> | undefined)?.[0];
      const details = rec?.details as Record<string, unknown> | undefined;
      const contactId = details?.id as string | undefined;
      if (!upsertRes.ok || rec?.status !== "success" || !contactId) {
        return { ok: false, error: `Zoho contact upsert failed${rec?.message ? `: ${rec.message}` : ` (${upsertRes.status})`}.` };
      }

      const steps = Array.isArray(payload?.steps) ? (payload.steps as Array<Record<string, unknown>>) : [];
      const tasks = steps
        .map((s) => ({
          Subject: String(s?.subject ?? "").trim().slice(0, 255) || "Outreach step",
          Due_Date: String(s?.dueDate ?? "").trim(),
          Description: String(s?.description ?? "").slice(0, 32000),
          Status: "Not Started",
          Who_Id: { id: contactId },
        }))
        .filter((t) => t.Due_Date);

      let tasksCreated = 0;
      if (tasks.length) {
        const taskRes = await fetch(`${at.api}/crm/v7/Tasks`, {
          method: "POST",
          headers,
          body: JSON.stringify({ data: tasks }),
        });
        const taskData = await taskRes.json().catch(() => ({} as Record<string, unknown>));
        const rows = (taskData?.data as Array<Record<string, unknown>> | undefined) ?? [];
        tasksCreated = rows.filter((r) => r?.status === "success").length;
        if (!taskRes.ok || tasksCreated === 0) {
          const firstMsg = rows[0]?.message as string | undefined;
          return { ok: false, error: `Contact saved, but creating tasks failed${firstMsg ? `: ${firstMsg}` : ` (${taskRes.status})`}.` };
        }
      }
      return { ok: true, result: { contactId, tasksCreated } };
    },
    // Two read modes (v7 requires an explicit fields list; Zoho returns 204 when
    // empty): default lists Contacts (to target a sequence); 'attribution' pulls
    // recent Leads + Contacts Descriptions so measurement can count CRM records
    // stamped with a campaign's utm on push.
    fetch: async (creds, params) => {
      const at = await zohoAccessToken(creds);
      if (!at.ok || !at.token) return { ok: false, error: at.error || "Could not authenticate with Zoho." };
      const authHeaders = { Authorization: `Zoho-oauthtoken ${at.token}` };

      if (String(params?.resource ?? "") === "attribution") {
        const descOf = async (module: string) => {
          const r = await fetch(
            `${at.api}/crm/v7/${module}?fields=Description&per_page=200&sort_by=Modified_Time&sort_order=desc`,
            { headers: authHeaders },
          );
          if (r.status === 204) return [];
          const d = await r.json().catch(() => ({} as Record<string, unknown>));
          if (!r.ok) return [];
          return ((d as { data?: Array<Record<string, string>> })?.data ?? [])
            .map((x) => ({ description: String(x.Description ?? "") }))
            .filter((x) => x.description);
        };
        const [leads, contacts] = await Promise.all([descOf("Leads"), descOf("Contacts")]);
        return { ok: true, result: { records: [...leads, ...contacts] } };
      }

      const res = await fetch(
        `${at.api}/crm/v7/Contacts?fields=First_Name,Last_Name,Email&per_page=50&sort_by=Modified_Time&sort_order=desc`,
        { headers: authHeaders },
      );
      if (res.status === 204) return { ok: true, result: { items: [] } };
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) return { ok: false, error: (data as { message?: string })?.message || `Zoho fetch failed (${res.status}).` };
      const items = ((data as { data?: Array<Record<string, string>> })?.data ?? []).map((c) => ({
        id: c.id, firstName: c.First_Name ?? "", lastName: c.Last_Name ?? "", email: c.Email ?? "",
      }));
      return { ok: true, result: { items } };
    },
  },
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
  const provider = String(body.provider ?? "");
  const workspaceId = String(body.workspaceId ?? "");
  if (!provider) return fail("provider is required", 400, base);
  if (!workspaceId) return fail("workspaceId is required", 400, base);

  const svc = svcClient(cfg);
  if (!(await isMember(svc, workspaceId, userId))) return fail("Not a member of this workspace", 403, base);

  try {
    if (action === "connect") {
      const adapter = PROVIDER_ADAPTERS[provider];
      if (!adapter) return fail(`Connector "${provider}" is not available yet.`, 400, base);
      const pasted = (body.credentials ?? {}) as Creds;
      // onConnect adapters (Zoho) transform+validate the credential and hand back
      // what to store; the rest validate-and-store the pasted credential as-is.
      let toStore: Creds = pasted;
      let meta: Record<string, unknown> = {};
      if (adapter.onConnect) {
        const r = await adapter.onConnect(pasted);
        if (!r.ok) return fail(r.error || "Could not connect.", 400, base);
        toStore = r.credentials ?? pasted;
        meta = r.meta ?? {};
      } else {
        const r = await adapter.validate(pasted);
        if (!r.ok) return fail(r.error || "Could not validate the credential.", 400, base);
        meta = r.meta ?? {};
      }
      const { error } = await svc.from("workspace_integrations").upsert({
        workspace_id: workspaceId,
        provider,
        credentials: toStore,
        status: "connected",
        meta: { authType: adapter.onConnect ? "oauth" : "apiKey", ...meta },
        last_error: "",
        last_sync_at: new Date().toISOString(),
      }, { onConflict: "workspace_id,provider" });
      if (error) throw error;
      return json({ ok: true, meta }, 200, base);
    }

    if (action === "push") {
      const adapter = PROVIDER_ADAPTERS[provider];
      if (!adapter?.push) return fail(`Connector "${provider}" does not support push.`, 400, base);
      const { data: row } = await svc.from("workspace_integrations")
        .select("credentials").eq("workspace_id", workspaceId).eq("provider", provider).maybeSingle();
      if (!row?.credentials) return fail("Not connected", 400, base);
      const result = await adapter.push(row.credentials as Creds, (body.payload ?? {}) as Record<string, unknown>);
      if (!result.ok) {
        await svc.from("workspace_integrations")
          .update({ last_error: result.error ?? "Push failed" })
          .eq("workspace_id", workspaceId).eq("provider", provider);
        return fail(result.error || "Push failed.", 400, base);
      }
      await svc.from("workspace_integrations")
        .update({ last_error: "", last_sync_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId).eq("provider", provider);
      return json({ ok: true, result: result.result ?? {} }, 200, base);
    }

    if (action === "fetch") {
      const adapter = PROVIDER_ADAPTERS[provider];
      if (!adapter?.fetch) return fail(`Connector "${provider}" does not support fetch.`, 400, base);
      const { data: row } = await svc.from("workspace_integrations")
        .select("credentials").eq("workspace_id", workspaceId).eq("provider", provider).maybeSingle();
      if (!row?.credentials) return fail("Not connected", 400, base);
      const result = await adapter.fetch(row.credentials as Creds, (body.params ?? {}) as Record<string, unknown>);
      if (!result.ok) return fail(result.error || "Fetch failed.", 400, base);
      return json({ ok: true, result: result.result ?? {} }, 200, base);
    }

    if (action === "test") {
      const adapter = PROVIDER_ADAPTERS[provider];
      if (!adapter) return fail(`Connector "${provider}" is not available yet.`, 400, base);
      const { data: row } = await svc.from("workspace_integrations")
        .select("credentials").eq("workspace_id", workspaceId).eq("provider", provider).maybeSingle();
      if (!row?.credentials) return fail("Not connected", 400, base);
      const result = await adapter.validate(row.credentials as Creds);
      await svc.from("workspace_integrations")
        .update({ status: result.ok ? "connected" : "invalid", last_error: result.ok ? "" : (result.error ?? "") })
        .eq("workspace_id", workspaceId).eq("provider", provider);
      return json({ ok: result.ok, error: result.error }, 200, base);
    }

    if (action === "disconnect") {
      const { error } = await svc.from("workspace_integrations")
        .delete().eq("workspace_id", workspaceId).eq("provider", provider);
      if (error) throw error;
      return json({ ok: true }, 200, base);
    }

    return fail(`Unknown action: ${action}`, 400, base);
  } catch (e) {
    return fail((e as Error).message ?? "Connector request failed", 502, base);
  }
});
