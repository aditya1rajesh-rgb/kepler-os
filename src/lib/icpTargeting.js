// ICP targeting block (E22, from roadmap S9 Gap 1).
//
// The ICP was messaging-complete and targeting-incomplete: pains, triggers,
// blockers and hooks are exactly what a MESSAGE needs, and none of it is
// selectable on an ad platform. `companyType` is free text; LinkedIn, Meta and
// Google all target on employee-count bands. (`companySize` on the brand is OUR
// size, not the target's — a different field entirely.)
//
// Decided shape: a PLATFORM-AGNOSTIC block, with S8's renditions translating it
// into each platform's vocabulary. Same spec/rendition seam already used for ad
// copy (adPlatformSpecs.js), so the ICP stays a readable description of a buyer
// rather than turning into a platform config form.
//
// Blocks E20 and E21 — their renditions cannot produce firmographic targeting
// without these values.

/**
 * Employee-count bands. Deliberately the SAME vocabulary the Apollo prospecting
 * filter already uses, so an ICP and a prospect search do not describe the same
 * company two different ways. The boundaries are LinkedIn's, which is the
 * strictest of the three platforms — coarser sets cannot be split back out.
 */
export const COMPANY_SIZE_BANDS = [
    { id: '1-10', label: '1–10', apollo: '1,10' },
    { id: '11-50', label: '11–50', apollo: '11,50' },
    { id: '51-200', label: '51–200', apollo: '51,200' },
    { id: '201-500', label: '201–500', apollo: '201,500' },
    { id: '501-1000', label: '501–1,000', apollo: '501,1000' },
    { id: '1001-5000', label: '1,001–5,000', apollo: '1001,5000' },
    { id: '5001-10000', label: '5,001–10,000', apollo: '5001,10000' },
    { id: '10001+', label: '10,000+', apollo: '10001,100000' },
];

/** Annual revenue bands, in USD. Coarse on purpose — nobody targets precisely. */
export const REVENUE_BANDS = [
    { id: 'lt-1m', label: 'Under $1M' },
    { id: '1m-10m', label: '$1M–$10M' },
    { id: '10m-50m', label: '$10M–$50M' },
    { id: '50m-250m', label: '$50M–$250M' },
    { id: '250m-1b', label: '$250M–$1B' },
    { id: 'gt-1b', label: 'Over $1B' },
];

/**
 * A coarse, platform-agnostic industry taxonomy.
 *
 * Deliberately ~20 sectors rather than LinkedIn's ~150: this is the ICP's
 * description of who it sells to, and a rendition can fan one sector out to
 * several platform values. Going the other way — collapsing 150 platform values
 * into a readable ICP — is lossy and would make the block unreadable, which is
 * exactly what the spec/rendition seam exists to prevent.
 */
export const INDUSTRIES = [
    { id: 'software', label: 'Software & SaaS' },
    { id: 'it-services', label: 'IT services & consulting' },
    { id: 'financial-services', label: 'Financial services' },
    { id: 'insurance', label: 'Insurance' },
    { id: 'healthcare', label: 'Healthcare & life sciences' },
    { id: 'education', label: 'Education' },
    { id: 'manufacturing', label: 'Manufacturing' },
    { id: 'retail', label: 'Retail & e-commerce' },
    { id: 'real-estate', label: 'Real estate & construction' },
    { id: 'logistics', label: 'Logistics & supply chain' },
    { id: 'telecom', label: 'Telecommunications' },
    { id: 'media', label: 'Media & entertainment' },
    { id: 'hospitality', label: 'Travel & hospitality' },
    { id: 'energy', label: 'Energy & utilities' },
    { id: 'professional-services', label: 'Professional services' },
    { id: 'marketing-agency', label: 'Marketing & advertising' },
    { id: 'nonprofit', label: 'Nonprofit' },
    { id: 'government', label: 'Government & public sector' },
    { id: 'legal', label: 'Legal' },
    { id: 'other', label: 'Other' },
];

/**
 * What each platform can actually target on.
 *
 * The honesty clause from the roadmap's standing principles: where a field
 * cannot be used, the UI says so rather than silently dropping it at push time.
 * Google Ads has no firmographic targeting at all on Search — its B2B reach comes
 * from audiences, not company attributes — and saying that plainly is more
 * useful than an input that quietly does nothing.
 */
