import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';
import { getBrandContextForGeneration } from './brandContextService';
import { getGenerationContext } from './generationContextService';
import { PERSUASION_SYSTEM_FRAGMENT } from '../lib/persuasionLayer';
import { getPlatformSpec, validateVariant } from '../lib/adPlatformSpecs';
import { feedbackService } from './feedbackService';

// Ad copy/creative generation. Ports the ads + ad-creative + offers skills:
// the 8-angle engine × copy frameworks, grounded in brand context + ICP +
// confirmed competitors (so comparison/contrarian angles differentiate honestly
// - no Meta Ad Library needed for v1). Persuasion + ethics come from the shared
// persuasion layer; platform char limits are validated IN CODE (validateVariant)
// because the model miscounts. One robust JSON callAI (see [[ai-json-robustness]]).

const AD_SYSTEM_PROMPT = `You are a senior performance-creative strategist for KEPLER OS. You write high-converting paid-ad copy grounded in the provided brand context, ICP, and competitors. Where the context states a GOAL or CAMPAIGN, every variant must serve it — but the goal and its numbers are your brief, never ad copy: do not state them.

${PERSUASION_SYSTEM_FRAGMENT}

ANGLE ENGINE - each variant uses ONE distinct angle (a different reason to click):
- pain_point ("Stop wasting time on X"), outcome ("Achieve Y in Z"), social_proof ("Join N teams who…"), curiosity ("The X most teams miss"), comparison ("Unlike X, we…"), identity ("Built for [role]"), contrarian ("Why [common practice] fails"), urgency (ONLY if a real deadline/limit exists).

COPY FRAMEWORKS (pick what fits the angle): PAS (Problem→Agitate→Solution), BAB (Before→After→Bridge), Feature-Benefit Bridge, Social-Proof Lead, Direct Response.

COMPETITOR DIFFERENTIATION: for comparison/contrarian angles, differentiate honestly from the named competitors using the brand's real edge. Acknowledge competitor strengths; never exaggerate their weaknesses or invent claims.

OUTPUT CONTRACT:
- Respond with ONE raw JSON object matching the requested schema. No markdown, no code fences, no commentary. Double-quoted keys/strings.`;

const ANGLES = ['pain_point', 'outcome', 'social_proof', 'curiosity', 'comparison', 'identity', 'contrarian', 'urgency'];

const buildPrompt = (context, { platform, objective, campaignType, count, competitiveContext = '' }) => {
    const spec = getPlatformSpec(platform);
    const fieldList = Object.entries(spec.fields).map(([f, lim]) => `${f} (≤${lim} chars)`).join(', ');
    const competitiveBlock = competitiveContext
        ? `
LIVE COMPETITOR ADS INTELLIGENCE (Meta Ad Library) - differentiate against these: AVOID the overused patterns and lean into the whitespace gaps. Use this to sharpen the comparison/contrarian angles honestly - never invent competitor claims.
${competitiveContext}
`
        : '';
    return `${context}

Platform: ${spec.label} - ${spec.guidance}
Campaign objective: ${objective || campaignType || 'conversions'}
${competitiveBlock}
Generate ${count} ad variants, each using a DIFFERENT angle from: ${ANGLES.join(', ')}.
Respect these field limits (stay under): ${fieldList}.

Return JSON only:
{"variants":[{
  "angle":"one of the angles above",
  "framework":"PAS | BAB | feature_benefit | social_proof | direct_response",
  "headline":"the headline",
  "primaryText":"the main body copy (omit/blank for google)",
  "description":"short supporting line",
  "cta":"a clear call to action",
  "rationale":"one line: who this speaks to and why it works"
}]}
Keep each field within its char limit. Only use scarcity/urgency or proof that is genuinely supported by the brand context. Do not fabricate stats, customer counts, or deadlines.`;
};

const str = (v, max = 2400) => String(v ?? '').trim().slice(0, max);

const normalizeVariant = (raw, platform) => {
    const headline = str(raw?.headline, 400);
    if (!headline && !str(raw?.primaryText, 4000)) return null;
    const variant = {
        angle: ANGLES.includes(String(raw?.angle)) ? String(raw.angle) : 'outcome',
        framework: str(raw?.framework, 40),
        headline,
        primaryText: str(raw?.primaryText, 4000),
        description: str(raw?.description, 400),
        cta: str(raw?.cta, 120),
        rationale: str(raw?.rationale, 400),
    };
    // Code-side char validation - the trustworthy source for limits.
    return validateVariant(variant, platform);
};

