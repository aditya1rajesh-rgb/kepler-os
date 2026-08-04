// Apify helpers (WS4-mentions). Platform-global token (APIFY_TOKEN, like the
// Vertex service account). Powers the DURABLE mention finder: find real community
// threads where a disclosed, genuinely-helpful answer belongs — never a fake-post
// generator (see the Reddit-crackdown context; the shortcut is dying). This module
// only DISCOVERS threads; drafting a disclosed answer + posting stay human, client-side.

const APIFY_BASE = "https://api.apify.com/v2";

export const apifyConfigured = (): boolean => Boolean((Deno.env.get("APIFY_TOKEN") ?? "").trim());

/**
 * Run an Apify actor synchronously and return its dataset items.
 * Uses run-sync-get-dataset-items so a quick search actor returns inline.
 */
export const runActorSync = async (actorId: string, input: unknown, { timeoutSecs = 60 } = {}): Promise<unknown[]> => {
  const token = (Deno.env.get("APIFY_TOKEN") ?? "").trim();
  if (!token) throw new Error("not_configured");
  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${timeoutSecs}`;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Apify run failed (${res.status})${t ? `: ${t.slice(0, 200)}` : ""}`);
  }
  const items = await res.json().catch(() => []);
  return Array.isArray(items) ? items : [];
};

export interface MentionThread { title: string; url: string; snippet: string; source: string; }

const hostOf = (url: string): string => {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return ""; }
};

/**
 * Find community threads (Reddit/Quora/forums by default) relevant to a topic via
 * the Apify Google Search Scraper. Returns real thread URLs + snippets — the raw
 * material for a human to decide where a disclosed answer honestly belongs.
 */
export const findMentionThreads = async (
  topic: string,
  { sites = ["reddit.com", "quora.com"], max = 10 }: { sites?: string[]; max?: number } = {},
): Promise<MentionThread[]> => {
  const clean = String(topic ?? "").trim();
  if (!clean) return [];
  const siteFilter = sites.filter(Boolean).map((s) => `site:${s}`).join(" OR ");
  const queries = siteFilter ? `${clean} (${siteFilter})` : clean;

  const items = await runActorSync("apify~google-search-scraper", {
    queries,
    maxPagesPerQuery: 1,
    resultsPerPage: Math.min(Math.max(max, 1), 20),
    saveHtml: false,
    csvFriendlyOutput: false,
  });

  const threads: MentionThread[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const organic = ((it as { organicResults?: unknown[] })?.organicResults ?? []);
    for (const r of organic) {
      const rr = r as { title?: string; url?: string; description?: string };
      const url = String(rr?.url ?? "").trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      threads.push({ title: String(rr?.title ?? ""), url, snippet: String(rr?.description ?? ""), source: hostOf(url) });
      if (threads.length >= max) return threads;
    }
  }
  return threads;
};
