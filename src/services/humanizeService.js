import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';

// Humanizer finishing-pass. Ports the "Signs of AI writing" rule set into a
// single robust Gemini call that rewrites a draft to read like a knowledgeable
// human wrote it. Reusable by every content module (blog, ads, social, outreach)
// as the LAST step before save. Pure-prompt, no external deps.
//
// Marketing override vs. the source skill: the skill says "replace inflation
// with a specific fact / cite a source" - DANGEROUS for autonomous generation.
// Here we forbid fabrication: prefer deletion over inventing stats or sources.

const HUMANIZE_SYSTEM_PROMPT = `You are an expert editor who removes AI writing patterns so text reads like a knowledgeable human wrote it on the first try. You do not dumb writing down - you make it sound like someone with real expertise and a point of view.

REMOVE THESE AI TELLS:
- Tier-1 vocabulary: delve, leverage (verb), harness, navigate (figurative), realm, landscape (figurative), tapestry, myriad, plethora, multifaceted, groundbreaking, revolutionize, synergy, ecosystem (figurative), streamline, unlock, elevate, seamless, robust, testament, paradigm shift, game-changer.
- Significance inflation: "stands as a testament", "plays a vital/pivotal role", "underscores its importance", "in today's digital landscape", "setting the stage for".
- Hedging/filler: "It's worth noting that", "It is important to note", "Needless to say". (One hedge is fine; five is AI.)
- Chatbot artifacts: "Great question", "I hope this helps", "Let me know if".
- Structural tells: every section the same shape, relentless "not just X, but Y" parallelism, padding rule-of-three triads, generic "the future looks bright" conclusions.
- Em dashes used for dramatic asides; overuse of bold; metronomic same-length sentences.

DO:
- Vary sentence length and rhythm; use contractions; keep a clear point of view.
- Match the brand voice provided (if any). Preserve all headings, lists, and formatting structure.

HARD PRESERVATION + NO FABRICATION:
- Keep all facts, numbers, product names, proper nouns, and claims exactly.
- NEVER invent statistics, sources, or specifics to "add detail" - if a sentence is empty puffery, DELETE it rather than fabricate.

OUTPUT CONTRACT:
- Return ONE raw JSON object: {"text":"the rewritten content (same format/markdown as input)","changes":["brief notes on what you changed"]}.
- No code fences, no commentary outside the JSON.`;

const AGGRESSIVENESS_NOTE = {
    light: 'Light pass: only fix the clearest AI tells; preserve most phrasing. Good for short copy/CTAs where some punch is intentional.',
    standard: 'Standard pass: remove AI tells and improve rhythm while preserving structure and meaning.',
    heavy: 'Heavy pass: aggressively de-AI, restructure flat passages, and inject varied rhythm - but never change facts.',
};

/**
 * Humanize a draft. Reusable finishing pass for any content module.
 * @param {string} text - the draft (markdown or plain)
 * @param {object} [opts]
 * @param {string} [opts.brandVoice] - freeform brand voice/tone description
 * @param {'light'|'standard'|'heavy'} [opts.aggressiveness]
 * @returns {Promise<{ok:boolean, text:string, changes:string[], error?:string}>}
 *   On any failure returns ok:false with the ORIGINAL text, so callers can safely
 *   fall back to the un-humanized draft rather than losing content.
 */
export const humanize = async (text, { brandVoice = '', aggressiveness = 'standard' } = {}) => {
    const input = String(text ?? '').trim();
    if (!input) return { ok: false, text: '', changes: [], error: 'No text to humanize.' };

    const prompt = `${brandVoice ? `BRAND VOICE: ${brandVoice}\n\n` : ''}${AGGRESSIVENESS_NOTE[aggressiveness] ?? AGGRESSIVENESS_NOTE.standard}

Rewrite the following content. Return the JSON contract exactly.

CONTENT:
${input}`;

    try {
        const res = await callAI(prompt, {
            model: FREE_MODEL_FALLBACKS[0],
            modelFallbacks: FREE_MODEL_FALLBACKS,
            json: true,
            includeModelMeta: true,
            // Headroom so a long draft isn't truncated on rewrite.
            maxTokens: 8000,
            temperature: 0.6,
            systemPrompt: HUMANIZE_SYSTEM_PROMPT,
        });
        const out = String(res?.content?.text ?? '').trim();
        if (!out) return { ok: false, text: input, changes: [], error: 'Humanizer returned no text.' };
        const changes = Array.isArray(res?.content?.changes)
            ? res.content.changes.map((c) => String(c).trim()).filter(Boolean)
            : [];
        return { ok: true, text: out, changes };
    } catch (err) {
        // Never lose the draft on a humanizer failure - return the original.
        return { ok: false, text: input, changes: [], error: err.message };
    }
};

export default { humanize };
