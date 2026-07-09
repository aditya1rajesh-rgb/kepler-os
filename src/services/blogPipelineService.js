import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';
import { getBrandContextForGeneration } from './brandContextService';
import { humanize } from './humanizeService';
import { aeoScoreService } from './aeoScoreService';
import { feedbackService } from './feedbackService';

// Staged blog generation. Ports the methodology from the Claude Blog skill:
// outline → draft (answer-first, citation-ready, anti-AI) → deterministic schema
// → review (100-pt rubric + code-computed AI-detection) → one quality-gated
// re-draft. Each model step is one robust JSON callAI() (truncation/parse
// recovery is handled centrally in aiClient - see [[ai-json-robustness]]).
//
// Anti-fabrication: this is marketing content generation, so the skill's "cite 8
// real stats" rule is overridden to "use only facts present in the brand context
// / source files; never invent stats, numbers, or sources."

const BLOG_SYSTEM_PROMPT = `You are a senior content writer for KEPLER OS who writes for both Google rankings and AI-citation engines (ChatGPT, Perplexity, AI Overviews).
Ground everything in the provided brand context and source material.

WRITING RULES:
- Write a cohesive guide with NARRATIVE FLOW - not a list of FAQs. Sections connect with transitions and build a logical argument from start to finish.
- Vary heading styles: most headings are statements or topics; AT MOST about 1 in 3 may be phrased as a question. Do NOT phrase every heading as a question.
- Answer-first ONLY for question-style headings and the FAQ: open those with a direct 1-2 sentence answer (~40-60 words). For statement/topic sections, open with a strong claim or a concrete example and develop it in flowing prose - do not force a definitional "X is..." opener.
- Vary section shape: mix explanation, a concrete example or scenario, a short list only where it earns its place, and analysis. Not every section follows the same template.
- Vary sentence length deliberately (mix short punchy and longer sentences). Use contractions. Write with a clear point of view.
- NEVER use em dashes. NEVER use these phrases: "in today's digital landscape", "it's important to note", "dive into", "game-changer", "leverage" (as a verb), "unlock", "elevate", "seamless", "robust", "navigate the".
- Short paragraphs (under 80 words); use H3 subsections and lists only where they genuinely help.

HARD ANTI-FABRICATION:
- Use ONLY facts, stats, product details, and claims present in the provided context/source files.
- NEVER invent statistics, numbers, customer counts, percentages, or sources. If you lack a number, write qualitatively instead.

OUTPUT CONTRACT (must follow exactly):
- Respond with ONE raw JSON object matching the requested schema.
- No markdown, no code fences, no commentary. Double-quoted keys/strings. Include every key.`;

const buildOutlinePrompt = (context, { targetKeyword, intent }) => `${context}

Target keyword: ${targetKeyword}
Search intent: ${intent || 'informational'}

Produce a blog outline. Return JSON only:
{"titleOptions":["3 title options, 50-60 chars, primary keyword front-loaded"],
 "metaDescription":"150-160 chars, includes the primary keyword, ends with a soft CTA",
 "wordCount":1500,
 "sections":[{"h2":"section heading - mostly statements/topics; at most ~1 in 3 may be a question","type":"intro | concept | how-to | example | comparison | takeaways","keyPoints":["what this section must cover"]}],
 "faq":[{"q":"a question a searcher/AI engine would ask"}],
 "internalLinkZones":["topics to internally link to"]}
6-8 sections forming a logical arc: hook/context → core concepts → how-to/application → proof or example → takeaways. Vary the section types and do NOT phrase every heading as a question (real questions belong in the FAQ). Every section must be something this brand can credibly write about from the context.`;

const buildDraftPrompt = (context, outline, { targetKeyword }) => `${context}

Write the full blog post for target keyword "${targetKeyword}".
Title: ${outline.titleOptions?.[0] ?? targetKeyword}
Sections to cover: ${JSON.stringify(outline.sections ?? [])}
FAQ to answer: ${JSON.stringify(outline.faq ?? [])}

Return JSON only:
{"title":"final title",
 "metaDescription":"150-160 chars",
 "tags":["3-6 topical tags"],
 "keyTakeaways":["3-5 bullet takeaways, each one sentence"],
 "sections":[{"h2":"heading","body":"markdown prose for this section. For question headings, open with a direct 40-60 word answer; otherwise open with a strong claim or a concrete example. Connect to the surrounding sections with transitions and vary paragraph shape."}],
 "faq":[{"q":"question","a":"40-60 word answer a search/AI engine could quote directly"}]}
Follow every writing rule. Write a flowing guide a person would enjoy reading, NOT a Q&A list. Do not fabricate facts or numbers.`;

