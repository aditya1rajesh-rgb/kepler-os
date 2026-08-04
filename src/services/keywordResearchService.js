import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';
import { getBrandContextForGeneration } from './brandContextService';
import { groundingService, groundedContextBlock } from './groundingService';
import { classifyMoneyType } from '../lib/buyIntent';
import { capabilityService } from './capabilityService';
import { serpMetricsService } from './serpMetricsService';

// Keyword research generation. Ports the methodology from the SEO+GEO full-stack
// skill (8-phase: discover → expand → classify intent → score → GEO-check →
// cluster) into a single Gemini JSON call grounded in the brand context + ICPs.
//
// CRITICAL - anti-fabrication: search volume and keyword difficulty require a
// real data source (Search Console / Ahrefs) we have not connected yet. The
// model MUST NOT invent them. It returns keyword ideas with intent, tier, GEO
// flags, and clusters, leaving metrics null with metric_status:"estimated".
// When a metrics connector lands later, volumes are injected and opportunity
// scores computed in code (see computeOpportunity).

const KEYWORD_SYSTEM_PROMPT = `You are an SEO/GEO keyword strategist for KEPLER OS.
Ground every suggestion in the provided brand context and ICPs, and use your knowledge of the brand's market category to expand realistic search terms.
Only suggest keywords a searcher would plausibly type and that this brand can credibly create content for.

HARD RULES:
- NEVER invent search volume, keyword difficulty, traffic, or any numeric metric. Leave them null and set metric_status to "estimated".
- Do not fabricate competitor names or statistics.
- Prefer specific, long-tail, intent-rich terms over generic head terms.
- Avoid generic filler words (leverage, robust, seamless, unlock, elevate, landscape, delve, navigate, realm, tapestry).

OUTPUT CONTRACT (must follow exactly):
- Respond with ONE raw JSON object matching the requested schema.
- No markdown, no code fences, no commentary.
- Double-quoted keys/strings. Include every key; use "" or [] or null for unknowns.`;

// Intent → value weighting for the Opportunity score (from the skill).
const INTENT_VALUE = { informational: 1, navigational: 1, commercial: 2, transactional: 3 };
const VALID_INTENTS = Object.keys(INTENT_VALUE);
const VALID_TIERS = ['quick_win', 'growth', 'long_term', 'research'];

const buildKeywordPrompt = (context, { seedTopics, count }) => `${context}

${seedTopics?.length ? `Seed topics to prioritize: ${seedTopics.join(', ')}` : 'Derive seed topics from the brand offering and ICPs above.'}

Return JSON only:
{"executiveSummary":"2-3 sentence summary of the keyword opportunity for this brand",
 "keywords":[{
   "term":"the search query",
   "intent":"informational | navigational | commercial | transactional",
   "tier":"quick_win | growth | long_term | research",
   "volume":null,
   "difficulty":null,
   "metricStatus":"estimated",
   "rationale":"why this fits the brand and audience",
   "geo":{"isCandidate":true,"type":"question | definition | comparison | list | how-to | none","recommendedFormat":"e.g. how-to guide, comparison page, FAQ"}
 }],
 "clusters":[{"pillar":"pillar topic","clusterTerms":["supporting keyword","..."]}],
 "contentCalendar":[{"month":"Month 1","contentTitle":"working title","targetKeyword":"primary keyword","type":"blog | comparison | guide | landing"}]}

PRIORITIZE buy-intent decision queries — "[product] alternatives", "[product] vs [competitor]", pricing/cost, reviews, free trial, and "best [category] for [ICP]" — these sit closest to revenue. At least half your suggestions should be buy-intent terms this brand can credibly target; fill the rest with supporting informational/cluster terms.
Suggest up to ${count} keywords. Group them into 2-5 topic clusters (pillar + supporting terms). Mark GEO candidates (questions, definitions, comparisons, lists, how-tos that AI answer engines cite). Assign tier by opportunity: quick_win (high intent, likely low competition), growth (broader/higher competition), long_term (competitive head terms), research (exploratory). Remember: volume and difficulty stay null.`;

/** Opportunity = (Volume × IntentValue) / Difficulty - only when real metrics exist. */
const computeOpportunity = (volume, difficulty, intent) => {
    if (typeof volume !== 'number' || typeof difficulty !== 'number' || difficulty <= 0) return null;
    const intentValue = INTENT_VALUE[intent] ?? 1;
    return Number(((volume * intentValue) / difficulty).toFixed(2));
};

const str = (v, max = 400) => String(v ?? '').trim().slice(0, max);
const oneOf = (v, allowed, fallback) => (allowed.includes(String(v)) ? String(v) : fallback);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const normalizeKeyword = (raw) => {
    const term = str(raw?.term, 160);
    if (!term) return null;
    const intent = oneOf(raw?.intent, VALID_INTENTS, 'informational');
    const volume = num(raw?.volume);
    const difficulty = num(raw?.difficulty);
    const geo = raw?.geo ?? {};
    return {
        term,
        // Deterministic buy-intent classification (WS2) — reliable regardless of
        // how the model labels intent; drives the asset router + Money Keywords tier.
        moneyType: classifyMoneyType(term),
        intent,
        intentValue: INTENT_VALUE[intent] ?? 1,
        tier: oneOf(raw?.tier, VALID_TIERS, 'research'),
        volume,
        difficulty,
        // Trust the model's null/"estimated"; only "measured" when a metric is actually present.
        metricStatus: volume !== null || difficulty !== null ? 'measured' : 'estimated',
        opportunityScore: computeOpportunity(volume, difficulty, intent),
        rationale: str(raw?.rationale, 600),
        geo: {
            isCandidate: Boolean(geo?.isCandidate),
            type: oneOf(geo?.type, ['question', 'definition', 'comparison', 'list', 'how-to', 'none'], 'none'),
            recommendedFormat: str(geo?.recommendedFormat, 120),
        },
    };
};

