// KEPLER OS - AI proxy Edge Function (Vertex AI)
//
// Forwards chat-completion requests to Google Vertex AI using a service-account
// JWT exchange. The service-account key lives only as a server-side secret
// (VERTEX_SERVICE_ACCOUNT) - never in the client bundle.
//
// Required secrets:
//   VERTEX_SERVICE_ACCOUNT  - service-account JSON key, as raw JSON OR base64-encoded JSON
//   VERTEX_AI_LOCATION      - GCP region, e.g. "us-central1"
//   VERTEX_AI_MODEL_ID      - Vertex model slug, e.g. "gemini-2.5-flash"
//
// Deploy:  supabase functions deploy ai-proxy
// Secrets: supabase secrets set VERTEX_SERVICE_ACCOUNT="$(cat sa.json)"
//          supabase secrets set VERTEX_AI_LOCATION=us-central1
//          supabase secrets set VERTEX_AI_MODEL_ID=gemini-2.5-flash
//
// Access control:
//   • CORS gates which browser origins may call the function.
//   • Auth gates who may call it: the Authorization bearer token is verified
//     server-side via Supabase Auth and must resolve to a real user.
//   • Rate limiting gates how fast each user may call the proxy (fixed window).
//   • Vertex credentials are read only from Deno.env - never returned to callers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Vertex config - validated once at module load ────────────────────────────
//
// If any required env var is missing or malformed, the module throws here and
// every subsequent request returns 500. This surfaces immediately in
// `supabase functions serve` logs so misconfiguration is diagnosed at startup,
// not buried in per-request errors.

// CRITICAL: module-scope code must NEVER throw. A top-level throw crashes the
// Deno worker on cold start, which makes EVERY request - including the CORS
// OPTIONS preflight - fail with an opaque platform-level WORKER_ERROR (HTTP 500)
// that carries no CORS headers and never reaches our handler. By loading and
// validating Vertex config lazily inside the request handler instead, a missing
// or malformed secret surfaces as a clean JSON 500 with CORS headers, and the
// preflight always succeeds regardless of provider configuration.

interface VertexConfig {
  location: string;
  modelId: string;
  projectId: string;
  clientEmail: string;
  privateKey: string;
  endpoint: string;
}

// Memoized after the first successful load. A failed load throws (and does not
// cache) so a later secrets fix is picked up without a redeploy.
let cachedConfig: VertexConfig | null = null;