// LinkedIn adjacent-targeting - ports the ads skill's audience-targeting guidance
// (specific stacked titles by seniority, functions to layer, exclusions, proven combos).
const SENIORITY_LEVELS = ['Entry', 'Senior', 'Manager', 'Director', 'VP', 'CXO', 'Partner'];

const LINKEDIN_TARGETING_SYSTEM = `You are a B2B paid-social strategist specializing in LinkedIn Campaign Manager audience targeting for KEPLER OS.

Your job: design ADJACENT job-title targeting - roles beyond the primary buyer that also influence, approve, or hold budget for this purchase - so LinkedIn campaigns reach the full buying committee without wasting spend on the wrong people.

LinkedIn targeting best practice (follow all):
- Be SPECIFIC with titles (e.g. "VP of Supply Chain", not "Operations"). LinkedIn normalizes titles.
- STACK related/adjacent titles that map to the same buying decision.
- Organize titles by SENIORITY, using ONLY: Entry, Senior, Manager, Director, VP, CXO, Partner.
- Job FUNCTIONS are broader than titles - offer a few to layer with seniority.
- EXCLUDE irrelevant titles (interns, students, unrelated departments) to protect spend.
- Ground every suggestion in the brand's actual buyer and value. Never invent roles that would not plausibly buy or influence this product.

OUTPUT CONTRACT: ONE raw JSON object. No markdown, no code fences, no commentary. Double-quoted keys/strings.`;

const buildTargetingPrompt = (context, icpLine) => `${context}

PRIMARY ICP FOR THIS CAMPAIGN:
${icpLine}

Design LinkedIn adjacent-targeting for this campaign. Go BEYOND the primary role - include the wider buying committee (influencers, budget holders, and neighbouring functions that touch this decision).

Return JSON only:
{"adjacentTitles":[{"title":"specific LinkedIn job title","seniority":"Entry|Senior|Manager|Director|VP|CXO|Partner","why":"one line: why this role influences or funds this purchase"}],
"jobFunctions":["broader LinkedIn job functions to layer with seniority"],
"exclusions":["titles/roles to exclude to protect spend"],
"recommendedCombination":"one proven LinkedIn targeting combo, e.g. 'Company size 51-200 + Director/VP + Function: Operations'"}

Provide 8-12 SPECIFIC adjacent titles spanning the relevant seniorities (not just the primary role). Stack closely-related titles. Only include roles that plausibly influence or buy this product given the brand context. Use only the allowed seniority values.`;

const normalizeTargeting = (raw) => {
    const list = Array.isArray(raw?.adjacentTitles) ? raw.adjacentTitles : [];
    const adjacentTitles = list
        .map((t) => ({
            title: str(t?.title, 120),
            seniority: SENIORITY_LEVELS.includes(String(t?.seniority)) ? String(t.seniority) : '',
            why: str(t?.why, 240),
        }))
        .filter((t) => t.title)
        .slice(0, 16);
    const jobFunctions = (Array.isArray(raw?.jobFunctions) ? raw.jobFunctions : [])
        .map((f) => str(f, 80))
        .filter(Boolean)
        .slice(0, 10);
    const exclusions = (Array.isArray(raw?.exclusions) ? raw.exclusions : [])
        .map((e) => str(e, 80))
        .filter(Boolean)
        .slice(0, 10);
    return {
        adjacentTitles,
        jobFunctions,
        exclusions,
        recommendedCombination: str(raw?.recommendedCombination, 240),
    };
};

// Competitor-ad analysis - ports the competitor-profiling skill (facts over
// opinions, structured + comparable, find the gaps) onto live Meta Ad Library
// results. Produces a read + a grounding brief that feeds generateAdVariants.
const COMPETITOR_ADS_SYSTEM = `You are a competitive creative analyst for KEPLER OS. You analyze competitors' LIVE ads (from the Meta Ad Library) to produce a structured, factual read that grounds differentiated creative.

METHODOLOGY (competitor-profiling):
- FACTS OVER OPINIONS: base every extraction on the ad's actual text. Never invent claims, metrics, or offers the ad does not state. If something is not present, leave it blank.
- STRUCTURED + COMPARABLE: read every ad the same way.
- FIND THE GAPS: across the set, name the angles/offers competitors OVERUSE (clichés to avoid) and the WHITESPACE they leave (opportunities to own).

OUTPUT CONTRACT: ONE raw JSON object. No markdown, no code fences, no commentary. Double-quoted keys/strings.`;

