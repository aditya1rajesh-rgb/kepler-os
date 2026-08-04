// GSC operator loop — the analysis behind WS1a. Pure functions over Search
// Console rows (already flowing via oauth-proxy gscQuery) that surface the
// operator moves the source articles sell: striking-distance pages, low-CTR
// winners, cannibalization, dead pages, and content decay — as a single
// prioritized, plain-English action list.
//
// Everything here is derived from REAL GSC data — no fabrication. Impact is an
// explicit ESTIMATE of "clicks at stake" (labelled as such in the UI) so the
// ranking is meaningful and comparable across opportunity types. Pure + no I/O
// so it's unit-tested in tests/seo-operator.test.js (codebase convention).

// Rough position→CTR curve (organic, blended). Used only to ESTIMATE upside, never
// presented as measured. Index = rounded position (1-10); page-2+ ≈ negligible.
const CTR_CURVE = { 1: 0.27, 2: 0.15, 3: 0.10, 4: 0.07, 5: 0.05, 6: 0.04, 7: 0.032, 8: 0.026, 9: 0.021, 10: 0.018 };

/** Estimated organic CTR at an average position (clamped to the page-1 curve). */
export const expectedCtr = (position) => {
    const p = Number(position);
    if (!(p >= 1)) return 0.02;
    if (p > 10) return 0.01;
    return CTR_CURVE[Math.min(Math.max(Math.round(p), 1), 10)] ?? 0.015;
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (v) => Math.round(num(v));

/** Strip protocol + origin to a readable path for display (best-effort). */
export const pagePath = (url) => {
    const u = String(url || '').trim();
    if (!u) return '';
    try { const parsed = new URL(u); return (parsed.pathname + parsed.search) || '/'; }
    catch { return u.replace(/^https?:\/\/[^/]+/i, '') || u; }
};

/** Aggregate query×page rows to per-page totals (clicks + impressions summed). */
export const aggregateByPage = (queryPageRows = []) => {
    const byPage = new Map();
    for (const r of queryPageRows) {
        const page = String(r.page ?? '');
        if (!page) continue;
        const cur = byPage.get(page) ?? { page, clicks: 0, impressions: 0, queries: 0, _posWeight: 0 };
        cur.clicks += num(r.clicks);
        cur.impressions += num(r.impressions);
        cur.queries += 1;
        cur._posWeight += num(r.position) * num(r.impressions);
        byPage.set(page, cur);
    }
    return [...byPage.values()].map((p) => ({
        page: p.page,
        clicks: p.clicks,
        impressions: p.impressions,
        queries: p.queries,
        ctr: p.impressions > 0 ? p.clicks / p.impressions : 0,
        position: p.impressions > 0 ? p._posWeight / p.impressions : 0,
    }));
};

// ── Individual analyses ───────────────────────────────────────────────────────
// Each returns a list of opportunity objects:
// { type, key, title, detail, action, metrics, impact }  (impact = est. clicks at stake)

/** Page-2 queries (avg position 11-20) with enough demand to be worth pushing. */
export const strikingDistance = (queryRows = [], { minImpressions = 20 } = {}) =>
    queryRows
        .filter((r) => num(r.position) > 10 && num(r.position) <= 20 && num(r.impressions) >= minImpressions)
        .map((r) => {
            const impact = Math.max(0, num(r.impressions) * (expectedCtr(5) - num(r.ctr)));
            return {
                type: 'striking_distance',
                key: `sd:${r.query}`,
                title: String(r.query ?? ''),
                detail: `Ranks position ${num(r.position).toFixed(1)} with ${round(r.impressions)} impressions/mo — one push from page 1.`,
                action: 'Refresh the ranking page and add 2-3 internal links from strong pages to move it onto page 1.',
                metrics: { position: num(r.position), impressions: num(r.impressions), clicks: num(r.clicks), ctr: num(r.ctr) },
                impact,
            };
        })
        .sort((a, b) => b.impact - a.impact);

/** Page-1 rankers whose CTR is well below what the position should earn. */
export const lowCtr = (queryRows = [], { minImpressions = 30, ratio = 0.6 } = {}) =>
    queryRows
        .filter((r) => {
            const pos = num(r.position);
            return pos >= 1 && pos <= 10 && num(r.impressions) >= minImpressions && num(r.ctr) < expectedCtr(pos) * ratio;
        })
        .map((r) => {
            const missed = Math.max(0, num(r.impressions) * (expectedCtr(num(r.position)) - num(r.ctr)));
            return {
                type: 'low_ctr',
                key: `ctr:${r.query}`,
                title: String(r.query ?? ''),
                detail: `Position ${num(r.position).toFixed(1)} but only ${(num(r.ctr) * 100).toFixed(1)}% CTR (≈${(expectedCtr(num(r.position)) * 100).toFixed(0)}% expected) across ${round(r.impressions)} impressions.`,
                action: 'Rewrite the meta title + description to match this exact query and add a compelling reason to click.',
                metrics: { position: num(r.position), impressions: num(r.impressions), ctr: num(r.ctr), expectedCtr: expectedCtr(num(r.position)) },
                impact: missed,
            };
        })
        .sort((a, b) => b.impact - a.impact);

/** Queries where 2+ of the site's own pages compete (splitting authority). */
export const cannibalization = (queryPageRows = [], { minImpressions = 20 } = {}) => {
    const byQuery = new Map();
    for (const r of queryPageRows) {
        const q = String(r.query ?? '');
        const page = String(r.page ?? '');
        if (!q || !page || num(r.impressions) < 1) continue;
        const cur = byQuery.get(q) ?? { query: q, pages: [], impressions: 0 };
        cur.pages.push({ page, impressions: num(r.impressions), clicks: num(r.clicks), position: num(r.position) });
        cur.impressions += num(r.impressions);
        byQuery.set(q, cur);
    }
    return [...byQuery.values()]
        .filter((g) => g.pages.filter((p) => p.impressions >= Math.max(5, minImpressions / 4)).length >= 2 && g.impressions >= minImpressions)
        .map((g) => {
            const pages = g.pages.sort((a, b) => b.impressions - a.impressions);
            const best = Math.min(...pages.map((p) => p.position).filter((p) => p >= 1));
            const totalClicks = pages.reduce((s, p) => s + p.clicks, 0);
            const impact = Math.max(0, g.impressions * expectedCtr(best) - totalClicks);
            return {
                type: 'cannibalization',
                key: `cann:${g.query}`,
                title: String(g.query),
                detail: `${pages.length} of your pages compete for this query (best position ${best.toFixed(1)}), splitting authority.`,
                action: 'Consolidate the weaker pages into the strongest (301-redirect), or clearly differentiate their intent.',
                metrics: { pageCount: pages.length, impressions: g.impressions, bestPosition: best, pages: pages.slice(0, 4).map((p) => ({ page: pagePath(p.page), impressions: p.impressions, position: p.position })) },
                impact,
            };
        })
        .sort((a, b) => b.impact - a.impact);
};

/** Pages that earn impressions but almost no clicks — zombie/dead pages. */
export const deadPages = (pageRows = [], { minImpressions = 50, maxCtr = 0.003 } = {}) =>
    pageRows
        .filter((p) => num(p.impressions) >= minImpressions && num(p.ctr) <= maxCtr)
        .map((p) => {
            const impact = Math.max(0, num(p.impressions) * expectedCtr(num(p.position) || 10));
            return {
                type: 'dead_page',
                key: `dead:${p.page}`,
                title: pagePath(p.page),
                detail: `${round(p.impressions)} impressions/mo but ${round(p.clicks)} clicks (${(num(p.ctr) * 100).toFixed(2)}% CTR) across ${num(p.queries) || '—'} queries.`,
                action: 'Rewrite the title/intro to earn the click, or prune/redirect if the page has no purpose.',
                metrics: { impressions: num(p.impressions), clicks: num(p.clicks), ctr: num(p.ctr), position: num(p.position) },
                impact,
            };
        })
        .sort((a, b) => b.impact - a.impact);

/** Queries losing clicks vs the prior period (content decay). */
export const decay = (currentQueryRows = [], priorQueryRows = [], { minPriorClicks = 5, dropRatio = 0.3 } = {}) => {
    const priorByQuery = new Map(priorQueryRows.map((r) => [String(r.query ?? ''), r]));
    const out = [];
    for (const r of currentQueryRows) {
        const q = String(r.query ?? '');
        const prior = priorByQuery.get(q);
        if (!prior) continue;
        const priorClicks = num(prior.clicks);
        const curClicks = num(r.clicks);
        if (priorClicks < minPriorClicks) continue;
        const drop = (priorClicks - curClicks) / priorClicks;
        if (drop < dropRatio) continue;
        out.push({
            type: 'decay',
            key: `decay:${q}`,
            title: q,
            detail: `Clicks fell ${Math.round(drop * 100)}% (${round(priorClicks)} → ${round(curClicks)}) vs the prior 28 days.`,
            action: 'Refresh outdated stats/examples, update the publish date, and re-promote — the page is slipping.',
            metrics: { priorClicks, currentClicks: curClicks, dropPct: drop, position: num(r.position) },
            impact: Math.max(0, priorClicks - curClicks),
        });
    }
    return out.sort((a, b) => b.impact - a.impact);
};

/**
 * Run every analysis and return a single prioritized list.
 * @param {object} datasets { queryRows, priorQueryRows, queryPageRows }
 * @param {object} [opts] { minImpressions, limit }
 * @returns {{ opportunities: object[], summary: Record<string, number>, totalImpact: number }}
 */
export const buildOpportunities = (datasets = {}, opts = {}) => {
    const { queryRows = [], priorQueryRows = [], queryPageRows = [] } = datasets;
    const { minImpressions = 20, limit = 50 } = opts;
    const pageRows = aggregateByPage(queryPageRows);

    const all = [
        ...strikingDistance(queryRows, { minImpressions }),
        ...lowCtr(queryRows, { minImpressions: Math.max(minImpressions, 30) }),
        ...cannibalization(queryPageRows, { minImpressions }),
        ...deadPages(pageRows, { minImpressions: Math.max(minImpressions, 50) }),
        ...decay(queryRows, priorQueryRows),
    ].sort((a, b) => b.impact - a.impact);

    const summary = all.reduce((acc, o) => { acc[o.type] = (acc[o.type] ?? 0) + 1; return acc; }, {});
    const totalImpact = all.reduce((s, o) => s + o.impact, 0);
    return { opportunities: all.slice(0, limit), summary, totalImpact: Math.round(totalImpact) };
};

/** Human labels for the opportunity types (shared by UI + tests). */
export const OPPORTUNITY_LABELS = {
    striking_distance: 'Striking distance',
    low_ctr: 'Low CTR',
    cannibalization: 'Cannibalization',
    dead_page: 'Dead page',
    decay: 'Content decay',
};
