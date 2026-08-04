import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';
import { fetchWebsiteContent, buildWebsiteContextBlock } from './websiteIntelligenceService';
import { getBrandContextForGeneration } from './brandContextService';

// Page teardown (WS1d). Reuses the CORS-friendly Jina Reader primitive
// (fetchWebsiteContent) — previously brand-population only — to read a live page
// (a competitor's, or the user's own) and summarize what it covers, where it's
// thin/outdated, and the angles to out-teach or refresh it. Grounds the operator
// loop's refresh recipes (WS1a) and the asset router (WS2). Capability `page_reader`
// is always-on (Jina free tier, no key). Everything is grounded ONLY in the page
// content — never fabricated.

const TEARDOWN_SYSTEM = `You are an SEO content strategist analyzing a live web page so we can out-rank or refresh it. Ground EVERY observation in the page content provided — never invent anything that is not on the page. If the page content is thin or unreadable, say so plainly. Return ONE raw JSON object: no markdown, no code fences.`;

const buildPrompt = (pageBlock, { targetKeyword, ownPage, brandBlock }) => `${brandBlock ? `OUR BRAND CONTEXT:\n${brandBlock}\n\n` : ''}PAGE UNDER REVIEW${ownPage ? ' (OUR OWN PAGE — recommend a refresh)' : ' (a competitor / ranking page — recommend how to beat it)'}${targetKeyword ? ` for the target query "${targetKeyword}"` : ''}:
${pageBlock}

Analyze the page and return JSON only:
{"summary":"1-2 sentences: what this page is and who it's for",
 "covers":["the key subtopics/sections it actually covers"],
 "gaps":["specific things it misses, is thin on, or is outdated on — the opening to beat it"],
 "angles":["2-4 concrete, differentiated angles our content could take to out-teach it"],
 "recommendedFormat":"guide | comparison | listicle | how-to | landing",
 "wordCountEstimate":0}
Base everything ONLY on the page content above. Keep arrays short if the page is thin.`;

const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 8) : []);

export const pageTeardownService = {
    /**
     * Read + analyze a live page.
     * @param {string} workspaceId (optional — adds brand context for sharper angles)
     * @param {object} opts { url, targetKeyword?, ownPage? }
     * @returns {Promise<{ok:boolean, url?, title?, teardown?:object, error?:string}>}
     */
    analyze: async (workspaceId, { url, targetKeyword = '', ownPage = false } = {}) => {
        const clean = String(url ?? '').trim();
        if (!clean) return { ok: false, error: 'Enter a page URL to analyze.' };

        let scrape;
        try {
            scrape = await fetchWebsiteContent(clean);
        } catch (e) {
            return { ok: false, error: `Could not fetch the page: ${e.message}` };
        }
        if (!scrape.ok) {
            return { ok: false, error: 'Could not read that page — it may block readers, require login, or be empty.' };
        }

        const pageBlock = buildWebsiteContextBlock(scrape);
        let brandBlock = '';
        if (workspaceId) {
            try {
                const bc = await getBrandContextForGeneration(workspaceId, { module: 'blog', depth: 'profile' });
                brandBlock = bc?.prompt ?? '';
            } catch { /* brand context is optional for a teardown */ }
        }

        let res;
        try {
            res = await callAI(buildPrompt(pageBlock, { targetKeyword, ownPage, brandBlock }), {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                maxTokens: 1500,
                temperature: 0.3,
                systemPrompt: TEARDOWN_SYSTEM,
            });
        } catch (e) {
            return { ok: false, error: `Analysis failed: ${e.message}` };
        }

        const c = res ?? {};
        return {
            ok: true,
            url: scrape.url,
            title: scrape.title,
            source: scrape.source,
            teardown: {
                summary: String(c.summary ?? '').trim(),
                covers: arr(c.covers),
                gaps: arr(c.gaps),
                angles: arr(c.angles),
                recommendedFormat: String(c.recommendedFormat ?? '').trim(),
                wordCountEstimate: Number(c.wordCountEstimate) || null,
            },
        };
    },
};

export default pageTeardownService;