const buildReviewPrompt = (markdown, metrics, { targetKeyword }) => `Review this blog draft for target keyword "${targetKeyword}".

Pre-computed AI-detection metrics (already measured - do not recompute):
- burstiness (sentence-length variation, higher is more human): ${metrics.burstiness}
- type-token ratio (vocabulary variety): ${metrics.typeTokenRatio}
- banned AI phrases found: ${metrics.bannedPhrasesFound.join(', ') || 'none'}
- em dashes: ${metrics.emDashCount}

DRAFT:
${markdown.slice(0, 12000)}

Return JSON only:
{"categoryScores":{"content":0,"seo":0,"eeat":0,"technical":0,"aiCitation":0},
 "overall":0,
 "issues":["specific, actionable problems"],
 "strengths":["what works"]}
Score each category out of its max (content 30, seo 25, eeat 15, technical 15, aiCitation 15); overall is their sum (0-100). Be a strict reviewer.`;

// ─── Deterministic helpers (no model needed) ──────────────────────────────────

const BANNED_PHRASES = [
    "in today's digital landscape", "it's important to note", 'dive into', 'game-changer',
    'leverage', 'unlock', 'elevate', 'seamless', 'robust', 'navigate the', 'tapestry', 'delve',
];

const str = (v, max = 4000) => String(v ?? '').trim().slice(0, max);

/** AI-detection metrics computed deterministically (cheaper + reliable vs. asking the model). */
const computeTextMetrics = (text) => {
    const lower = text.toLowerCase();
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const sentenceLengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
    const mean = sentenceLengths.length
        ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
        : 0;
    const variance = sentenceLengths.length
        ? sentenceLengths.reduce((a, b) => a + (b - mean) ** 2, 0) / sentenceLengths.length
        : 0;
    const burstiness = mean > 0 ? Number((Math.sqrt(variance) / mean).toFixed(3)) : 0;

    const words = lower.split(/\s+/).filter(Boolean);
    const uniqueWords = new Set(words);
    const typeTokenRatio = words.length ? Number((uniqueWords.size / words.length).toFixed(3)) : 0;

    return {
        wordCount: words.length,
        burstiness,
        typeTokenRatio,
        emDashCount: (text.match(/—/g) || []).length,
        bannedPhrasesFound: BANNED_PHRASES.filter((p) => lower.includes(p)),
    };
};

/** Assemble the draft JSON into a single markdown document. */
const assembleMarkdown = (draft) => {
    const lines = [`# ${str(draft.title, 200)}`, ''];
    if (draft.keyTakeaways?.length) {
        lines.push('## Key Takeaways', '');
        for (const t of draft.keyTakeaways) lines.push(`- ${str(t, 300)}`);
        lines.push('');
    }
    for (const section of draft.sections ?? []) {
        lines.push(`## ${str(section.h2, 200)}`, '', str(section.body, 6000), '');
    }
    if (draft.faq?.length) {
        lines.push('## Frequently Asked Questions', '');
        for (const item of draft.faq) {
            lines.push(`### ${str(item.q, 300)}`, '', str(item.a, 1200), '');
        }
    }
    return lines.join('\n').trim();
};

/** Build BlogPosting + FAQPage JSON-LD (@graph) deterministically from the draft. */
const buildSchema = (draft, { brandName }) => {
    const graph = [
        {
            '@type': 'BlogPosting',
            headline: str(draft.title, 110),
            description: str(draft.metaDescription, 160),
            author: { '@type': 'Organization', name: brandName || 'Brand' },
            datePublished: new Date().toISOString(),
            dateModified: new Date().toISOString(),
        },
    ];
    if (draft.faq?.length) {
        graph.push({
            '@type': 'FAQPage',
            mainEntity: draft.faq.map((item) => ({
                '@type': 'Question',
                name: str(item.q, 300),
                acceptedAnswer: { '@type': 'Answer', text: str(item.a, 1200) },
            })),
        });
    }
    return { '@context': 'https://schema.org', '@graph': graph };
};

const BLOCKING_THRESHOLD = 80;

const runDraft = async (context, outline, contentItem, brandName) => {
    const res = await callAI(buildDraftPrompt(context, outline, { targetKeyword: contentItem.targetKeyword }), {
        model: FREE_MODEL_FALLBACKS[0],
        modelFallbacks: FREE_MODEL_FALLBACKS,
        json: true,
        includeModelMeta: true,
        maxTokens: 8000,
        temperature: 0.6,
        systemPrompt: BLOG_SYSTEM_PROMPT,
    });
    const draft = res?.content ?? {};
    if (!Array.isArray(draft.sections) || draft.sections.length === 0) return null;
    const markdown = assembleMarkdown(draft);
    return { draft, markdown, metrics: computeTextMetrics(markdown), schema: buildSchema(draft, { brandName }) };
};

// Run the humanizer finishing-pass over an assembled draft, recomputing metrics
// on the cleaned prose. Falls back to the original draft if humanizing fails.
const applyHumanize = async (built, brandVoice) => {
    const h = await humanize(built.markdown, { brandVoice, aggressiveness: 'standard' });
    if (h.ok) {
        built.markdown = h.text;
        built.metrics = computeTextMetrics(h.text);
        built.humanizeChanges = h.changes;
    }
    return built;
};