const normalizeResult = (content) => ({
    executiveSummary: str(content?.executiveSummary, 800),
    keywords: (Array.isArray(content?.keywords) ? content.keywords : [])
        .map(normalizeKeyword)
        .filter(Boolean),
    clusters: (Array.isArray(content?.clusters) ? content.clusters : [])
        .map((c) => ({
            pillar: str(c?.pillar, 160),
            clusterTerms: (Array.isArray(c?.clusterTerms) ? c.clusterTerms : []).map((t) => str(t, 160)).filter(Boolean),
        }))
        .filter((c) => c.pillar || c.clusterTerms.length),
    contentCalendar: (Array.isArray(content?.contentCalendar) ? content.contentCalendar : [])
        .map((i) => ({
            month: str(i?.month, 40),
            contentTitle: str(i?.contentTitle, 200),
            targetKeyword: str(i?.targetKeyword, 160),
            type: oneOf(i?.type, ['blog', 'comparison', 'guide', 'landing'], 'blog'),
        }))
        .filter((i) => i.contentTitle || i.targetKeyword),
});

export const keywordResearchService = {
    /**
     * Generate keyword research grounded in the brand profile + ICPs.
     * @param {string} workspaceId
     * @param {object} [opts]
     * @param {string[]} [opts.seedTopics] optional seed topics to prioritize
     * @param {number} [opts.count] max keywords (default 20)
     * @returns {Promise<{ok:boolean, result?:object, error?:string, modelUsed?:string}>}
     */
    generate: async (workspaceId, { seedTopics = [], count = 20 } = {}) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };

        let brandContext;
        try {
            // depth 'profile' includes the structured brand profile + ICPs (no raw files needed for keyword ideation).
            brandContext = await getBrandContextForGeneration(workspaceId, { module: 'blog', depth: 'profile' });
        } catch (err) {
            return { ok: false, error: `Could not load brand context: ${err.message}` };
        }

        if (!brandContext.meta.hasBrand) {
            return {
                ok: false,
                errorKind: 'insufficient_context',
                error: 'Add a brand overview or value proposition in Brand Intelligence before generating keywords.',
            };
        }

        // WS1b — grounded research on the live search landscape (pure upside;
        // degrades to ungrounded). Gives the model REAL buyer queries/comparisons
        // instead of model recall. Volume/difficulty still stay null (that's WS1c).
        const research = await groundingService.research(
            `Research the current search and AI-answer landscape for this business so we can pick REAL keywords buyers use.\n\n${brandContext.prompt}\n${seedTopics?.length ? `Focus topics: ${seedTopics.join(', ')}.\n` : ''}Report the actual queries, questions, and comparisons people search in this category, the "alternatives / vs / pricing / reviews / free trial" buy-intent phrases that genuinely exist, terms competitors rank for, and content formats that currently win. Real terms only.`,
        );
        const groundedCtx = groundedContextBlock(research.brief);

        let response;
        try {
            response = await callAI(buildKeywordPrompt(brandContext.prompt + groundedCtx, { seedTopics, count }), {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                includeModelMeta: true,
                maxTokens: 6000,
                temperature: 0.4,
                systemPrompt: KEYWORD_SYSTEM_PROMPT,
            });
        } catch (err) {
            return { ok: false, error: `Keyword generation failed: ${err.message}` };
        }

        const result = normalizeResult(response?.content ?? {});
        if (result.keywords.length === 0) {
            return { ok: false, errorKind: 'empty_content', error: 'The AI returned no usable keywords. Try adding seed topics or enriching the brand profile.' };
        }

        // WS1c — inject REAL volume/difficulty when a SERP metrics provider is
        // configured (DataForSEO), activating the opportunity score. getPlatform()
        // is cached; metrics are pure upside — a failure never sinks generation.
        let metricsApplied = false;
        try {
            const platform = await capabilityService.getPlatform();
            if (platform.serp_metrics) {
                const metrics = await serpMetricsService.fetch(result.keywords.map((k) => k.term));
                if (metrics && Object.keys(metrics).length) {
                    result.keywords = result.keywords.map((k) => {
                        const m = metrics[String(k.term).toLowerCase()];
                        if (!m) return k;
                        const volume = typeof m.volume === 'number' ? m.volume : k.volume;
                        const difficulty = typeof m.difficulty === 'number' ? m.difficulty : k.difficulty;
                        return {
                            ...k,
                            volume,
                            difficulty,
                            cpc: typeof m.cpc === 'number' ? m.cpc : null,
                            competition: typeof m.competition === 'number' ? m.competition : null,
                            metricStatus: volume !== null || difficulty !== null ? 'measured' : k.metricStatus,
                            opportunityScore: computeOpportunity(volume, difficulty, k.intent),
                        };
                    });
                    metricsApplied = result.keywords.some((k) => k.metricStatus === 'measured');
                }
            }
        } catch { /* metrics are pure upside — never sink keyword generation */ }

        return { ok: true, result, modelUsed: response?.modelUsed ?? null, grounded: research.ok, sources: research.sources, metricsApplied };
    },
};

export default keywordResearchService;
