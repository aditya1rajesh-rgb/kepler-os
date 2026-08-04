import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';
import { computeAeoSignals, stripMarkdown } from '../lib/aeoSignals';

// Consolidated AEO / citability scorer. Deterministic Princeton-grounded signals
// (src/lib/aeoSignals.js — cheap, exact, reproducible) + ONE Gemini judgment for
// the qualitative dimensions, composited in code. Rubric weights follow the GEO
// study levers (KDD 2024): citing real sources is the single biggest driver of
// AI citation, then statistics, then self-contained/quotable passages; keyword
// stuffing is penalized. The mechanical signals reduce reliance on model
// self-grading — the numbers are computed, not guessed.

const DIMENSION_MAX = {
    answerBlock: 25,      // sections open with a direct ~40-60 word answer
    citations: 20,        // cites real sources + quotes authorities (Princeton's biggest lever, +40%)
    selfContainment: 18,  // passages stand alone (low pronoun density, named entities)
    statDensity: 15,      // concrete numbers/stats (+37%) — honest, never rewards fabrication
    structure: 12,        // headings, lists, scannability
    uniqueness: 10,       // original insight vs. generic filler
};
const TOTAL_MAX = Object.values(DIMENSION_MAX).reduce((a, b) => a + b, 0); // 100
const STUFFING_PENALTY = 0.9; // Princeton GEO: keyword stuffing ≈ −10% citation likelihood

const clampDim = (v, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(Math.round(n), max));
};

const grade = (overall) =>
    overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : overall >= 40 ? 'D' : 'F';

const buildPrompt = (markdown, signals) => `Score this content for AI-citation readiness (AEO/GEO) - how likely AI answer engines (ChatGPT, Perplexity, AI Overviews) are to extract and cite it.

Proven levers that INCREASE AI citation (Princeton GEO study): citing real sources, including statistics, quoting authorities, and a confident authoritative tone. Keyword stuffing DECREASES it.

Pre-computed signals (already measured - use as evidence, do not recompute):
${JSON.stringify(signals, null, 2)}

CONTENT:
${stripMarkdown(markdown).slice(0, 10000)}

Score each dimension out of its max and list specific, actionable recommendations. Return JSON only:
{"dimensions":{"answerBlock":0,"citations":0,"selfContainment":0,"statDensity":0,"structure":0,"uniqueness":0},
 "recommendations":["..."]}
Maxes: answerBlock 25 (sections open with a direct 40-60 word answer), citations 20 (cites/links real sources and quotes authorities - the biggest AI-citation lever), selfContainment 18 (passages stand alone, few vague pronouns, named entities), statDensity 15 (concrete facts/numbers - score honestly, do not reward fabrication), structure 12 (clear headings, lists, scannable), uniqueness 10 (original insight vs. generic filler).`;

export const aeoScoreService = {
    /**
     * Score content for AI-citation readiness.
     * @returns {Promise<{ok:boolean, overall?:number, grade?:string, dimensions?:object, signals?:object, recommendations?:string[], error?:string}>}
     */
    scoreContent: async ({ markdown, title = '', metaDescription = '' }) => {
        if (!String(markdown ?? '').trim()) return { ok: false, error: 'No content to score.' };

        const signals = computeAeoSignals(markdown, { title, metaDescription });

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
            citations: clampDim(d.citations, DIMENSION_MAX.citations),
            selfContainment: clampDim(d.selfContainment, DIMENSION_MAX.selfContainment),
            statDensity: clampDim(d.statDensity, DIMENSION_MAX.statDensity),
            structure: clampDim(d.structure, DIMENSION_MAX.structure),
            uniqueness: clampDim(d.uniqueness, DIMENSION_MAX.uniqueness),
        };
        // Composite computed in code - deterministic given the sub-scores.
        let overall = Object.values(dimensions).reduce((a, b) => a + b, 0);

        const recommendations = Array.isArray(content?.recommendations)
            ? content.recommendations.map((r) => String(r).trim()).filter(Boolean)
            : [];

        // Princeton keyword-stuffing penalty (deterministic, not model-guessed).
        if (signals.keywordStuffed) {
            overall = Math.round(overall * STUFFING_PENALTY);
            recommendations.unshift(`Reduce keyword stuffing — "${signals.topWord}" is over-repeated (${Math.round(signals.topWordRatio * 100)}% of meaningful words); AI engines down-rank stuffed text.`);
        }

        return {
            ok: true,
            overall,
            outOf: TOTAL_MAX,
            grade: grade(overall),
            dimensions,
            dimensionMax: DIMENSION_MAX,
            signals,
            recommendations,
        };
    },
};

export default aeoScoreService;