const loadVertexConfig = (): VertexConfig => {
  if (cachedConfig) return cachedConfig;

  const location = Deno.env.get("VERTEX_AI_LOCATION")?.trim();
  if (!location) throw new Error("VERTEX_AI_LOCATION env var is not set");

  const modelId = Deno.env.get("VERTEX_AI_MODEL_ID")?.trim();
  if (!modelId) throw new Error("VERTEX_AI_MODEL_ID env var is not set");

  const raw = Deno.env.get("VERTEX_SERVICE_ACCOUNT");
  if (!raw) throw new Error("VERTEX_SERVICE_ACCOUNT env var is not set");

  // Accept the secret as raw JSON or base64-encoded JSON so deploys work
  // regardless of how the key was stored. Only if both fail is it malformed.
  let sa: Record<string, unknown>;
  try {
    sa = JSON.parse(raw);
  } catch {
    try {
      sa = JSON.parse(atob(raw.trim()));
    } catch {
      throw new Error(
        "VERTEX_SERVICE_ACCOUNT is neither raw JSON nor base64-encoded JSON",
      );
    }
  }

  // Minimum fields required to sign a service-account JWT and build the URL.
  const missing = ["project_id", "client_email", "private_key"].filter((k) => !sa[k]);
  if (missing.length > 0) {
    throw new Error(`VERTEX_SERVICE_ACCOUNT JSON is missing: ${missing.join(", ")}`);
  }

  // Normalize escaped newlines so the PEM is valid regardless of how the secret
  // was stored (some tooling persists private_key with literal "\n" sequences).
  const privateKey = (sa.private_key as string).replace(/\\n/g, "\n");
  const projectId = sa.project_id as string;

  cachedConfig = {
    location,
    modelId,
    projectId,
    clientEmail: sa.client_email as string,
    privateKey,
    endpoint:
      `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
      `/locations/${location}/publishers/google/models/${modelId}:generateContent`,
  };
  return cachedConfig;
};

// LOCAL SMOKE TEST ONLY: when set to "true", requests with NO Authorization
// header bypass user auth (and the auth-dependent rate limiter) so local curl
// can exercise the Vertex path end to end. Never set this in production.
const ALLOW_LOCAL_UNAUTH = Deno.env.get("ALLOW_LOCAL_UNAUTH") === "true";

// LOCAL DEBUG ONLY: when "true", emit extra structured logs about request-path
// decisions (auth mode, selected model, upstream status). Deliberately never
// logs bearer tokens, service-account secrets, or full message payloads.
const AI_PROXY_DEBUG = Deno.env.get("AI_PROXY_DEBUG") === "true";
const debugLog = (evt: string, fields: Record<string, unknown> = {}): void => {
  if (!AI_PROXY_DEBUG) return;
  console.log(JSON.stringify({ evt: `ai-proxy.debug.${evt}`, ...fields }));
};

// ─── Cost-control limits (unchanged from prior implementation) ─────────────────

const RATE_LIMIT_MAX_REQUESTS = 15;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_MAX_TOKENS = 1024;
// 8192 gives structured-JSON generations (keyword sets, business details, blog
// drafts) enough room to finish without truncating mid-object - truncation was a
// recurring cause of "malformed JSON". Still bounds per-request cost.
const MAX_TOKENS_CEILING = 8192;
const MAX_MESSAGES = 20;
const MAX_TOTAL_CONTENT_CHARS = 60_000;

const totalMessageContentChars = (messages: unknown[]): number => {
  let total = 0;
  for (const m of messages) {
    const content = (m as { content?: unknown })?.content;
    if (typeof content === "string") {
      total += content.length;
    } else if (content != null) {
      total += JSON.stringify(content).length;
    }
  }
  return total;
};

const clampMaxTokens = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_TOKENS;
  }
  return Math.min(Math.floor(value), MAX_TOKENS_CEILING);
};

// ─── Origin / CORS policy (unchanged) ─────────────────────────────────────────

const parseOriginList = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

const PRODUCTION_ALLOWLIST = [
  ...parseOriginList(Deno.env.get("ALLOWED_ORIGINS")),
  ...parseOriginList(Deno.env.get("APP_URL")),
];

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const isLocalOrigin = (origin: string): boolean => {
  try {
    const { hostname } = new URL(origin);
    return LOCAL_HOSTNAMES.has(hostname);
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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (PRODUCTION_ALLOWLIST.length > 0) {
    headers["Access-Control-Allow-Origin"] = PRODUCTION_ALLOWLIST[0];
  }
  return headers;
};

const json = (
  payload: unknown,
  status: number,
  baseHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...baseHeaders, "Content-Type": "application/json" },
  });

// ─── Authentication (unchanged) ───────────────────────────────────────────────

const getAuthenticatedUser = async (
  req: Request,
): Promise<{ userId: string | null; reason: string | null }> => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { userId: null, reason: "missing_bearer_token" };

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return { userId: null, reason: "auth_not_configured" };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return { userId: null, reason: "invalid_token" };
    return { userId: data.user.id, reason: null };
  } catch {
    return { userId: null, reason: "auth_lookup_failed" };
  }
};

const getAuthedDbClient = (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase env is not configured");
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: req.headers.get("Authorization") ?? "" },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const takeRateLimitSlot = async (req: Request) => {
  const db = getAuthedDbClient(req);
  const { data, error } = await db
    .rpc("ai_proxy_rate_limit_take", {
      p_limit: RATE_LIMIT_MAX_REQUESTS,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    })
    .single();
  if (error) throw error;
  return {
    allowed: Boolean(data?.allowed),
    currentCount: Number(data?.current_count ?? 0),
    retryAfterSeconds: Number(data?.retry_after_seconds ?? 0),
  };
};

// ─── Google OAuth2 access-token acquisition ───────────────────────────────────
//
// Vertex AI requires a short-lived OAuth2 bearer token, not a static API key.
// We obtain it by signing a JWT with the service-account private key and
// exchanging it at the Google token endpoint.
//
// Token caching: module-level variables survive across warm invocations within
// the same Deno isolate, eliminating the extra Google OAuth round-trip on every
// request. The 60-second buffer before expiry prevents using a token that
// expires while a Vertex request is in-flight. Tokens are re-acquired on cold
// starts (new isolate = cleared module state).

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

// Encodes a string or ArrayBuffer as base64url (no padding).
const encodeBase64Url = (input: string | ArrayBuffer): string => {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
};

// Converts a PEM PKCS#8 private key to a raw DER ArrayBuffer for Web Crypto.
// JSON.parse already decoded the \n escape sequences, so the PEM string
// contains real newlines that we strip along with the armor headers.
const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

// Signs a Google service-account JWT (RS256) using the Web Crypto API.
const signServiceAccountJwt = async (
  clientEmail: string,
  privateKeyPem: string,
): Promise<string> => {
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claims = encodeBase64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const signingInput = `${header}.${claims}`;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${encodeBase64Url(signature)}`;
};

// Exchanges a signed JWT for a Google OAuth2 access token.
const fetchNewAccessToken = async (cfg: VertexConfig): Promise<string> => {
  const jwt = await signServiceAccountJwt(cfg.clientEmail, cfg.privateKey);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Google token exchange failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }

  const data = await res.json();
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("Google token response missing access_token");
  }

  return data.access_token;
};

