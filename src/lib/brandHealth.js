// Brand health — pure helpers (no I/O, node-testable).
//
// Phase-3 "living brand model": score how trustworthy and how fresh each brand
// field is from its existing field_provenance entry (origin × age), and detect
// when the source website changed since the snapshot stored in
// population_meta.websiteSource. Nothing here mutates the brand — these
// readings drive UI chips and reviewable re-proposals, never silent writes.
// See [[aeo-wedge-roadmap]].

// Explicit .js extension keeps this lib importable from plain node (harness
// tests) as well as Vite.
import { FIELD_ORIGINS } from './brandContracts.js';

// How much we trust a value straight from each origin, before age decay.
// Manual edits are ground truth; AI drafts are the weakest until confirmed.
const ORIGIN_TRUST = {
    [FIELD_ORIGINS.MANUAL]: 1,
    [FIELD_ORIGINS.WORKSPACE]: 0.9,
    [FIELD_ORIGINS.COMBINED]: 0.8,
    [FIELD_ORIGINS.WEBSITE]: 0.75,
    [FIELD_ORIGINS.FILE]: 0.7,
    learned: 0.65, // FIELD_ORIGINS.LEARNED — feedback-promoted, user-approved
    [FIELD_ORIGINS.AI]: 0.5,
};

export const STALENESS_TIERS = { FRESH: 'fresh', AGING: 'aging', STALE: 'stale', UNKNOWN: 'unknown' };

const DAY_MS = 24 * 60 * 60 * 1000;
const FRESH_DAYS = 30;   // full freshness inside this window
const FLOOR_DAYS = 180;  // decays linearly to the floor by here
const STALE_DAYS = 90;   // tier boundary for the "stale" chip
const FRESHNESS_FLOOR = 0.5;

/** Age of a provenance entry in whole days, or null when the date is unusable. */
export const ageInDays = (updatedAt, now = new Date()) => {
    const t = Date.parse(updatedAt ?? '');
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
};

/** Staleness reading for one provenance entry: { days, tier }. */
export const stalenessOf = (updatedAt, now = new Date()) => {
    const days = ageInDays(updatedAt, now);
    if (days === null) return { days: null, tier: STALENESS_TIERS.UNKNOWN };
    if (days <= FRESH_DAYS) return { days, tier: STALENESS_TIERS.FRESH };
    if (days <= STALE_DAYS) return { days, tier: STALENESS_TIERS.AGING };
    return { days, tier: STALENESS_TIERS.STALE };
};

// 1.0 inside the fresh window, then linear decay to FRESHNESS_FLOOR at
// FLOOR_DAYS. Unknown age sits between: not fresh, not maximally decayed.
const freshnessFactor = (days) => {
    if (days === null) return 0.75;
    if (days <= FRESH_DAYS) return 1;
    if (days >= FLOOR_DAYS) return FRESHNESS_FLOOR;
    const span = FLOOR_DAYS - FRESH_DAYS;
    return 1 - ((days - FRESH_DAYS) / span) * (1 - FRESHNESS_FLOOR);
};

/**
 * Confidence (0..1) for one field: origin trust × freshness decay.
 * Returns null when the field has no provenance entry (nothing known).
 */
export const fieldConfidence = (entry, now = new Date()) => {
    if (!entry?.origin) return null;
    const trust = ORIGIN_TRUST[entry.origin] ?? 0.5;
    const days = ageInDays(entry.updatedAt, now);
    return Math.round(trust * freshnessFactor(days) * 100) / 100;
};

/** The brand fields worth scoring, with UI labels. Paths match field_provenance keys. */
export const BRAND_HEALTH_PATHS = [
    { path: 'tagline', label: 'Tagline' },
    { path: 'overview', label: 'Overview' },
    { path: 'tone', label: 'Voice & tone' },
    { path: 'values', label: 'Brand values' },
    { path: 'businessDetails.offersProducts', label: 'Offers / products' },
    { path: 'businessDetails.offerDescriptions', label: 'Offer descriptions' },
    { path: 'businessDetails.differentiators', label: 'Differentiators' },
    { path: 'businessDetails.painPointsSolved', label: 'Pains solved' },
    { path: 'businessDetails.valueProposition', label: 'Value proposition' },
    { path: 'businessDetails.keyMessages', label: 'Key messages' },
    { path: 'businessDetails.proofPoints', label: 'Proof points' },
];

const valueAtPath = (brand, path) => {
    if (!brand) return undefined;
    if (path.startsWith('businessDetails.')) {
        return brand.businessDetails?.[path.split('.')[1]];
    }
    return brand[path];
};

const hasContent = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(String(v ?? '').trim()));

/**
 * Score the whole brand model. Only fields that HAVE a value are scored —
 * empty fields are a completeness problem, not a confidence one.
 *
 * @returns {{ fields: Array<{path,label,hasValue,origin,confidence,staleness}>,
 *            avgConfidence: number|null, staleCount, unknownCount, scoredCount,
 *            lastSyncedAt: string|null }}
 */
export const computeBrandHealth = (brand, { now = new Date() } = {}) => {
    const provenance = brand?.fieldProvenance ?? {};
    const fields = BRAND_HEALTH_PATHS.map(({ path, label }) => {
        const entry = provenance[path] ?? null;
        const hasValue = hasContent(valueAtPath(brand, path));
        return {
            path,
            label,
            hasValue,
            origin: entry?.origin ?? null,
            confidence: hasValue ? fieldConfidence(entry, now) : null,
            staleness: hasValue ? stalenessOf(entry?.updatedAt, now) : { days: null, tier: STALENESS_TIERS.UNKNOWN },
        };
    });

    const scored = fields.filter((f) => f.hasValue && f.confidence !== null);
    const withValue = fields.filter((f) => f.hasValue);
    const avg = scored.length
        ? Math.round((scored.reduce((a, f) => a + f.confidence, 0) / scored.length) * 100) / 100
        : null;

    return {
        fields,
        avgConfidence: avg,
        staleCount: withValue.filter((f) => f.staleness.tier === STALENESS_TIERS.STALE).length,
        unknownCount: withValue.filter((f) => f.confidence === null).length,
        scoredCount: scored.length,
        lastSyncedAt: brand?.populationMeta?.lastRunAt ?? null,
    };
};

// --- Source-change detection --------------------------------------------------

// Whitespace/case-insensitive FNV-1a fingerprint, so cosmetic reflows of the
// same site text don't read as a content change.
export const fingerprintText = (text) => {
    const s = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
};

const wordSet = (text) => new Set(
    String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2),
);

/**
 * Compare the stored website snapshot text against a fresh scrape.
 * `deltaRatio` (0..1) is 1 − Jaccard word overlap — a cheap "how much changed"
 * magnitude so the UI can distinguish a typo fix from a repositioning.
 */
export const detectSourceChange = (prevText, freshText) => {
    const prevFingerprint = fingerprintText(prevText);
    const newFingerprint = fingerprintText(freshText);
    if (prevFingerprint === newFingerprint) {
        return { changed: false, prevFingerprint, newFingerprint, deltaRatio: 0 };
    }
    const a = wordSet(prevText);
    const b = wordSet(freshText);
    let inter = 0;
    for (const w of a) if (b.has(w)) inter += 1;
    const union = a.size + b.size - inter;
    const jaccard = union ? inter / union : 1;
    return {
        changed: true,
        prevFingerprint,
        newFingerprint,
        deltaRatio: Math.round((1 - jaccard) * 100) / 100,
    };
};
