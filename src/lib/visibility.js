// AEO / AI-visibility — pure helpers (no I/O, node-testable).
//
// The V2 wedge measures whether AI assistants mention/cite THIS brand when a
// buyer asks a category question. These functions turn the existing brand
// context (ICPs + competitors) into buyer prompts, detect brand/competitor
// presence in an answer, and roll a scan up into a share-of-voice reading.
// See [[aeo-wedge-roadmap]] and [[measurement-attribution]].

/** The AI surfaces we track. `configured` is flipped on once keys/edge exist. */
export const SURFACES = [
    { id: 'perplexity', label: 'Perplexity' },
    { id: 'openai', label: 'ChatGPT' },
    { id: 'anthropic', label: 'Claude' },
    { id: 'google-aio', label: 'Google AI Overviews' },
];

export const SURFACE_IDS = SURFACES.map((s) => s.id);
export const surfaceLabel = (id) => SURFACES.find((s) => s.id === id)?.label ?? id;

/** Stable FNV-1a hash → hex, for dedupe / grouping a prompt across runs. */
export const hashPrompt = (prompt) => {
    const s = String(prompt || '').trim().toLowerCase();
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
};

const clean = (v) => String(v ?? '').trim();
const cap = (v) => { const s = clean(v); return s ? s[0].toUpperCase() + s.slice(1) : s; };

// A compact category noun for "best X for Y" prompts. Falls back gracefully so a
// thin brand (no industry) still yields sensible questions.
const categoryOf = (structured) => {
    const ind = clean(structured?.industry);
    if (ind) return ind.toLowerCase();
    const offers = clean(structured?.offers);
    if (offers) return offers.toLowerCase().split(/[,.;]/)[0].trim();
    return 'solution';
};

const dedupePrompts = (prompts) => {
    const seen = new Set();
    const out = [];
    for (const p of prompts) {
        const key = p.prompt.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(p);
    }
    return out;
};

/**
 * Generate buyer prompts from the structured brand context (the shape returned
 * by brandContextService.getBrandContextForGeneration().structured).
 *
 * @param {object} structured { name, industry, offers, valueProposition, icps[], competitors[] }
 * @param {object} [opts] { maxPrompts=16, perIcp=2, maxCompetitors=4 }
 * @returns {Array<{ prompt: string, kind: string, meta: object }>}
 */
export const buildBuyerPrompts = (structured = {}, opts = {}) => {
    const { maxPrompts = 16, perIcp = 2, maxCompetitors = 4 } = opts;
    const category = categoryOf(structured);
    const brand = clean(structured.name);
    const icps = Array.isArray(structured.icps) ? structured.icps : [];
    const competitors = (Array.isArray(structured.competitors) ? structured.competitors : [])
        .map((c) => clean(c?.name)).filter(Boolean).slice(0, maxCompetitors);

    const prompts = [];

    // Global category questions — where you most want to surface.
    prompts.push({ prompt: `What are the best ${category} tools?`, kind: 'category', meta: {} });
    prompts.push({ prompt: `Which ${category} should I choose in 2026?`, kind: 'category', meta: {} });

    // Per-ICP: a segment-scoped best-of + a problem-led question from their pains.
    for (const icp of icps) {
        const seg = clean(icp.segment) || clean(icp.role);
        if (!seg) continue;
        const added = [];
        added.push({ prompt: `What are the best ${category} tools for ${seg}?`, kind: 'category', meta: { segment: seg } });
        const pain = clean(icp.painPoints).split(/[,.;]/)[0].trim();
        if (pain) {
            // Pains read as noun phrases ("invisible in AI search"), so frame the
            // buyer's problem then ask for tools rather than "best way to <pain>".
            added.push({ prompt: `${cap(pain)} — which tools help?`, kind: 'problem', meta: { segment: seg } });
        }
        prompts.push(...added.slice(0, perIcp));
    }

    // Competitor-relative: alternatives + head-to-head (only if we know our name).
    for (const comp of competitors) {
        prompts.push({ prompt: `What are the best alternatives to ${comp}?`, kind: 'alternative', meta: { competitor: comp } });
        if (brand) {
            prompts.push({ prompt: `${brand} vs ${comp}: which is better?`, kind: 'comparison', meta: { competitor: comp } });
        }
    }

    return dedupePrompts(prompts).slice(0, maxPrompts);
};

// Case-insensitive whole-ish-word presence. Guards very short names (<=2 chars)
// to avoid false hits ("Ai", "Go"), requiring a word boundary for those.
const nameAppears = (text, name) => {
    const t = String(text || '');
    const n = clean(name);
    if (!t || !n) return false;
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = n.length <= 3 ? new RegExp(`\\b${esc}\\b`, 'i') : new RegExp(esc, 'i');
    return re.test(t);
};

const URL_RE = /https?:\/\/[^\s)"'<>]+/gi;

/** Extract citation URLs from an answer (deduped, trailing punctuation trimmed). */
export const extractCitations = (answer) => {
    const found = String(answer || '').match(URL_RE) || [];
    const seen = new Set();
    const out = [];
    for (const raw of found) {
        const url = raw.replace(/[.,;:)\]]+$/, '');
        if (seen.has(url)) continue;
        seen.add(url);
        out.push(url);
    }
    return out;
};

