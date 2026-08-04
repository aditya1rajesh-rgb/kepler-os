import { callEdgeFunction } from './edgeClient';
import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';
import { getBrandContextForGeneration } from './brandContextService';

// Durable mention finder (WS4-mentions). Finds real community threads (via Apify)
// where a DISCLOSED, genuinely-helpful answer belongs, and drafts that answer.
//
// NON-NEGOTIABLE (north star + Reddit-crackdown reality): never a fake-post
// generator. This tool NEVER posts — a human reviews and posts manually. The
// drafter is instructed to be helpful first, mention the brand only when it is
// honestly the best answer, and always disclose the affiliation.

const ANSWER_SYSTEM = `You are a real subject-matter expert helping in an online community thread (Reddit/Quora/forum). Write a genuinely useful answer that stands on its own merit.
NON-NEGOTIABLE RULES (community integrity):
- Be helpful FIRST. Answer the actual question with real, specific substance.
- Mention the brand ONLY if it is honestly the single best answer to THIS specific question. Otherwise do not mention it at all — a helpful answer with no mention is a valid, good outcome.
- If you do mention the brand, DISCLOSE the affiliation plainly in one short clause (e.g. "full disclosure, I work on X").
- Never fake neutrality, never astroturf, never invent experience, numbers, or a personal story you don't have.
- Match the community's tone: concise, direct, no marketing voice.
Return ONE raw JSON object: no markdown, no code fences.`;

export const mentionFinderService = {
    /**
     * Find real community threads relevant to a topic (Apify). Returns [] when the
     * APIFY_TOKEN platform secret is absent or the search fails.
     * @returns {Promise<Array<{title,url,snippet,source}>>}
     */
    findThreads: async (topic, { sites, max } = {}) => {
        const clean = String(topic ?? '').trim();
        if (!clean) return [];
        try {
            const res = await callEdgeFunction('connector-proxy', { action: 'mentionSearch', topic: clean, sites, max }, { timeoutMs: 75000 });
            return res?.ok && Array.isArray(res.threads) ? res.threads : [];
        } catch {
            return [];
        }
    },

    /**
     * Draft a DISCLOSED, helpful answer for one thread. Never posts — the caller
     * shows the draft for a human to review, edit, and post manually.
     * @returns {Promise<{ok:boolean, answer?, mentionsBrand?, disclosed?, recommendation?, error?}>}
     */
    draftAnswer: async (workspaceId, { thread }) => {
        if (!thread?.url) return { ok: false, error: 'A thread is required.' };
        let brandBlock = '';
        try {
            const bc = await getBrandContextForGeneration(workspaceId, { module: 'default', depth: 'profile' });
            brandBlock = bc?.prompt ?? '';
        } catch { /* brand context is optional — a mention-free helpful answer is fine */ }

        const prompt = `${brandBlock ? `OUR BRAND (for disclosure only — mention ONLY if it is honestly the best answer to this exact question):\n${brandBlock}\n\n` : ''}THREAD:
Title: ${thread.title}
URL: ${thread.url}
Context/snippet: ${thread.snippet}

Write a helpful community answer following every rule. Return JSON only:
{"answer":"the full answer text, ready for a human to review and post",
 "mentionsBrand":true,
 "disclosed":true,
 "recommendation":"post | skip — is this thread genuinely worth a reply, or not a fit?"}`;

        try {
            const res = await callAI(prompt, {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                maxTokens: 1200,
                temperature: 0.5,
                systemPrompt: ANSWER_SYSTEM,
            });
            const c = res ?? {};
            return {
                ok: true,
                answer: String(c.answer ?? '').trim(),
                mentionsBrand: Boolean(c.mentionsBrand),
                disclosed: Boolean(c.disclosed),
                recommendation: String(c.recommendation ?? '').trim().toLowerCase().startsWith('skip') ? 'skip' : 'post',
            };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },
};

export default mentionFinderService;
