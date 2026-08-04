// visibility-scanner (WS6) — the measurement moat. Asks each AI answer engine a
// buyer prompt and returns the answer + citations, so visibilityService can detect
// whether THIS brand is mentioned/cited and compute share-of-voice. Platform-global
// secrets (like the Vertex service account); each surface is independent — an
// unconfigured or failing surface returns not_configured/error and never sinks the
// others. NEVER fabricates an answer: no key ⇒ no data (honest), not a mock.
//
// Called per-surface with a batch of prompts (bounded concurrency) to balance
// round-trips against edge wall-clock. verify_jwt=true (browser-callable via
// visibilityService); needs a valid session, no workspace data is read here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runActorSync } from "../_shared/apify.ts";

// ─── CORS + helpers (mirror connector-proxy) ──────────────────────────────────
const parseOriginList = (raw: string | undefined): string[] =>
  (raw ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
const PRODUCTION_ALLOWLIST = [...parseOriginList(Deno.env.get("ALLOWED_ORIGINS")), ...parseOriginList(Deno.env.get("APP_URL"))];
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const isLocalOrigin = (origin: string): boolean => {
  try { return LOCAL_HOSTNAMES.has(new URL(origin).hostname); } catch { return false; }
};
const isAllowedOrigin = (origin: string): boolean =>
  Boolean(origin) && (isLocalOrigin(origin) || PRODUCTION_ALLOWLIST.includes(origin.replace(/\/$/, "")));
const corsHeaders = (origin: string): Record<string, string> => {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (isAllowedOrigin(origin)) h["Access-Control-Allow-Origin"] = origin;
  else if (PRODUCTION_ALLOWLIST.length > 0) h["Access-Control-Allow-Origin"] = PRODUCTION_ALLOWLIST[0];
  return h;
};
const json = (payload: unknown, status: number, base: Record<string, string>) =>
  new Response(JSON.stringify(payload), { status, headers: { ...base, "Content-Type": "application/json" } });
const fail = (message: string, status: number, base: Record<string, string>) => json({ error: { message } }, status, base);

const env = (k: string) => (Deno.env.get(k) ?? "").trim();

const getUserId = async (req: Request): Promise<string | null> => {
  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!supabaseUrl || !anonKey || !token) return null;
  const sb = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try { const { data, error } = await sb.auth.getUser(token); return error || !data?.user ? null : data.user.id; }
  catch { return null; }
};

interface SurfaceResult { answer: string; citations: string[]; }

// ─── Providers (each returns null when its key is absent → not_configured) ─────
const askPerplexity = async (prompt: string): Promise<SurfaceResult | null> => {
  const key = env("PERPLEXITY_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Perplexity request failed (${res.status})`);
  return {
    answer: String(data?.choices?.[0]?.message?.content ?? ""),
    citations: Array.isArray(data?.citations) ? data.citations.map(String) : [],
  };
};

const askOpenAI = async (prompt: string): Promise<SurfaceResult | null> => {
  const key = env("OPENAI_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-search-preview", web_search_options: {}, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI request failed (${res.status})`);
  const msg = data?.choices?.[0]?.message ?? {};
  const annotations = Array.isArray(msg?.annotations) ? msg.annotations : [];
  return {
    answer: String(msg?.content ?? ""),
    citations: annotations.map((a: { url_citation?: { url?: string } }) => a?.url_citation?.url).filter(Boolean).map(String),
  };
};

const askAnthropic = async (prompt: string): Promise<SurfaceResult | null> => {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic request failed (${res.status})`);
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const answer = blocks.filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b?.text ?? "").join(" ").trim();
  const citations: string[] = [];
  for (const b of blocks) {
    const bb = b as { citations?: Array<{ url?: string }>; type?: string; content?: Array<{ url?: string }> };
    if (Array.isArray(bb?.citations)) for (const c of bb.citations) if (c?.url) citations.push(String(c.url));
    if (bb?.type === "web_search_tool_result" && Array.isArray(bb?.content)) for (const r of bb.content) if (r?.url) citations.push(String(r.url));
  }
  return { answer, citations: [...new Set(citations)] };
};

// Google AI Overviews — no API; scraped via Apify. Best-effort: returns the AI
// overview if the actor surfaces one, otherwise an honest empty (no fabrication).
const askGoogleAio = async (prompt: string): Promise<SurfaceResult | null> => {
  if (!env("APIFY_TOKEN")) return null;
  const items = await runActorSync("apify~google-search-scraper", { queries: prompt, maxPagesPerQuery: 1, resultsPerPage: 5, saveHtml: false });
  for (const it of items) {
    const aio = (it as { aiOverview?: unknown; ai_overview?: unknown })?.aiOverview ?? (it as { ai_overview?: unknown })?.ai_overview;
    if (!aio) continue;
    const o = aio as { content?: string; text?: string; sources?: Array<{ url?: string }> };
    const text = typeof aio === "string" ? aio : (o?.content ?? o?.text ?? "");
    if (text) return { answer: String(text), citations: Array.isArray(o?.sources) ? o.sources.map((s) => s?.url).filter(Boolean).map(String) : [] };
  }
  return { answer: "", citations: [] };
};

const SURFACE_FNS: Record<string, (prompt: string) => Promise<SurfaceResult | null>> = {
  "perplexity": askPerplexity,
  "openai": askOpenAI,
  "anthropic": askAnthropic,
  "google-aio": askGoogleAio,
};

// Bounded-concurrency map so a batch of prompts doesn't fire all at once.
const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
};

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const base = corsHeaders(req.headers.get("Origin") ?? "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: base });
  if (req.method !== "POST") return fail("Method not allowed", 405, base);

  const userId = await getUserId(req);
  if (!userId) return fail("Unauthorized", 401, base);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("Invalid JSON body", 400, base); }

  const surface = String(body.surface ?? "");
  const fn = SURFACE_FNS[surface];
  if (!fn) return fail(`Unknown surface: ${surface}`, 400, base);
  const prompts = Array.isArray(body.prompts) ? (body.prompts as unknown[]).map(String).filter(Boolean).slice(0, 40) : [];
  if (!prompts.length) return fail("prompts is required", 400, base);

  const results = await mapLimit(prompts, 4, async (prompt) => {
    try {
      const r = await fn(prompt);
      if (r == null) return { prompt, ok: false, error: "not_configured", answer: "", citations: [] as string[] };
      return { prompt, ok: true, answer: r.answer, citations: r.citations, error: "" };
    } catch (e) {
      return { prompt, ok: false, error: (e as Error).message, answer: "", citations: [] as string[] };
    }
  });

  return json({ ok: true, surface, results }, 200, base);
});
