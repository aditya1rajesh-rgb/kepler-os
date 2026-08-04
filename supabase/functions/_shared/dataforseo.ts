// DataForSEO keyword metrics (WS1c). Platform-global credentials (Basic auth via
// DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD, like the Vertex service account). Fetches
// REAL search volume + keyword difficulty and merges them by keyword so the
// keyword pipeline can show measured metrics + a live opportunity score. When the
// secrets are absent this is `not_configured` and the caller degrades to estimates
// — never fabricated numbers. Chosen over SerpApi (see spec §9 O2): ~10-25× cheaper
// pay-as-you-go for our bursty per-workspace usage.

const DFS_BASE = "https://api.dataforseo.com/v3";

const authHeader = (): string | null => {
  const login = (Deno.env.get("DATAFORSEO_LOGIN") ?? "").trim();
  const password = (Deno.env.get("DATAFORSEO_PASSWORD") ?? "").trim();
  if (!login || !password) return null;
  return `Basic ${btoa(`${login}:${password}`)}`;
};

export const dataforseoConfigured = (): boolean => authHeader() !== null;

const post = async (path: string, body: unknown, auth: string) => {
  const res = await fetch(`${DFS_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.status_message || `DataForSEO request failed (${res.status})`);
  return data;
};

// Result rows live at tasks[0].result[] — some endpoints nest them under result[].items[].
const resultItems = (data: unknown): Array<Record<string, unknown>> => {
  const result = (data as { tasks?: Array<{ result?: unknown }> })?.tasks?.[0]?.result;
  if (!Array.isArray(result)) return [];
  if (result.length && Array.isArray((result[0] as { items?: unknown })?.items)) {
    return result.flatMap((r) => ((r as { items?: unknown[] }).items ?? []) as Array<Record<string, unknown>>);
  }
  return result as Array<Record<string, unknown>>;
};

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export interface KeywordMetric { volume: number | null; difficulty: number | null; cpc: number | null; competition: number | null; }

/**
 * Fetch search volume + keyword difficulty for a batch of keywords, merged by
 * lowercased term. Each sub-call is independent — one failing (e.g. no Labs plan)
 * still returns whatever the other provided. Throws "not_configured" if no creds.
 */
export const fetchKeywordMetrics = async (
  keywords: string[],
  { locationName = "United States", languageCode = "en", languageName = "English" }: { locationName?: string; languageCode?: string; languageName?: string } = {},
): Promise<Record<string, KeywordMetric>> => {
  const auth = authHeader();
  if (!auth) throw new Error("not_configured");

  const kws = Array.from(new Set(keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean))).slice(0, 700);
  const merged: Record<string, KeywordMetric> = {};
  if (!kws.length) return merged;
  const ensure = (k: string): KeywordMetric => (merged[k] ??= { volume: null, difficulty: null, cpc: null, competition: null });

  // 1) Google Ads search volume (+ cpc, competition index).
  try {
    const vol = await post("/keywords_data/google_ads/search_volume/live", [{ keywords: kws, location_name: locationName, language_code: languageCode }], auth);
    for (const r of resultItems(vol)) {
      const k = String(r?.keyword ?? "").toLowerCase();
      if (!k) continue;
      const e = ensure(k);
      e.volume = numOrNull(r?.search_volume) ?? e.volume;
      e.cpc = numOrNull(r?.cpc) ?? e.cpc;
      e.competition = numOrNull(r?.competition_index) ?? e.competition;
    }
  } catch { /* volume optional — difficulty may still succeed */ }

  // 2) DataForSEO Labs bulk keyword difficulty (0-100).
  try {
    const diff = await post("/dataforseo_labs/google/bulk_keyword_difficulty/live", [{ keywords: kws, location_name: locationName, language_name: languageName }], auth);
    for (const r of resultItems(diff)) {
      const k = String(r?.keyword ?? "").toLowerCase();
      if (!k) continue;
      ensure(k).difficulty = numOrNull(r?.keyword_difficulty) ?? ensure(k).difficulty;
    }
  } catch { /* difficulty optional — volume may already be set */ }

  return merged;
};
