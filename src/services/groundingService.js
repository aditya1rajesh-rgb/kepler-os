import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';

// Real-web grounding helper (WS1b). Vertex Gemini can't combine Google Search
// grounding with forced-JSON in ONE call (grounding ⊥ json, see aiClient.js and
// [[gemini-grounding-pipeline]]), so grounded generation runs TWO calls: this
// helper does the grounded prose research; the caller feeds the returned brief
// into its existing non-grounded JSON prompt.
//
// Grounding is PURE UPSIDE (capability `grounding`, always-on via the existing
// Vertex service account + free grounding tier). On ANY failure or empty result
// this returns { ok:false, brief:'' } and the caller generates ungrounded — an
// honest degradation, never fabricated grounding. Mirrors abmResearchService's
// research stage, factored so keyword + blog generation share one implementation.

const RESEARCH_SYSTEM = `You are a research analyst. Using live web search, gather CURRENT, SPECIFIC, VERIFIABLE facts on the requested topic.
- Prefer recent data: real statistics with their year, named tools/companies, prices, concrete examples, and what authoritative sources actually say.
- Note what the top-ranking pages and AI answer engines currently cover on this topic, and any gaps worth filling.
- Be explicit about uncertainty. NEVER invent statistics, numbers, or sources — report only what you actually find, with the source inline.
Write a tight, factual brief: hard facts as bullets, no preamble, no marketing tone.`;

export const groundingService = {
    /**
     * Grounded prose research on a task. Returns a factual brief + sources, or an
     * honest empty result the caller degrades on (generation proceeds ungrounded).
     * @param {string} task the research instruction (may embed brand/topic context)
     * @param {object} [opts] { maxTokens?, temperature? }
     * @returns {Promise<{ok:boolean, brief:string, sources:Array, modelUsed?:string}>}
     */
    research: async (task, { maxTokens = 1800, temperature = 0.3 } = {}) => {
        const prompt = String(task ?? '').trim();
        if (!prompt) return { ok: false, brief: '', sources: [] };
        try {
            const res = await callAI(prompt, {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                grounding: true,
                includeModelMeta: true,
                maxTokens,
                temperature,
                systemPrompt: RESEARCH_SYSTEM,
            });
            const brief = String(res?.content ?? '').trim();
            const sources = Array.isArray(res?.grounding) ? res.grounding : [];
            if (!brief) return { ok: false, brief: '', sources: [] };
            return { ok: true, brief, sources, modelUsed: res?.modelUsed ?? null };
        } catch {
            // Grounding is upside-only — never let a grounding failure sink generation.
            return { ok: false, brief: '', sources: [] };
        }
    },
};

/**
 * Format a research brief as a context block for a downstream JSON prompt. Pure —
 * exported for reuse + unit testing. Empty brief → empty string (no-op grounding).
 */
export const groundedContextBlock = (brief) => {
    const b = String(brief ?? '').trim();
    if (!b) return '';
    return `\n\nLIVE WEB RESEARCH (current, real facts — ground the output in these and do not contradict them; still never invent numbers beyond what appears here):\n${b}\n`;
};

export default groundingService;