const buildCompetitorAdsPrompt = (adsText) => `Competitors' live ads (from the Meta Ad Library):
${adsText}

Return JSON only:
{"ads":[{"pageName":"advertiser","angle":"primary angle","hook":"opening hook","offer":"offer/CTA if stated","format":"e.g. testimonial, demo, discount, feature-led"}],
"overusedPatterns":["angles/claims/offers most of them repeat - clichés to AVOID"],
"gaps":["angles/offers/positioning NONE of them use - whitespace to OWN"],
"recommendation":"2-3 sentences: how KEPLER's creative should differentiate against this set, honestly."}

Base everything on the ad text above. Do not fabricate. If the set is thin, say so in the recommendation.`;

export const adGenerationService = {
    /**
     * Generate ad variants for a campaign config.
     * @param {string} workspaceId
     * @param {object} config
     * @param {'google'|'meta'|'linkedin'|'multi'} config.platform
     * @param {string} [config.objective] campaign goal
     * @param {string} [config.campaignType]
     * @param {number} [config.count] variants to generate (default 5)
     * @returns {Promise<{ok:boolean, variants?:object[], error?:string, modelUsed?:string}>}
     */
    generateAdVariants: async (workspaceId, { platform = 'multi', objective = '', campaignType = '', count = 5, competitiveContext = '', campaignId = null, stepId = '' } = {}) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };

        let brandContext;
        try {
            // 'ads' module emphasis: value prop, differentiators, proof points, ICP —
            // now under the E3 ladder, so the copy serves the goal the campaign
            // reports to rather than only sounding like the brand.
            brandContext = await getGenerationContext(workspaceId, {
                module: 'ads',
                depth: 'profile',
                topic: `${objective} ${campaignType}`.trim(),
                campaignId,
                stepId,
            });
        } catch (err) {
            return { ok: false, error: `Could not load brand context: ${err.message}` };
        }
        if (!brandContext.meta.hasBrand) {
            return { ok: false, errorKind: 'insufficient_context', error: 'Add a brand profile in Brand Intelligence before generating ads.' };
        }

        const guidance = await feedbackService.getGuidance(workspaceId, 'ads');

        let response;
        try {
            response = await callAI(buildPrompt(brandContext.prompt + guidance, { platform, objective, campaignType, count, competitiveContext }), {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                includeModelMeta: true,
                maxTokens: 3000,
                temperature: 0.7,
                systemPrompt: AD_SYSTEM_PROMPT,
            });
        } catch (err) {
            return { ok: false, error: `Ad generation failed: ${err.message}` };
        }

        const rawList = Array.isArray(response?.content?.variants) ? response.content.variants : [];
        const variants = rawList.map((v) => normalizeVariant(v, platform)).filter(Boolean);
        if (variants.length === 0) {
            return { ok: false, errorKind: 'empty_content', error: 'The AI returned no usable ad variants. Try a different objective or enrich the brand profile.' };
        }

        return {
            ok: true,
            variants,
            platform,
            modelUsed: response?.modelUsed ?? null,
            groundedIn: brandContext.meta.groundedIn,
        };
    },

    /**
     * LinkedIn adjacent job-title targeting - the wider buying committee beyond the
     * primary ICP (influencers + budget holders + neighbouring functions), organized
     * by seniority per the ads skill's targeting guidance. Grounded in brand + ICP.
     * @param {string} workspaceId
     * @param {object} [opts]
     * @param {object} [opts.icp] selected persona (role/titles/companyType/painPoints)
     * @returns {Promise<{ok:boolean, targeting?:object, error?:string, modelUsed?:string}>}
     */
    generateLinkedInTargeting: async (workspaceId, { icp = null } = {}) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };

        let brandContext;
        try {
            brandContext = await getBrandContextForGeneration(workspaceId, { module: 'ads', depth: 'profile' });
        } catch (err) {
            return { ok: false, error: `Could not load brand context: ${err.message}` };
        }
        if (!brandContext.meta.hasBrand) {
            return { ok: false, errorKind: 'insufficient_context', error: 'Add a brand profile before generating targeting.' };
        }

        const icpLine = icp
            ? [
                icp.role || icp.segment,
                icp.titles?.length ? `Current titles: ${icp.titles.join(', ')}` : '',
                icp.companyType ? `Company type: ${icp.companyType}` : '',
                icp.painPoints ? `Pains: ${icp.painPoints}` : '',
            ].filter(Boolean).join('\n')
            : 'No specific ICP selected - infer the primary B2B buyer from the brand context.';

        let response;
        try {
            response = await callAI(buildTargetingPrompt(brandContext.prompt, icpLine), {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                includeModelMeta: true,
                maxTokens: 1500,
                temperature: 0.6,
                systemPrompt: LINKEDIN_TARGETING_SYSTEM,
            });
        } catch (err) {
            return { ok: false, error: `Targeting generation failed: ${err.message}` };
        }

        const targeting = normalizeTargeting(response?.content ?? {});
        if (targeting.adjacentTitles.length === 0) {
            return { ok: false, errorKind: 'empty_content', error: 'No targeting suggestions returned. Try enriching the ICP or brand profile.' };
        }
        return { ok: true, targeting, modelUsed: response?.modelUsed ?? null };
    },

    /**
     * Analyze competitors' live ads (Meta Ad Library) into a structured read +
     * a grounding brief. Facts-over-opinions per the competitor-profiling skill.
     * @param {string} workspaceId
     * @param {object[]} ads normalized Meta Ad Library ads ({ pageName, bodies, titles, descriptions })
     * @returns {Promise<{ok:boolean, read?:object, groundingBrief?:string, error?:string}>}
     */
    analyzeCompetitorAds: async (workspaceId, ads = []) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };
        const items = (Array.isArray(ads) ? ads : []).slice(0, 25);
        if (!items.length) return { ok: false, error: 'No competitor ads to analyze.' };

        const adsText = items.map((a, i) => {
            const copy = [...(a.bodies ?? []), ...(a.titles ?? []), ...(a.descriptions ?? [])]
                .filter(Boolean).join(' | ').slice(0, 600);
            return `${i + 1}. [${a.pageName || 'Unknown advertiser'}] ${copy || '(no ad text captured)'}`;
        }).join('\n');

        let response;
        try {
            response = await callAI(buildCompetitorAdsPrompt(adsText), {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                includeModelMeta: true,
                maxTokens: 2000,
                temperature: 0.4,
                systemPrompt: COMPETITOR_ADS_SYSTEM,
            });
        } catch (err) {
            return { ok: false, error: `Competitor analysis failed: ${err.message}` };
        }

        const c = response?.content ?? {};
        const read = {
            ads: (Array.isArray(c.ads) ? c.ads : [])
                .map((a) => ({
                    pageName: str(a?.pageName, 120),
                    angle: str(a?.angle, 120),
                    hook: str(a?.hook, 240),
                    offer: str(a?.offer, 160),
                    format: str(a?.format, 80),
                }))
                .filter((a) => a.angle || a.hook)
                .slice(0, 25),
            overusedPatterns: (Array.isArray(c.overusedPatterns) ? c.overusedPatterns : [])
                .map((x) => str(x, 200)).filter(Boolean).slice(0, 8),
            gaps: (Array.isArray(c.gaps) ? c.gaps : [])
                .map((x) => str(x, 200)).filter(Boolean).slice(0, 8),
            recommendation: str(c.recommendation, 800),
        };
        // Grounding brief fed into generateAdVariants(competitiveContext).
        const groundingBrief = [
            read.overusedPatterns.length ? `Overused by competitors (avoid): ${read.overusedPatterns.join('; ')}.` : '',
            read.gaps.length ? `Whitespace to own: ${read.gaps.join('; ')}.` : '',
            read.recommendation ? `Differentiation: ${read.recommendation}` : '',
        ].filter(Boolean).join('\n');

        return { ok: true, read, groundingBrief, modelUsed: response?.modelUsed ?? null };
    },
};

export default adGenerationService;
