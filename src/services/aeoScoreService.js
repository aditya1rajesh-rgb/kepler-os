import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';

// Consolidated AEO / citability scorer. Replaces the four overlapping scorers
// across the SEO/GEO skills with ONE canonical rubric: cheap, exact mechanical
// signals computed in code + a single Gemini judgment call for the qualitative
// dimensions, composited deterministically. Scores any content (blog draft now;
// any page later). Dimensions follow the citability research (134-167-word
// self-contained, answer-first, fact-rich passages get cited by AI engines).

const DIMENSION_MAX = {
    answerBlock: 30,     // sections open with a direct ~40-60 word answer
    selfContainment: 25, // passages stand alone (low pronoun density, named entities)
    structure: 20,       // headings, lists, scannability
    statDensity: 15,     // concrete numbers/stats (brand may be low - that's honest)
    uniqueness: 10,      // original insight vs. generic filler
};
const TOTAL_MAX = Object.values(DIMENSION_MAX).reduce((a, b) => a + b, 0); // 100

const PRONOUNS = new Set(['it', 'they', 'them', 'this', 'that', 'these', 'those', 'he', 'she', 'its', 'their']);

const stripMarkdown = (md) =>
    String(md ?? '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[#>*_`-]/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();

/** Deterministic, reproducible signals - fed to the model as evidence and shown to the user. */
const computeSignals = (markdown, { title = '', metaDescription = '' } = {}) => {
    const text = stripMarkdown(markdown);
    const words = text.split(/\s+/).filter(Boolean);
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const headings = (String(markdown).match(/^#{2,3}\s+/gm) || []).length;
    const lists = (String(markdown).match(/^\s*[-*]\s+/gm) || []).length;
    const statMatches = (text.match(/\b\d[\d,.]*%?\b|\$\d[\d,.]*/g) || []).length;
    const pronounCount = words.filter((w) => PRONOUNS.has(w.toLowerCase())).length;
    const pronounRatio = words.length ? Number((pronounCount / words.length).toFixed(3)) : 0;

    return {
        wordCount: words.length,
        sentenceCount: sentences.length,
        headingCount: headings,
        listCount: lists,
        statCount: statMatches,
        statDensityPer100Words: words.length ? Number(((statMatches / words.length) * 100).toFixed(2)) : 0,
        pronounRatio,
        titleLength: title.length,
        titleLengthOk: title.length >= 40 && title.length <= 65,
        metaDescriptionLength: metaDescription.length,
        metaDescriptionOk: metaDescription.length >= 120 && metaDescription.length <= 165,
    };
};

const clampDim = (v, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(Math.round(n), max));
};

const grade = (overall) =>
    overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : overall >= 40 ? 'D' : 'F';

const buildPrompt = (markdown, signals) => `Score this content for AI-citation readiness (AEO/GEO) - how likely AI answer engines (ChatGPT, Perplexity, AI Overviews) are to extract and cite it.

Pre-computed signals (already measured - use as evidence, do not recompute):
${JSON.stringify(signals, null, 2)}

CONTENT:
${stripMarkdown(markdown).slice(0, 10000)}

Score each dimension out of its max and list specific, actionable recommendations. Return JSON only:
{"dimensions":{"answerBlock":0,"selfContainment":0,"structure":0,"statDensity":0,"uniqueness":0},
 "recommendations":["..."]}
Maxes: answerBlock 30 (sections open with a direct 40-60 word answer), selfContainment 25 (passages stand alone, few vague pronouns, named entities), structure 20 (clear headings, lists, scannable), statDensity 15 (concrete facts/numbers - score honestly, do not reward fabrication), uniqueness 10 (original insight vs. generic filler).`;

export const aeoScoreService = {
    /**
     * Score content for AI-citation readiness.
     * @returns {Promise<{ok:boolean, overall?:number, grade?:string, dimensions?:object, signals?:object, recommendations?:string[], error?:string}>}
     */
    scoreContent: async ({ markdown, title = '', metaDescription = '' }) => {
        if (!String(markdown ?? '').trim()) return { ok: false, error: 'No content to score.' };

        const signals = computeSignals(markdown, { title, metaDescription });

        let content;
        try {
            content = await callAI(buildPrompt(markdown, signals), {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                maxTokens: 1200,
                temperature: 0.2,
                systemPrompt: 'You are a precise AEO/GEO analyst. Return only the requested JSON.',
            });
        } catch (err) {
            return { ok: false, error: `AEO scoring failed: ${err.message}`, signals };
        }

        const d = content?.dimensions ?? {};
        const dimensions = {
            answerBlock: clampDim(d.answerBlock, DIMENSION_MAX.answerBlock),
            selfContainment: clampDim(d.selfContainment, DIMENSION_MAX.selfContainment),
            structure: clampDim(d.structure, DIMENSION_MAX.structure),
            statDensity: clampDim(d.statDensity, DIMENSION_MAX.statDensity),
            uniqueness: clampDim(d.uniqueness, DIMENSION_MAX.uniqueness),
        };
        // Composite computed in code - deterministic given the sub-scores.
        const overall = Object.values(dimensions).reduce((a, b) => a + b, 0);

        return {
            ok: true,
            overall,
            outOf: TOTAL_MAX,
            grade: grade(overall),
            dimensions,
            dimensionMax: DIMENSION_MAX,
            signals,
            recommendations: Array.isArray(content?.recommendations)
                ? content.recommendations.map((r) => String(r).trim()).filter(Boolean)
                : [],
        };
    },
};

export default aeoScoreService;