// Returns a valid access token, re-acquiring only when the cached one is within
// 60 seconds of expiry or absent.
const getAccessToken = async (cfg: VertexConfig): Promise<string> => {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  cachedToken = await fetchNewAccessToken(cfg);
  tokenExpiresAt = Date.now() + 3_600_000; // tokens are valid for 1 hour
  return cachedToken;
};

// ─── OpenAI-style → Vertex request translation ────────────────────────────────

interface VertexPart {
  text: string;
}
interface VertexContent {
  role: "user" | "model";
  parts: VertexPart[];
}
interface TranslateResult {
  contents: VertexContent[];
  systemInstruction: { parts: VertexPart[] } | null;
}

// Splits a messages[] array into Vertex contents[] and an optional
// systemInstruction block. Key differences from OpenAI format:
//   • role "system" is not valid in Vertex contents[]; it moves to the
//     top-level systemInstruction field.
//   • role "assistant" becomes "model" in Vertex terminology.
//   • Multiple system messages are joined so the model sees one coherent block.
const translateMessages = (messages: unknown[]): TranslateResult => {
  const systemTexts: string[] = [];
  const contents: VertexContent[] = [];

  for (const m of messages) {
    const msg = m as { role?: string; content?: unknown };
    const role = String(msg.role ?? "");
    const text = typeof msg.content === "string"
      ? msg.content
      : JSON.stringify(msg.content ?? "");

    if (role === "system") {
      systemTexts.push(text);
    } else {
      contents.push({
        role: role === "assistant" ? "model" : "user",
        parts: [{ text }],
      });
    }
  }

  return {
    contents,
    systemInstruction: systemTexts.length > 0
      ? { parts: [{ text: systemTexts.join("\n\n") }] }
      : null,
  };
};

// Pull visible model text from a Vertex candidate. Gemini 2.5+ may emit multiple
// parts (thought + answer); reading only parts[0] misses the JSON answer.
type VertexResponsePart = { text?: string; thought?: boolean };