export const blogPipelineService = {
    /**
     * Run the full blog pipeline for a queued content item.
     * @returns {Promise<{ok:boolean, result?:object, error?:string}>}
     *   result: { title, metaDescription, tags, markdown, schema, review, metrics, outline }
     */
    generateBlog: async (workspaceId, { contentItem }) => {
        if (!workspaceId || !contentItem?.targetKeyword) {
            return { ok: false, error: 'A target keyword is required to generate a blog.' };
        }

        let brandContext;
        try {
            // depth 'full' includes raw source-file excerpts so real product detail grounds the draft.
            brandContext = await getBrandContextForGeneration(workspaceId, { module: 'blog', depth: 'full' });
        } catch (err) {
            return { ok: false, error: `Could not load brand context: ${err.message}` };
        }
        if (!brandContext.meta.hasBrand) {
            return { ok: false, error: 'Add a brand profile in Brand Intelligence before generating blogs.' };
        }

        const brandName = brandContext.structured?.name ?? '';
        const brandVoice = (brandContext.structured?.tone ?? []).join(', ');
        // Learning loop: fold past low-rated feedback into the context.
        const guidance = await feedbackService.getGuidance(workspaceId, 'blog');
        const ctx = brandContext.prompt + guidance;

        // 1) Outline
        let outline;
        try {
            const res = await callAI(buildOutlinePrompt(ctx, { targetKeyword: contentItem.targetKeyword, intent: contentItem.intent }), {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                maxTokens: 2000,
                temperature: 0.5,
                systemPrompt: BLOG_SYSTEM_PROMPT,
            });
            outline = res ?? {};
            if (!Array.isArray(outline.sections) || outline.sections.length === 0) {
                return { ok: false, error: 'The outline step returned no sections. Please retry.' };
            }
        } catch (err) {
            return { ok: false, error: `Outline step failed: ${err.message}` };
        }

        // 2) Draft → 3) schema + metrics (assembled in runDraft) → humanize polish
        let built;
        try {
            built = await runDraft(ctx, outline, contentItem, brandName);
            if (!built) return { ok: false, error: 'The draft step returned no content. Please retry.' };
        } catch (err) {
            return { ok: false, error: `Draft step failed: ${err.message}` };
        }
        built = await applyHumanize(built, brandVoice);

        // 4) Review (code metrics + model judgment) - scores the humanized text
        let review = null;
        try {
            review = await callAI(buildReviewPrompt(built.markdown, built.metrics, { targetKeyword: contentItem.targetKeyword }), {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                maxTokens: 1200,
                temperature: 0.2,
                systemPrompt: 'You are a strict blog editor. Return only the requested JSON.',
            });
        } catch {
            // Review is advisory - a failure here leaves review as null (its initial
            // value) and must not sink an otherwise-good draft.
        }

        // 5) One quality-gated re-draft if the review blocks (overall < threshold).
        if (review && typeof review.overall === 'number' && review.overall < BLOCKING_THRESHOLD) {
            try {
                const issues = Array.isArray(review.issues) ? review.issues.slice(0, 6).join('; ') : '';
                const revisedOutline = { ...outline, _reviewerNotes: issues };
                const rebuilt = await runDraft(
                    `${ctx}\n\nThe previous draft scored ${review.overall}/100. Fix these issues in this rewrite: ${issues}`,
                    revisedOutline,
                    contentItem,
                    brandName,
                );
                if (rebuilt) {
                    built = await applyHumanize(rebuilt, brandVoice);
                    try {
                        review = await callAI(buildReviewPrompt(built.markdown, built.metrics, { targetKeyword: contentItem.targetKeyword }), {
                            model: FREE_MODEL_FALLBACKS[0],
                            modelFallbacks: FREE_MODEL_FALLBACKS,
                            json: true,
                            maxTokens: 1200,
                            temperature: 0.2,
                            systemPrompt: 'You are a strict blog editor. Return only the requested JSON.',
                        });
                    } catch { /* keep prior review */ }
                }
            } catch { /* keep the first draft if the re-draft fails */ }
        }

        // 6) AEO / citability score on the final humanized text.
        let aeo = null;
        const aeoRes = await aeoScoreService.scoreContent({
            markdown: built.markdown,
            title: built.draft.title,
            metaDescription: built.draft.metaDescription,
        });
        if (aeoRes.ok) aeo = aeoRes;

        return {
            ok: true,
            result: {
                title: str(built.draft.title, 200) || outline.titleOptions?.[0] || contentItem.targetKeyword,
                metaDescription: str(built.draft.metaDescription, 200),
                tags: Array.isArray(built.draft.tags) ? built.draft.tags.map((t) => str(t, 60)).filter(Boolean) : [],
                markdown: built.markdown,
                schema: built.schema,
                review,
                aeo,
                metrics: built.metrics,
                humanizeChanges: built.humanizeChanges ?? [],
                outline,
            },
        };
    },
};

export default blogPipelineService;