const hostOf = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

const POS = ['best', 'leading', 'top', 'recommended', 'excellent', 'popular', 'trusted', 'powerful', 'great'];
const NEG = ['worst', 'avoid', 'lacking', 'limited', 'expensive', 'poor', 'outdated', 'weak', 'buggy'];

// Light lexical sentiment on the sentence(s) that name the brand. Deliberately
// conservative — real sentiment is an LLM-scored field in the live path; this is
// a cheap default so a mention isn't left blank.
const sentimentFor = (answer, brandName) => {
    const sentences = String(answer || '').split(/(?<=[.!?])\s+/);
    const hits = sentences.filter((s) => nameAppears(s, brandName));
    if (!hits.length) return null;
    const blob = hits.join(' ').toLowerCase();
    const pos = POS.filter((w) => blob.includes(w)).length;
    const neg = NEG.filter((w) => blob.includes(w)).length;
    if (pos > neg) return 'positive';
    if (neg > pos) return 'negative';
    return 'neutral';
};

/**
 * Detect brand + competitor presence in a single answer.
 * @param {object} args { answer, brandName, brandDomain, competitors: string[] }
 * @returns {{ brandMentioned, brandCited, competitorMentions, citations, sentiment }}
 */
export const detectMentions = ({ answer, brandName, brandDomain = '', competitors = [] } = {}) => {
    const citations = extractCitations(answer);
    const citedHosts = new Set(citations.map(hostOf).filter(Boolean));
    const brandMentioned = nameAppears(answer, brandName);
    const bDom = clean(brandDomain).replace(/^www\./, '');
    const brandCited = Boolean(bDom) && [...citedHosts].some((h) => h.includes(bDom) || bDom.includes(h));

    const competitorMentions = (competitors || []).map((name) => {
        const mentioned = nameAppears(answer, name);
        return { name, mentioned, cited: mentioned && [...citedHosts].some((h) => nameAppears(h, name)) };
    });

    return {
        brandMentioned,
        brandCited,
        competitorMentions,
        citations,
        sentiment: brandMentioned ? sentimentFor(answer, brandName) : null,
    };
};

/**
 * Roll a set of normalized scan rows up into a share-of-voice reading.
 * Rows: [{ brandMentioned, competitorMentions: [{ name, mentioned }] }].
 * SoV = brand mentions / (brand mentions + all competitor mentions).
 *
 * @returns {{ shareOfVoice, brandPresenceRate, brandMentions, totalRows,
 *            totalMentions, perCompetitor: [{ name, mentions, share }] }}
 */
export const computeShareOfVoice = (rows = [], { competitors = [] } = {}) => {
    const totalRows = rows.length;
    const brandMentions = rows.filter((r) => r.brandMentioned).length;

    const compCounts = new Map((competitors || []).map((n) => [clean(n), 0]));
    for (const r of rows) {
        for (const cm of r.competitorMentions || []) {
            if (!cm?.mentioned) continue;
            const key = clean(cm.name);
            compCounts.set(key, (compCounts.get(key) || 0) + 1);
        }
    }
    const totalCompetitorMentions = [...compCounts.values()].reduce((a, b) => a + b, 0);
    const totalMentions = brandMentions + totalCompetitorMentions;

    const round = (x) => Math.round(x * 1000) / 1000;
    const perCompetitor = [...compCounts.entries()]
        .map(([name, mentions]) => ({
            name,
            mentions,
            share: totalMentions ? round(mentions / totalMentions) : 0,
        }))
        .sort((a, b) => b.mentions - a.mentions);

    return {
        shareOfVoice: totalMentions ? round(brandMentions / totalMentions) : 0,
        brandPresenceRate: totalRows ? round(brandMentions / totalRows) : 0,
        brandMentions,
        totalRows,
        totalMentions,
        perCompetitor,
    };
};

// --- Test-only mock (status='mock') -----------------------------------------
// Synthesizes a plausible answer so the full pipeline (detect → SoV → snapshot)
// can be exercised without provider keys. Deterministic per (prompt, surface).
// NEVER written as real 'ok' measurement.
export const synthesizeMockAnswer = ({ prompt, structured = {}, surface = 'openai' }) => {
    const brand = clean(structured.name) || 'Kepler';
    const comps = (Array.isArray(structured.competitors) ? structured.competitors : [])
        .map((c) => clean(c?.name)).filter(Boolean);
    const h = parseInt(hashPrompt(`${surface}:${prompt}`), 16);
    // Brand shows up on ~55% of prompts; each competitor independently ~45%.
    const brandShown = h % 100 < 55;
    const named = [];
    if (brandShown) named.push(brand);
    comps.forEach((c, i) => { if ((h >> (i + 1)) % 100 < 45) named.push(c); });
    if (!named.length) named.push(comps[0] || brand);
    const domain = clean(structured.url) ? hostOf(clean(structured.url).startsWith('http') ? structured.url : `https://${structured.url}`) : '';
    const cites = brandShown && domain ? ` See https://${domain} for details.` : '';
    return `For this need, leading options include ${named.join(', ')}. ${named[0]} is often recommended as a strong, trusted choice.${cites}`;
};
