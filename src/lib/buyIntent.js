// Buy-intent classification + asset routing (WS2).
//
// The empirical routing rules come from a 1,000-query win analysis (source 7):
// which asset actually RANKS for each decision query — crucially including when
// the winning move is NOT to publish your own page (alternatives + reviews are
// won off-domain). This is the "knows when not to publish" intelligence.
//
// Pure + unit-tested. Deterministic classification is the reliable backstop
// regardless of what the model labels; later (WS1c) real SERP evidence can
// override these priors per query.

export const MONEY_TYPES = ['comparison', 'alternatives', 'pricing', 'reviews', 'trial', 'discount', 'best_for'];

// Ordered patterns — first match wins (comparison before alternatives so "X vs Y"
// isn't miscas alternatives; specific before general).
const PATTERNS = [
    ['comparison', /\bvs\.?\b|\bversus\b|\bcompared? to\b/i],
    ['alternatives', /\balternativ\w*\b|\bcompetitors?\b|\bsimilar to\b/i],
    ['reviews', /\breviews?\b|\bratings?\b|\btestimonials?\b|\bis .+\b(good|legit|worth it|any good)\b/i],
    ['trial', /\bfree trial\b|\bfree plan\b|\bdemo\b|\bsign ?up\b|\bget started\b/i],
    ['discount', /\bdiscounts?\b|\bcoupons?\b|\bpromo\b|\bdeals?\b/i],
    ['pricing', /\bpricing\b|\bprices?\b|\bcosts?\b|\bhow much\b|\bcheap(est)?\b|\bper month\b|\/mo\b/i],
    ['best_for', /\bbest\b.*\bfor\b|\btop \d+\b|\bbest (\w+ )?(tools?|software|apps?|platforms?|services?)\b/i],
];

/** Classify a search term's buy-intent decision type ('none' = informational/other). */
export const classifyMoneyType = (term) => {
    const t = String(term ?? '').toLowerCase().trim();
    if (!t) return 'none';
    for (const [type, re] of PATTERNS) if (re.test(t)) return type;
    return 'none';
};

export const isMoneyKeyword = (termOrKeyword) =>
    classifyMoneyType(typeof termOrKeyword === 'string' ? termOrKeyword : termOrKeyword?.term) !== 'none';

// Routing table: for each decision type, the empirically-winning asset + whether
// to build your OWN ranking page (publish) or win it off-domain. `publish:false`
// is the deliberate "don't self-publish — do this instead" call.
const ROUTING = {
    comparison: {
        recommendation: 'build_comparison', assetType: 'Comparison page (X vs Y)', publish: true,
        rationale: '71% of "X vs Y" winners are one of the two brands — winnable on your own domain.',
        action: 'Build an honest, specific comparison page. Median winners needed only ~2 backlinks.',
    },
    pricing: {
        recommendation: 'single_pricing_page', assetType: 'One pricing page', publish: true,
        rationale: 'Pricing + cost queries rank the same page 92% of the time — one strong page, not three.',
        action: 'Build/strengthen a single pricing page with real numbers; do not split pricing vs cost.',
    },
    trial: {
        recommendation: 'conversion_page', assetType: 'Free-trial landing page', publish: true,
        rationale: '89% of free-trial winners put the CTA above the fold.',
        action: 'Build a conversion-focused trial page with the primary CTA above the fold.',
    },
    best_for: {
        recommendation: 'build_guide', assetType: 'Definitive "best X for Y" guide', publish: true,
        rationale: 'Segment-specific "best for" guides are winnable with genuine depth + first-hand proof.',
        action: 'Write a specific, evidence-backed guide for that exact segment; add real screenshots/limits.',
    },
    discount: {
        recommendation: 'offer_page', assetType: 'Offer / deal page', publish: true,
        rationale: 'Discount-intent traffic converts if you actually run an offer.',
        action: 'Publish a clear deal page only if a real offer exists; otherwise skip.',
    },
    alternatives: {
        recommendation: 'seek_placement', assetType: 'Third-party placement (not your own page)', publish: false,
        rationale: '84% of "alternatives" winners rank OFF your domain (listicles) — a self-published alternatives page rarely wins.',
        action: 'Pursue placements: get onto existing "alternatives" listicles and earn ~3 backlinks, rather than building your own.',
    },
    reviews: {
        recommendation: 'off_site_proof', assetType: 'Off-site proof (G2 / Capterra / third-party)', publish: false,
        rationale: 'Two-thirds of review-query winners are NOT the product\'s own site — you need outside proof.',
        action: 'Drive verified reviews to G2/Capterra/Trustpilot and earn third-party coverage; a self-review page will not rank.',
    },
    none: {
        recommendation: 'build_guide', assetType: 'Supporting guide / blog', publish: true,
        rationale: 'Informational query — supports the topic cluster and top-of-funnel demand.',
        action: 'Write a helpful guide if it strengthens a cluster; prioritize buy-intent pages first.',
    },
};

/**
 * Route a keyword (string or keyword object) to its recommended asset.
 * @returns {{moneyType, recommendation, assetType, publish, rationale, action}}
 */
export const routeAsset = (keyword) => {
    const term = typeof keyword === 'string' ? keyword : keyword?.term;
    const moneyType = classifyMoneyType(term);
    return { moneyType, ...(ROUTING[moneyType] ?? ROUTING.none) };
};

/**
 * Route a list of keywords: enrich each with its routing, and split into what to
 * build vs. what to win off-domain (don't self-publish). Pure.
 */
export const routeKeywords = (keywords = []) => {
    const routed = keywords.map((kw) => ({ ...kw, routing: routeAsset(kw) }));
    return {
        routed,
        toBuild: routed.filter((k) => k.routing.publish),
        offDomain: routed.filter((k) => !k.routing.publish),
        moneyCount: routed.filter((k) => k.routing.moneyType !== 'none').length,
    };
};

export const MONEY_TYPE_LABELS = {
    comparison: 'Comparison', alternatives: 'Alternatives', pricing: 'Pricing',
    reviews: 'Reviews', trial: 'Free trial', discount: 'Discount', best_for: 'Best-for', none: 'Informational',
};