export const PLATFORM_TARGETING_SUPPORT = {
    linkedin: {
        label: 'LinkedIn',
        supports: ['companySizeBand', 'industry', 'revenueBand', 'geographyTargets'],
        note: '',
    },
    meta: {
        label: 'Meta',
        supports: ['industry', 'geographyTargets'],
        note: 'No employee-count or revenue targeting — industry maps to interest clusters, which is looser than it sounds.',
    },
    google: {
        label: 'Google Ads',
        supports: ['geographyTargets'],
        note: 'No firmographic targeting on Search. Reach B2B through audiences and keywords instead.',
    },
};

export const TARGETING_FIELDS = ['companySizeBand', 'industry', 'revenueBand', 'geographyTargets'];

export const EMPTY_ICP_TARGETING = {
    companySizeBand: '',
    industry: null,
    revenueBand: '',
    geographyTargets: [],
};

const byId = (list, id) => list.find((x) => x.id === id) ?? null;

const cleanGeoList = (value, max = 10) => {
    const raw = Array.isArray(value)
        ? value
        : String(value ?? '').split(',');
    const out = [];
    const seen = new Set();
    for (const item of raw) {
        const v = String(item ?? '').trim().slice(0, 80);
        if (!v) continue;
        const key = v.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
        if (out.length >= max) break;
    }
    return out;
};

/**
 * Coerce anything into the canonical block, DROPPING values not in the taxonomy.
 *
 * Unknown ids are discarded rather than kept: a value no platform can select is
 * not targeting, it is a note, and the ICP already has free-text fields for
 * notes. Geography stays free text because place names have no useful universal
 * taxonomy — the rendition resolves them per platform.
 */
export const normalizeTargeting = (raw) => {
    const industryId = typeof raw?.industry === 'string' ? raw.industry : raw?.industry?.id;
    const industry = byId(INDUSTRIES, industryId);
    return {
        companySizeBand: byId(COMPANY_SIZE_BANDS, raw?.companySizeBand)?.id ?? '',
        industry: industry ? { id: industry.id, label: industry.label } : null,
        revenueBand: byId(REVENUE_BANDS, raw?.revenueBand)?.id ?? '',
        geographyTargets: cleanGeoList(raw?.geographyTargets),
    };
};

/** Is anything set? Used to tell a usable ICP from a decorative one. */
export const hasTargeting = (targeting) => {
    const t = normalizeTargeting(targeting);
    return Boolean(t.companySizeBand || t.industry || t.revenueBand || t.geographyTargets.length);
};

/**
 * Which fields are filled and which are missing — what E20/E21 need to decide
 * whether a platform rendition can be produced at all.
 */
export const targetingCompleteness = (targeting) => {
    const t = normalizeTargeting(targeting);
    const filled = TARGETING_FIELDS.filter((f) => (
        f === 'geographyTargets' ? t.geographyTargets.length > 0 : Boolean(t[f])
    ));
    return {
        filled,
        missing: TARGETING_FIELDS.filter((f) => !filled.includes(f)),
        complete: filled.length === TARGETING_FIELDS.length,
    };
};

/**
 * The rendition seam: what this block means for one platform.
 *
 * Returns only the fields that platform can act on, plus the ones being dropped
 * and why — so E20/E21 can emit a targeting spec AND tell the operator what will
 * not carry across, before a push discovers it.
 */
export const targetingForPlatform = (platform, targeting) => {
    const support = PLATFORM_TARGETING_SUPPORT[platform];
    if (!support) return null;
    const t = normalizeTargeting(targeting);
    const usable = {};
    const dropped = [];
    for (const field of TARGETING_FIELDS) {
        const value = t[field];
        const isSet = field === 'geographyTargets' ? value.length > 0 : Boolean(value);
        if (!isSet) continue;
        if (support.supports.includes(field)) usable[field] = value;
        else dropped.push(field);
    }
    return { platform, label: support.label, usable, dropped, note: support.note };
};

/** Human labels for a stored block — the read-only view and AI prompt context. */
export const describeTargeting = (targeting) => {
    const t = normalizeTargeting(targeting);
    const parts = [];
    if (t.companySizeBand) parts.push(`${byId(COMPANY_SIZE_BANDS, t.companySizeBand).label} employees`);
    if (t.industry) parts.push(t.industry.label);
    if (t.revenueBand) parts.push(byId(REVENUE_BANDS, t.revenueBand).label);
    if (t.geographyTargets.length) parts.push(t.geographyTargets.join(', '));
    return parts.join(' · ');
};
