// meta-callbacks — Meta (Facebook/Instagram) server-to-server callbacks.
//
// Meta calls these DIRECTLY (no Supabase JWT), so this function runs with
// verify_jwt = false and authenticates each request by verifying Meta's
// `signed_request` HMAC with the app secret. Three routes:
//
//   POST /meta-callbacks               → Data Deletion Callback (record + delete)
//   POST /meta-callbacks/deauthorize   → Deauthorize Callback (revoke on app removal)
//   GET  /meta-callbacks/status?code=  → public status lookup for /data-deletion
//
// Required by Meta App Review. See memory [[app-review-requirements]].

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const enc = new TextEncoder();

// ─── CORS (only the GET status route is browser-facing) ───────────────────────
const parseOriginList = (raw: string | undefined): string[] =>
  (raw ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
const ORIGINS = [
  ...parseOriginList(Deno.env.get("ALLOWED_ORIGINS")),
  ...parseOriginList(Deno.env.get("APP_URL")),
];
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const isLocal = (o: string) => { try { return LOCAL.has(new URL(o).hostname); } catch { return false; } };
const corsHeaders = (origin: string): Record<string, string> => {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
  if (origin && (isLocal(origin) || ORIGINS.includes(origin.replace(/\/$/, "")))) {
    h["Access-Control-Allow-Origin"] = origin;
  } else if (ORIGINS.length) {
    h["Access-Control-Allow-Origin"] = ORIGINS[0];
  }
  return h;
};
const json = (payload: unknown, status: number, base: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { ...base, "Content-Type": "application/json" } });

const appBase = (): string => ORIGINS[0] ?? "";

// ─── signed_request verification (Meta HMAC-SHA256, base64url) ─────────────────
const b64urlToBytes = (s: string): Uint8Array => {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

interface SignedPayload { user_id?: string; algorithm?: string; issued_at?: number; }

const verifySignedRequest = async (signed: string, secret: string): Promise<SignedPayload | null> => {
  const dot = signed.indexOf(".");
  if (dot < 0) return null;
  const encodedSig = signed.slice(0, dot);
  const encodedPayload = signed.slice(dot + 1);
  try {
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(encodedSig), enc.encode(encodedPayload));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(encodedPayload)));
    if (payload?.algorithm && String(payload.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
    return payload as SignedPayload;
  } catch { return null; }
};

// ─── Supabase (service role) ──────────────────────────────────────────────────
const svc = () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("meta-callbacks not configured: missing SUPABASE_URL / service role key");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

// Delete every stored trace of a Meta app-scoped user. Forward-compatible: once
// Meta publishing stores the ASID on the integration row (meta.metaUserId), this
// removes it; today it typically matches nothing, which is correct.
const purgeMetaUser = async (db: ReturnType<typeof svc>, asid: string): Promise<void> => {
  if (!asid) return;
  await db.from("workspace_integrations")
    .delete()
    .like("provider", "meta%")
    .eq("meta->>metaUserId", asid);
};

const readSignedRequest = async (req: Request): Promise<string | null> => {
  const body = await req.text();
  const form = new URLSearchParams(body);
  return form.get("signed_request");
};

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const route = path.endsWith("/deauthorize") ? "deauthorize"
    : path.endsWith("/status") ? "status"
    : "data-deletion";

  const secret = Deno.env.get("META_OAUTH_CLIENT_SECRET");

  try {
    // Public status lookup for the /data-deletion page.
    if (route === "status") {
      const code = new URL(req.url).searchParams.get("code")?.trim();
      if (!code) return json({ error: "Missing code" }, 400, cors);
      const db = svc();
      const { data } = await db.from("data_deletion_requests")
        .select("code, status").eq("code", code).maybeSingle();
      if (!data) return json({ error: "Not found" }, 404, cors);
      return json({ code: data.code, status: data.status }, 200, cors);
    }

    // Both callbacks require a valid Meta signed_request.
    if (!secret) return json({ error: "Not configured" }, 500);
    const signed = await readSignedRequest(req);
    if (!signed) return json({ error: "Missing signed_request" }, 400);
    const payload = await verifySignedRequest(signed, secret);
    if (!payload?.user_id) return json({ error: "Invalid signed_request" }, 400);

    const db = svc();

    if (route === "deauthorize") {
      // User removed the app: revoke by deleting their stored Meta credentials.
      await purgeMetaUser(db, payload.user_id);
      return json({ ok: true }, 200);
    }

    // Data deletion: record, purge, confirm.
    const code = crypto.randomUUID().replace(/-/g, "");
    await db.from("data_deletion_requests").insert({
      code, provider: "meta", external_user_id: payload.user_id, status: "pending",
    });
    await purgeMetaUser(db, payload.user_id);
    await db.from("data_deletion_requests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("code", code);

    // Meta expects exactly this shape.
    return json({ url: `${appBase()}/data-deletion?code=${code}`, confirmation_code: code }, 200);
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "callback error" }, 500, cors);
  }
});