const extractCandidateText = (
  vertexData: unknown,
): {
  text: string | null;
  finishReason: string | null;
  partsCount: number;
  partTextLengths: number[];
  thoughtPartCount: number;
  thoughtsTokenCount: number | null;
} => {
  const candidate = (vertexData as {
    candidates?: Array<{
      content?: { parts?: VertexResponsePart[] };
      finishReason?: string;
    }>;
    usageMetadata?: { thoughtsTokenCount?: number };
  })?.candidates?.[0];

  const parts = candidate?.content?.parts ?? [];
  const finishReason = candidate?.finishReason ?? null;
  const partTextLengths = parts.map((p) =>
    typeof p.text === "string" ? p.text.length : 0
  );
  const thoughtPartCount = parts.filter((p) => p.thought === true).length;
  const thoughtsTokenCount =
    (vertexData as { usageMetadata?: { thoughtsTokenCount?: number } })
      ?.usageMetadata?.thoughtsTokenCount ?? null;

  const nonThoughtTexts = parts
    .filter((p) => p.thought !== true)
    .map((p) => p.text)
    .filter((t): t is string => typeof t === "string" && t.length > 0);

  const fallbackTexts = parts
    .map((p) => p.text)
    .filter((t): t is string => typeof t === "string" && t.length > 0);

  const joined = (nonThoughtTexts.length > 0 ? nonThoughtTexts : fallbackTexts)
    .join("");

  return {
    text: joined.length > 0 ? joined : null,
    finishReason,
    partsCount: parts.length,
    partTextLengths,
    thoughtPartCount,
    thoughtsTokenCount,
  };
};

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers });

  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed" } }, 405, headers);
  }

  // Local smoke-test bypass: only when ALLOW_LOCAL_UNAUTH=true AND no bearer
  // token is present. Production (token present, or flag unset) is unchanged.
  const localBypass = ALLOW_LOCAL_UNAUTH && !req.headers.get("Authorization");

  let userId: string | null;
  if (localBypass) {
    // Minimal fake local user for downstream logging/logic only.
    userId = "local-dev-user";
    console.warn(JSON.stringify({ evt: "ai-proxy.local_unauth_bypass" }));
  } else {
    // Require an authenticated Supabase user before doing anything else.
    const auth = await getAuthenticatedUser(req);
    userId = auth.userId;
    if (!userId) {
      console.warn(JSON.stringify({ evt: "ai-proxy.unauthorized", reason: auth.reason }));
      return json({ error: { message: "Unauthorized" } }, 401, headers);
    }
  }

  debugLog("auth", { authMode: localBypass ? "local_bypass" : "authenticated", userId });

  // Per-user fixed-window rate limiter. The local bypass skips it because the
  // limiter relies on an authenticated (RLS) DB context that does not exist
  // without a bearer token. Production path is unchanged.
  let rate;
  if (localBypass) {
    rate = { allowed: true, currentCount: 0, retryAfterSeconds: 0 };
  } else {
    try {
      rate = await takeRateLimitSlot(req);
    } catch (err) {
      console.error(
        JSON.stringify({
          evt: "ai-proxy.rate_limit_check_failed",
          userId,
          error: (err as Error).message,
        }),
      );
      return json(
        {
          error: {
            message: "Rate limit check unavailable. Please retry shortly.",
          },
        },
        503,
        headers,
      );
    }
  }

  if (!rate.allowed) {
    console.warn(
      JSON.stringify({
        evt: "ai-proxy.rate_limited",
        userId,
        limit: RATE_LIMIT_MAX_REQUESTS,
        windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
        currentCount: rate.currentCount,
        retryAfterSeconds: rate.retryAfterSeconds,
      }),
    );
    return json(
      {
        error: {
          message:
            `Rate limit exceeded. Max ${RATE_LIMIT_MAX_REQUESTS} requests per ${RATE_LIMIT_WINDOW_SECONDS}s.`,
          code: "rate_limited",
          retryAfterSeconds: rate.retryAfterSeconds,
        },
      },
      429,
      {
        ...headers,
        "Retry-After": String(
          rate.retryAfterSeconds || RATE_LIMIT_WINDOW_SECONDS,
        ),
      },
    );
  }

  // Load Vertex config lazily. A missing/malformed secret surfaces here as a
  // clean CORS-bearing 500 instead of crashing the worker at module load.
  let cfg: VertexConfig;
  try {
    cfg = loadVertexConfig();
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "ai-proxy.config_error",
        userId,
        error: (err as Error).message,
      }),
    );
    return json(
      { error: { message: `Vertex not configured: ${(err as Error).message}` } },
      500,
      headers,
    );
  }

  // Parse and validate the request body.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400, headers);
  }

  const { model, messages, temperature, max_tokens, response_format } =
    body ?? {};

  if (typeof model !== "string" || !model) {
    return json({ error: { message: "model is required" } }, 400, headers);
  }

  // Only the env-configured Vertex model may be requested. Preserves the prior
  // allowlist security property without a module-scope constant.
  if (model.trim() !== cfg.modelId) {
    console.warn(
      JSON.stringify({ evt: "ai-proxy.disallowed_model", userId, model }),
    );
    return json(
      { error: { message: `Model not allowed: ${model}`, code: "model_not_allowed" } },
      403,
      headers,
    );
  }

  debugLog("model_accepted", { model: model.trim() });

  if (!Array.isArray(messages) || messages.length === 0) {
    return json(
      { error: { message: "messages is required" } },
      400,
      headers,
    );
  }

  if (messages.length > MAX_MESSAGES) {
    console.warn(
      JSON.stringify({
        evt: "ai-proxy.request_too_large",
        userId,
        reason: "message_count",
        count: messages.length,
      }),
    );
    return json(
      { error: { message: `Too many messages (max ${MAX_MESSAGES})` } },
      400,
      headers,
    );
  }

  const totalChars = totalMessageContentChars(messages);
  if (totalChars > MAX_TOTAL_CONTENT_CHARS) {
    console.warn(
      JSON.stringify({
        evt: "ai-proxy.request_too_large",
        userId,
        reason: "content_length",
        chars: totalChars,
      }),
    );
    return json(
      {
        error: {
          message:
            `Request too large (max ${MAX_TOTAL_CONTENT_CHARS} chars of message content)`,
        },
      },
      400,
      headers,
    );
  }

  const safeMaxTokens = clampMaxTokens(max_tokens);
  const hasJsonMode =
    (response_format as { type?: string } | null)?.type === "json_object";

  // Translate OpenAI-style messages to Vertex format.
  const { contents, systemInstruction } = translateMessages(messages);

  const vertexBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: safeMaxTokens,
      ...(typeof temperature === "number" ? { temperature } : {}),
      // response_format: { type: "json_object" } → responseMimeType
      ...(hasJsonMode ? { responseMimeType: "application/json" } : {}),
      // Gemini 2.5 Flash enables thinking by default; thinking tokens count
      // against maxOutputTokens. Brand Intelligence sections use small caps
      // (e.g. tagline max_tokens=80) which leaves zero budget for visible JSON.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  // systemInstruction is a top-level field, not part of contents[].
  if (systemInstruction) vertexBody.systemInstruction = systemInstruction;

  console.log(
    JSON.stringify({
      evt: "ai-proxy.request",
      userId,
      model: cfg.modelId,
      maxTokens: safeMaxTokens,
      messageCount: messages.length,
      hasJsonMode,
      hasSystemInstruction: systemInstruction !== null,
    }),
  );

  // Acquire a (possibly cached) OAuth2 access token for Vertex.
  let accessToken: string;
  try {
    accessToken = await getAccessToken(cfg);
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "ai-proxy.token_error",
        userId,
        error: (err as Error).message,
      }),
    );
    return json(
      { error: { message: "Failed to acquire Vertex access token" } },
      502,
      headers,
    );
  }

  // Call Vertex generateContent.
  let upstream: Response;
  try {
    upstream = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(vertexBody),
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "ai-proxy.upstream_error",
        userId,
        error: (err as Error).message,
      }),
    );
    return json(
      {
        error: {
          message: `Vertex request failed: ${(err as Error).message}`,
        },
      },
      502,
      headers,
    );
  }

  debugLog("upstream_status", { status: upstream.status });

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error(
      JSON.stringify({
        evt: "ai-proxy.upstream_error",
        userId,
        status: upstream.status,
        // First 300 chars only - avoids logging large upstream error bodies.
        body: errText.slice(0, 300),
      }),
    );
    return json(
      {
        error: {
          message: `Vertex error ${upstream.status}: ${errText.slice(0, 200)}`,
        },
      },
      upstream.status,
      headers,
    );
  }

  // Parse and normalize the Vertex response to the OpenAI shape that aiClient.js
  // already knows how to read: { choices: [{ message: { content } }] }.
  let vertexData: unknown;
  try {
    vertexData = await upstream.json();
  } catch {
    return json(
      { error: { message: "Vertex response was not valid JSON" } },
      502,
      headers,
    );
  }

  const {
    text: content,
    finishReason,
    partsCount,
    partTextLengths,
    thoughtPartCount,
    thoughtsTokenCount,
  } = extractCandidateText(vertexData);

  if (typeof content !== "string" || !content.trim()) {
    console.error(
      JSON.stringify({
        evt: "ai-proxy.empty_candidates",
        userId,
        finishReason: finishReason ?? "unknown",
        partsCount,
        partTextLengths,
        thoughtPartCount,
        thoughtsTokenCount,
        maxOutputTokens: safeMaxTokens,
      }),
    );
    return json(
      { error: { message: "Vertex returned empty candidates" } },
      502,
      headers,
    );
  }

  // Token accounting (non-secret). Vertex returns usageMetadata; pass the counts
  // through so the client can do exact per-request token accounting. Never
  // includes prompt text or any credential material.
  const usageMeta = (vertexData as {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  })?.usageMetadata;
  const usage = usageMeta
    ? {
      promptTokenCount: usageMeta.promptTokenCount ?? null,
      candidatesTokenCount: usageMeta.candidatesTokenCount ?? null,
      totalTokenCount: usageMeta.totalTokenCount ?? null,
    }
    : null;

  debugLog("usage", {
    model: cfg.modelId,
    finishReason,
    partsCount,
    thoughtPartCount,
    thoughtsTokenCount,
    contentLength: content.length,
    ...(usage ?? {}),
  });

  // Return the normalized response. aiClient.js reads data.choices[0].message.content;
  // `finish_reason` lets the client detect MAX_TOKENS truncation (vs. genuinely
  // malformed output); `usage` and `model` are additive token-accounting fields.
  return json(
    {
      choices: [{ message: { content }, finish_reason: finishReason ?? null }],
      usage,
      model: cfg.modelId,
    },
    200,
    headers,
  );
});
