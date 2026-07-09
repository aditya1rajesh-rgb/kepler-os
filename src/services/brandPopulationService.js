import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';
import { fetchWebsiteContent, buildWebsiteContextBlock } from './websiteIntelligenceService';
import { buildFilesContextBlock } from './fileParseService';
import { normalizeColorIdentity, normalizeBusinessDetails } from '../lib/brandContracts';
import { normalizeCompetitorSuggestions } from '../lib/competitorContracts';
import { normalizeIcpSuggestions } from '../lib/icpContracts';
import { mergePopulationIntoProfile } from './brandIntelligence/populationMerge';
import { brandService } from './brandService';
import { AiResponseFormatError } from './aiClient';

// Compact system prompt shared by the staged identity calls. Each call asks for a
// tiny JSON payload so the free-tier models respond well within the timeout.
const IDENTITY_SYSTEM_PROMPT = `You are a brand analyst for KEPLER OS.
Use ONLY the provided website/file context. If something is unknown, return empty values.
Never invent facts, stats, or numbers.

OUTPUT CONTRACT (must follow exactly):
- Respond with ONE raw JSON object that matches the requested schema.
- No markdown, no code fences, no backticks, no commentary, no trailing text.
- Use double-quoted keys and string values. Do not include comments or trailing commas.
- Include every key in the schema; use "" or [] for unknown values (never omit keys).`;

// Discovery calls (competitors, ICPs, competitor enrichment) are different from
// identity extraction: a brand's own website/files almost never list its
// competitors or spell out its customer segments. Those require reasoning about
// the market category, not just quoting the source. This prompt grants that
// latitude while still forbidding fabricated numbers, so discovery can return
// real results instead of empty arrays.
const DISCOVERY_SYSTEM_PROMPT = `You are a market intelligence analyst for KEPLER OS.
Use the provided brand context as your primary grounding, and you MAY draw on your general knowledge of the brand's market, category, and competitive landscape to reason about likely competitors and target customers.
Only name real, well-known companies and realistic customer segments you are genuinely confident exist - when unsure, omit rather than guess.
Never fabricate pricing, revenue, market share, funding, headcounts, or any specific statistics.

OUTPUT CONTRACT (must follow exactly):
- Respond with ONE raw JSON object that matches the requested schema.
- No markdown, no code fences, no backticks, no commentary, no trailing text.
- Use double-quoted keys and string values. Do not include comments or trailing commas.
- Include every key in the schema; use "" or [] for unknown values (never omit keys).`;

const buildContextBlock = ({ workspaceName, workspaceUrl, websiteBlock, filesBlock, hasFiles }) => `
Brand: ${workspaceName || 'Unknown'}
Website: ${workspaceUrl || 'Not provided'}

${websiteBlock ? `WEBSITE CONTENT:\n${websiteBlock}` : 'WEBSITE CONTENT: unavailable'}

${filesBlock ? `UPLOADED FILES:\n${filesBlock}` : 'UPLOADED FILES: none'}
${hasFiles ? '\nProject files take priority over website copy.' : ''}`;

const buildOverviewPrompt = (context) => `${context}

Return JSON only: {"overview":"2-4 sentence business overview grounded in the context, or empty"}`;

const buildTaglinePrompt = (context) => `${context}

Return JSON only: {"tagline":"short brand tagline drawn from the context, or empty"}`;

const buildTonePrompt = (context) => `${context}

Return JSON only: {"tone":["..."]}
List the brand's voice/tone descriptors drawn from the context. Use an empty array if unknown.`;

const buildStylePrompt = (context) => `${context}

Return JSON only: {"values":["..."],"aesthetic":["..."]}
Use short lists drawn from the context. Use empty arrays if unknown.`;

const buildBusinessDetailsPrompt = (context) => `${context}

Return JSON only:
{"businessDetails":{
  "offersProducts":"products, services, or offers - prefer file messaging, else empty",
  "offerDescriptions":"descriptions of key offers or product lines, or empty",
  "differentiators":"string or empty",
  "painPointsSolved":"customer pain points this brand addresses, or empty",
  "industry":"string or empty",
  "targetMarket":"string or empty",
  "valueProposition":"string or empty",
  "companySize":"string or empty",
  "geographicFocus":"string or empty",
  "keyMessages":["..."],
  "proofPoints":[{"text":"exact stat or claim","confidence":"high or low","source":"brief source note"}]
}}
Rules: NEVER invent numbers, percentages, ROI, or customer counts. Only include a proofPoint when the stat appears verbatim in the source; mark it "high" only then, otherwise "low". Use empty strings/arrays when unknown.`;

const buildColorsPrompt = (context) => `${context}

Return JSON only:
{"colorIdentity":{
  "primaryColor":"#RRGGBB or empty",
  "secondaryColor":"#RRGGBB or empty",
  "accentColor":"#RRGGBB or empty",
  "supportDarkColor":"#RRGGBB or empty",
  "backgroundLightColor":"#RRGGBB or empty",
  "textColor":"#RRGGBB or empty",
  "typographySuggestion":"font / typography style drawn from the context, or empty",
  "visualDirectionNotes":"1-2 sentences on visual direction, or empty"
}}
Infer colours only from the provided context (brand site/files). Use #RRGGBB hex. Leave a field empty when it is not inferable - do NOT invent exact brand colours without evidence.`;

// Each section is generated by its own isolated, tiny AI call so a single
// slow/failed section never blocks the others. Persisted independently.
const SECTION_CONFIG = {
    overview: { build: buildOverviewPrompt, maxTokens: 500 },
    tagline: { build: buildTaglinePrompt, maxTokens: 256 },
    tone: { build: buildTonePrompt, maxTokens: 300 },
    style: { build: buildStylePrompt, maxTokens: 300 },
    colors: { build: buildColorsPrompt, maxTokens: 600 },
    // Larger budget: this is the biggest schema and truncated output was a
    // primary cause of "malformed JSON" (JSON cut off mid-object).
    businessDetails: { build: buildBusinessDetailsPrompt, maxTokens: 2400 },
};

const buildCompetitorPrompt = (context) => `${context}

Return JSON only:
{"competitorSuggestions":[{
  "name":"competitor brand name",
  "url":"website if known, else empty",
  "reasonSuggested":"why a competitor - positioning, category, or audience overlap",
  "confidence":"high, medium, or low"
}]}
Using the brand context plus your knowledge of this market category, suggest up to 5 real, well-known competitors that target a similar audience or solve a similar problem. Name only companies you are confident actually exist. Do NOT fabricate pricing, revenue, or market share. Leave url empty when unknown. Set confidence to "low" for adjacent/indirect competitors.`;

const buildCompetitorEnrichmentPrompt = (context, competitor) => `${context}

Competitor to analyze:
Name: ${competitor?.name || 'Unknown'}
URL: ${competitor?.url || 'Not provided'}
Existing notes: ${competitor?.notes || 'none'}

Return JSON only: {"messagingSummary":"2-4 sentence summary of this competitor's positioning and messaging based on the context, or empty if unknown"}
Do NOT invent facts that are not supported by the provided context.`;

const buildIcpPrompt = (context) => `${context}

Return JSON only:
{"icpSuggestions":[{
  "segment":"short label for the customer segment",
  "role":"primary buyer role or job function",
  "titles":["likely job titles"],
  "companyType":"company type/size, or empty",
  "geography":"geographic focus, or empty",
  "primaryPains":"the core pains this segment feels that the brand addresses",
  "triggers":"what prompts them to look for a solution, or empty",
  "blockers":"objections or blockers to buying, or empty",
  "buyingContext":"how they evaluate/buy, or empty",
  "messagingHooks":["angles that resonate with this segment"],
  "channels":["where to reach them"],
  "reasonSuggested":"why this is a likely ideal customer profile",
  "confidence":"high, medium, or low"
}]}
Using the brand context plus your knowledge of who buys this kind of product, suggest up to 3 realistic ideal customer profiles. Ground pains and segments in the brand's actual offering. Do NOT fabricate company names, customer counts, or statistics. Leave fields empty when genuinely unknown.`;

// Sections run by the Brand Overview tab's global "Refresh from sources".
export const BRAND_OVERVIEW_SECTIONS = ['overview', 'tagline', 'tone', 'style', 'colors'];

// All independently-generatable brand_profiles sections (used to seed UI status).
export const GENERATION_SECTIONS = Object.keys(SECTION_CONFIG);

const BRAND_INTEL_DEBUG = import.meta.env.DEV && import.meta.env.VITE_BRAND_INTEL_DEBUG === 'true';
const TAGLINE_TRACE = import.meta.env.DEV && import.meta.env.VITE_TAGLINE_TRACE === 'true';

const debugLog = (...args) => {
    if (!BRAND_INTEL_DEBUG) return;
    console.debug('[brandPopulationService]', ...args);
};

// LOCAL DEBUG ONLY. Emits one structured line per generation with exact token
// accounting and the outcome category. Behind VITE_BRAND_INTEL_DEBUG; logs only
// counts/metadata - never prompts, secrets, or model output.
// outcome ∈ 'success' | 'failed_parse' | 'failed_schema' | 'blocked_insufficient_context' | 'empty_content' | 'upstream' | 'persist'
const logGeneration = ({ section, outcome, modelUsed = null, usage = null }) => {
    if (!BRAND_INTEL_DEBUG) return;
    console.debug('[brandPopulationService] generation', {
        section,
        outcome,
        model: modelUsed,
        promptTokenCount: usage?.promptTokenCount ?? null,
        candidatesTokenCount: usage?.candidatesTokenCount ?? null,
        totalTokenCount: usage?.totalTokenCount ?? null,
    });
};

// Tagline-only forensic trace (DEV + VITE_TAGLINE_TRACE). Logs shapes/counts
// only - never prompt text, secrets, or raw model output.
const traceTagline = (phase, payload) => {
    if (!TAGLINE_TRACE) return;
    console.debug('[brandPopulationService:tagline-trace]', phase, payload);
};

// Map an internal errorKind to the audit outcome label.
const outcomeForKind = (errorKind) => {
    if (errorKind === 'insufficient_context') return 'blocked_insufficient_context';
    if (errorKind === 'malformed_json') return 'failed_parse';
    if (errorKind === 'missing_keys') return 'failed_schema';
    if (errorKind === 'empty_content') return 'empty_content';
    if (errorKind === 'persist') return 'persist';
    return 'upstream';
};

const isObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const REQUIRED_SECTION_KEYS = {
    overview: ['overview'],
    tagline: ['tagline'],
    tone: ['tone'],
    style: ['values', 'aesthetic'],
    colors: ['colorIdentity'],
    businessDetails: ['businessDetails'],
};

const validateSectionJson = (section, content) => {
    if (!isObject(content)) {
        return {
            ok: false,
            errorKind: 'malformed_json',
            error: 'The AI response was not in the expected structured format.',
        };
    }

    const required = REQUIRED_SECTION_KEYS[section] ?? [];
    const missing = required.filter((key) => !(key in content));
    if (missing.length > 0) {
        return {
            ok: false,
            errorKind: 'missing_keys',
            error: `The AI response was missing required field(s): ${missing.join(', ')}.`,
        };
    }

    return { ok: true, content };
};

// Maps a thrown error into a stable failure category + clean UI message.
// Raw model output is never included here.
const categorizeCallError = (err) => {
    if (err instanceof AiResponseFormatError) {
        if (err.kind === 'no_content') {
            return { errorKind: 'empty_content', message: 'The AI returned no content. Please try again.' };
        }
        return { errorKind: 'malformed_json', message: 'The AI returned an unparseable response. Please retry.' };
    }
    if (err?.isAuthError) {
        return { errorKind: 'auth', message: err.message };
    }
    return { errorKind: 'upstream', message: err?.message || 'The AI service failed to respond.' };
};

// Optional escalation appended to a section prompt when a prior attempt failed
// to parse - asks for minified strict JSON, no extra characters whatsoever.
const STRICT_RETRY_SUFFIX =
    '\n\nReturn MINIFIED JSON only (single line, double quotes, no spaces outside strings, no markdown, no commentary).';

const normalizeAiResult = (raw) => ({
    tagline: String(raw?.tagline ?? '').trim(),
    overview: String(raw?.overview ?? '').trim(),
    values: Array.isArray(raw?.values) ? raw.values.map(String).filter(Boolean) : [],
    aesthetic: Array.isArray(raw?.aesthetic) ? raw.aesthetic.map(String).filter(Boolean) : [],
    tone: Array.isArray(raw?.tone) ? raw.tone.map(String).filter(Boolean) : [],
    colorIdentity: normalizeColorIdentity(raw?.colorIdentity ?? {}),
    businessDetails: normalizeBusinessDetails(raw?.businessDetails ?? {}, { populationMode: true }),
    competitorSuggestions: Array.isArray(raw?.competitorSuggestions) ? raw.competitorSuggestions : [],
    icpSuggestions: Array.isArray(raw?.icpSuggestions) ? raw.icpSuggestions : [],
});

// ─── Shared source-context cache ──────────────────────────────────────────────
//
// Assembling the analysis context (scraping the website + reading file text) is
// repeated by every per-section generate call. Without caching, clicking
// "Generate competitors", then "Generate ICPs", then "Business Details" each
// re-scrapes the site and re-assembles the same context. This module-level cache
// builds it once and shares it across all calls.
//
// It self-invalidates: the cache key is a content signature (URL + each file's
// name + length), so any file upload/reprocess/removal or URL change misses the
// cache and rebuilds. A TTL bounds staleness for server-side website changes,
// and an explicit `forceReacquire` (used by the full "Refresh from sources")
// always re-scrapes. File text itself is extracted once at upload and persisted
// in the DB - it is never re-extracted here.
const SOURCE_CACHE_TTL_MS = 10 * 60 * 1000;
let sourceContextCache = null; // { workspaceId, signature, value, builtAt }

const buildSourceSignature = (url, fileTexts) =>
    `${url ?? ''}::${(fileTexts ?? []).map((f) => `${f.name}:${(f.text ?? '').length}`).join('|')}`;

/** Drop the cached source context (e.g. after a website re-scrape is forced). */
export const invalidateBrandSourceContext = () => { sourceContextCache = null; };

/**
 * Acquire and assemble the shared analysis context (website scrape + persisted
 * fallback + uploaded file text) once, so every section call can reuse it.
 * Cached and shared across calls; pass forceReacquire to bypass the cache.
 */
const acquireBrandSources = async (workspaceId, { workspace, brand, fileTexts = [], forceReacquire = false }) => {
    const cacheSignature = buildSourceSignature(workspace?.url || brand?.url, fileTexts);
    if (
        !forceReacquire &&
        sourceContextCache &&
        sourceContextCache.workspaceId === workspaceId &&
        sourceContextCache.signature === cacheSignature &&
        Date.now() - sourceContextCache.builtAt < SOURCE_CACHE_TTL_MS
    ) {
        return sourceContextCache.value;
    }

    const sourcesUsed = [];
    const errors = [];
    let websiteBlock = '';
    let websiteSource = null;
    const persistedWebsiteSource = brand?.populationMeta?.websiteSource;

    const url = workspace?.url || brand?.url;
    if (url?.trim()) {
        const scrape = await fetchWebsiteContent(url);
        if (scrape.ok) {
            websiteBlock = buildWebsiteContextBlock(scrape);
            sourcesUsed.push('website');
            websiteSource = {
                source: scrape.source,
                url: scrape.url,
                title: scrape.title ?? '',
                description: scrape.description ?? '',
                bodyText: scrape.bodyText ?? '',
                fetchedAt: new Date().toISOString(),
                charCount: scrape.bodyText?.length ?? 0,
            };
            if (!websiteBlock.trim()) {
                errors.push('empty page extraction (website context block)');
            }
        } else {
            errors.push(...(scrape.errors ?? ['Website scrape failed']));
            console.warn('Brand population website source acquisition failed', {
                workspaceId,
                inputUrl: url,
                normalizedUrl: scrape.url,
                errors: scrape.errors,
            });
        }
    } else {
        errors.push('invalid URL normalization (workspace URL missing)');
    }

    // Deterministic fallback: reuse previously persisted website extraction when
    // current fetch fails, so population can still run from known source text.
    if (!websiteBlock && persistedWebsiteSource?.bodyText) {
        websiteSource = {
            ...persistedWebsiteSource,
            reusedFromPersistence: true,
            fetchedAt: persistedWebsiteSource.fetchedAt ?? null,
            charCount: persistedWebsiteSource.bodyText.length,
        };
        websiteBlock = buildWebsiteContextBlock({
            ok: true,
            title: persistedWebsiteSource.title ?? '',
            description: persistedWebsiteSource.description ?? '',
            bodyText: persistedWebsiteSource.bodyText,
        });
        if (websiteBlock.trim()) {
            if (!sourcesUsed.includes('website')) sourcesUsed.push('website');
            console.info('Brand population reused persisted website source text', {
                workspaceId,
                url: persistedWebsiteSource.url ?? url ?? '',
                charCount: persistedWebsiteSource.bodyText.length,
            });
        } else {
            errors.push('empty page extraction (persisted website source)');
        }
    }

    const filesBlock = buildFilesContextBlock(fileTexts);
    const hasFiles = Boolean(filesBlock);
    if (hasFiles) sourcesUsed.push('files');

    const hasSource = Boolean(websiteBlock || filesBlock);
    const context = hasSource
        ? buildContextBlock({
            workspaceName: workspace?.name ?? brand?.name,
            workspaceUrl: url,
            websiteBlock,
            filesBlock,
            hasFiles,
        })
        : '';

    const value = { context, sourcesUsed, websiteSource, errors, hasSource, url };
    sourceContextCache = {
        workspaceId,
        signature: cacheSignature,
        value,
        builtAt: Date.now(),
    };
    return value;
};

const buildSectionMeta = (priorBrand, { sourcesUsed, websiteSource, aiModelUsed, fieldsUpdated, error, completed }) => {
    const prior = priorBrand?.populationMeta ?? {};
    return {
        ...prior,
        lastRunAt: new Date().toISOString(),
        lastRunStatus: error ? 'partial' : 'success',
        lastRunErrors: error ? [error] : [],
        sourcesUsed,
        fieldsUpdated,
        savedSuggestionCount: prior.savedSuggestionCount ?? 0,
        aiModelUsed: aiModelUsed ?? prior.aiModelUsed ?? null,
        websiteSource: websiteSource ?? prior.websiteSource ?? null,
        autoRunCompleted: completed ?? prior.autoRunCompleted ?? false,
    };
};

/**
 * Generate one Brand Overview section with an isolated AI call and persist it
 * immediately on success. Returns the saved brand and per-section outcome.
 */
const generateSection = async ({ workspaceId, section, brand, context, sourcesUsed, websiteSource, forceRefresh, completed, strict = false }) => {
    const config = SECTION_CONFIG[section];
    if (!config) {
        return { ok: false, section, brand, fieldsUpdated: 0, errorKind: 'unknown_section', error: 'Unknown generation section.', aiModelUsed: null };
    }

    const prompt = strict ? `${config.build(context)}${STRICT_RETRY_SUFFIX}` : config.build(context);

    if (section === 'tagline' && TAGLINE_TRACE) {
        traceTagline('preflight', {
            section: 'tagline',
            contextChars: context.length,
            sourcesUsed,
            maxTokens: config.maxTokens,
            strict,
            promptChars: prompt.length,
        });
    }

    let response;
    try {
        response = await callAI(prompt, {
            model: FREE_MODEL_FALLBACKS[0],
            modelFallbacks: FREE_MODEL_FALLBACKS,
            json: true,
            includeModelMeta: true,
            maxTokens: config.maxTokens,
            temperature: 0.3,
            systemPrompt: IDENTITY_SYSTEM_PROMPT,
            ...(section === 'tagline' && TAGLINE_TRACE ? { traceSection: 'tagline' } : {}),
        });
    } catch (err) {
        const { errorKind, message } = categorizeCallError(err);
        if (section === 'tagline' && TAGLINE_TRACE) {
            traceTagline('failure', {
                section: 'tagline',
                failureCategory: errorKind,
                decidedAt: 'brandPopulationService',
                message,
                usage: err?.usage ?? null,
                model: err?.modelUsed ?? null,
            });
        }
        logGeneration({ section, outcome: outcomeForKind(errorKind), modelUsed: err?.modelUsed ?? null, usage: err?.usage ?? null });
        return { ok: false, section, brand, fieldsUpdated: 0, errorKind, error: message, aiModelUsed: null };
    }

    const aiModelUsed = response?.modelUsed ?? null;
    const validated = validateSectionJson(section, response?.content);
    if (!validated.ok) {
        logGeneration({ section, outcome: outcomeForKind(validated.errorKind), modelUsed: aiModelUsed, usage: response?.usage ?? null });
        return { ok: false, section, brand, fieldsUpdated: 0, errorKind: validated.errorKind, error: validated.error, aiModelUsed };
    }
    logGeneration({ section, outcome: 'success', modelUsed: aiModelUsed, usage: response?.usage ?? null });
    const aiResult = normalizeAiResult(validated.content);
    const { brand: merged, fieldsUpdated } = mergePopulationIntoProfile(
        brand,
        aiResult,
        { sourcesUsed, forceRefresh }
    );

    if (fieldsUpdated === 0) {
        return { ok: true, section, brand, fieldsUpdated: 0, aiModelUsed };
    }

    try {
        const saved = await brandService.upsertBrandIdentity(workspaceId, {
            ...merged,
            populationMeta: buildSectionMeta(brand, {
                sourcesUsed,
                websiteSource,
                aiModelUsed,
                fieldsUpdated,
                error: null,
                completed,
            }),
        });
        return { ok: true, section, brand: saved, fieldsUpdated, aiModelUsed };
    } catch (persistErr) {
        return { ok: false, section, brand: merged, fieldsUpdated: 0, errorKind: 'persist', error: `Could not save ${section}: ${persistErr.message}`, aiModelUsed };
    }
};

export const brandPopulationService = {
    /**
     * Section-scoped Brand Overview generation: acquire sources once, then run each
     * section as an isolated call, persisting on success and reporting per-section
     * status so the UI can show/retry individual sections.
     */
    populateBrand: async (workspaceId, { workspace, brand, fileTexts = [], forceRefresh = false, onProgress, onSection }) => {
        const report = (stage) => {
            try {
                onProgress?.(stage);
            } catch {
                // progress reporting must never break population
            }
        };
        const reportSection = (section, status, error, errorKind) => {
            try {
                onSection?.({ section, status, error, errorKind });
            } catch {
                // section reporting must never break population
            }
        };

        report('extracting');
        // The explicit full refresh re-scrapes (forceReacquire); it then primes
        // the shared cache that the per-section/discovery calls reuse.
        const { context, sourcesUsed, websiteSource, errors, hasSource, url } = await acquireBrandSources(
            workspaceId,
            { workspace, brand, fileTexts, forceReacquire: forceRefresh }
        );

        if (!hasSource) {
            const noSourceErrors = [
                ...errors,
                ...(url?.trim() ? [] : ['invalid URL normalization']),
            ];
            console.warn('Brand population aborted: no analyzable sources', {
                workspaceId,
                websiteTried: Boolean(url?.trim()),
                fileTextsCount: fileTexts.length,
                errors: noSourceErrors,
            });
            return {
                ok: false,
                status: 'error',
                errors: noSourceErrors.length > 0
                    ? noSourceErrors
                    : ['No website content or file text available to analyze'],
                brand,
                suggestions: { competitors: [], icps: [] },
                fieldsUpdated: 0,
            };
        }

        let accumulatedBrand = brand;
        let aiModelUsed = null;
        let fieldsUpdated = 0;
        const stepErrors = [];

        for (const section of BRAND_OVERVIEW_SECTIONS) {
            report(`generating-${section}`);
            reportSection(section, 'running');
            const result = await generateSection({
                workspaceId,
                section,
                brand: accumulatedBrand,
                context,
                sourcesUsed,
                websiteSource,
                forceRefresh,
                completed: false,
            });
            if (result.ok) {
                accumulatedBrand = result.brand;
                fieldsUpdated += result.fieldsUpdated;
                aiModelUsed = result.aiModelUsed ?? aiModelUsed;
                reportSection(section, 'done');
            } else {
                stepErrors.push(result.error);
                reportSection(section, 'error', result.error, result.errorKind);
            }
        }

        const succeededAny = fieldsUpdated > 0;
        const finalStatus = stepErrors.length && !succeededAny
            ? 'error'
            : (errors.length || stepErrors.length ? 'partial' : 'success');

        report('saving');
        try {
            accumulatedBrand = await brandService.upsertBrandIdentity(workspaceId, {
                ...accumulatedBrand,
                populationMeta: {
                    ...(accumulatedBrand.populationMeta ?? {}),
                    lastRunAt: new Date().toISOString(),
                    lastRunErrors: [...errors, ...stepErrors],
                    sourcesUsed,
                    fieldsUpdated,
                    savedSuggestionCount: accumulatedBrand.populationMeta?.savedSuggestionCount ?? 0,
                    aiModelUsed,
                    websiteSource,
                    lastRunStatus: finalStatus,
                    autoRunCompleted: stepErrors.length === 0,
                },
            });
        } catch (metaErr) {
            stepErrors.push(`meta persist: ${metaErr.message}`);
        }

        return {
            ok: succeededAny || stepErrors.length === 0,
            status: finalStatus,
            errors: [...errors, ...stepErrors],
            brand: accumulatedBrand,
            suggestions: { competitors: [], icps: [] },
            fieldsUpdated,
            sourcesUsed,
            aiModelUsed,
        };
    },

    /**
     * Generate (or retry) a single Brand Overview section in isolation.
     * Re-acquires sources, runs only the requested section, and persists on success.
     */
    generateBrandSection: async (workspaceId, { workspace, brand, fileTexts = [], forceRefresh = true, section, strict = false }) => {
        if (!SECTION_CONFIG[section]) {
            return { ok: false, section, brand, fieldsUpdated: 0, errorKind: 'unknown_section', error: 'Unknown generation section.' };
        }

        const { context, sourcesUsed, websiteSource, hasSource } = await acquireBrandSources(
            workspaceId,
            { workspace, brand, fileTexts }
        );

        // Preflight: never spend a credit when there is nothing meaningful to analyze.
        if (!hasSource) {
            logGeneration({ section, outcome: 'blocked_insufficient_context' });
            return {
                ok: false,
                section,
                brand,
                fieldsUpdated: 0,
                errorKind: 'insufficient_context',
                error: 'Not enough source material. Add a website URL or upload project files, then try again.',
            };
        }

        return generateSection({
            workspaceId,
            section,
            brand,
            context,
            sourcesUsed,
            websiteSource,
            forceRefresh,
            completed: brand?.populationMeta?.autoRunCompleted,
            strict,
        });
    },

    /**
     * Competitor discovery: generate competitor suggestions and sync them into the
     * pending suggestions table. Force-refresh is scoped to competitors so existing
     * ICP suggestions are preserved.
     */
    generateCompetitors: async (workspaceId, { workspace, brand, fileTexts = [], forceRefresh = true, strict = false }) => {
        const { context, sourcesUsed, hasSource } = await acquireBrandSources(
            workspaceId,
            { workspace, brand, fileTexts }
        );

        if (!hasSource) {
            logGeneration({ section: 'competitors', outcome: 'blocked_insufficient_context' });
            return {
                ok: false,
                errorKind: 'insufficient_context',
                error: 'Not enough source material to find competitors. Add a website URL or upload project files.',
                activePendingCount: 0,
            };
        }

        let response;
        try {
            const prompt = strict ? `${buildCompetitorPrompt(context)}${STRICT_RETRY_SUFFIX}` : buildCompetitorPrompt(context);
            response = await callAI(prompt, {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                includeModelMeta: true,
                maxTokens: 1000,
                temperature: 0.3,
                systemPrompt: DISCOVERY_SYSTEM_PROMPT,
            });
        } catch (err) {
            const { errorKind, message } = categorizeCallError(err);
            logGeneration({ section: 'competitors', outcome: outcomeForKind(errorKind), modelUsed: err?.modelUsed ?? null, usage: err?.usage ?? null });
            return { ok: false, errorKind, error: message, activePendingCount: 0 };
        }

        if (!isObject(response?.content) || !('competitorSuggestions' in response.content) || !Array.isArray(response.content.competitorSuggestions)) {
            const errorKind = isObject(response?.content) ? 'missing_keys' : 'malformed_json';
            logGeneration({ section: 'competitors', outcome: outcomeForKind(errorKind), modelUsed: response?.modelUsed ?? null, usage: response?.usage ?? null });
            return { ok: false, errorKind, error: 'The AI response for competitors was not in the expected format.', activePendingCount: 0 };
        }

        logGeneration({ section: 'competitors', outcome: 'success', modelUsed: response?.modelUsed ?? null, usage: response?.usage ?? null });
        const rawList = response.content.competitorSuggestions;
        const competitors = normalizeCompetitorSuggestions(rawList, { sourcesUsed, populationMode: true });

        try {
            const sync = await brandService.syncGeneratedSuggestions(
                workspaceId,
                { competitors, icps: [] },
                { forceRefresh, types: ['competitor'] }
            );
            return {
                ok: true,
                generatedCount: competitors.length,
                activePendingCount: Number(sync?.activePendingCount ?? 0),
            };
        } catch (err) {
            return { ok: false, errorKind: 'persist', error: `Could not save competitors: ${err.message}`, activePendingCount: 0 };
        }
    },

    /**
     * ICP discovery: generate ideal-customer-profile suggestions and sync them into
     * the pending suggestions table. Force-refresh is scoped to ICPs so existing
     * competitor suggestions are preserved. Mirrors generateCompetitors.
     */
    generateIcps: async (workspaceId, { workspace, brand, fileTexts = [], forceRefresh = true }) => {
        const { context, sourcesUsed, hasSource } = await acquireBrandSources(
            workspaceId,
            { workspace, brand, fileTexts }
        );

        if (!hasSource) {
            logGeneration({ section: 'icps', outcome: 'blocked_insufficient_context' });
            return {
                ok: false,
                errorKind: 'insufficient_context',
                error: 'Not enough source material to suggest ICPs. Add a website URL or upload project files.',
                activePendingCount: 0,
            };
        }

        let response;
        try {
            response = await callAI(buildIcpPrompt(context), {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                includeModelMeta: true,
                maxTokens: 1400,
                temperature: 0.3,
                systemPrompt: DISCOVERY_SYSTEM_PROMPT,
            });
        } catch (err) {
            const { errorKind, message } = categorizeCallError(err);
            logGeneration({ section: 'icps', outcome: outcomeForKind(errorKind), modelUsed: err?.modelUsed ?? null, usage: err?.usage ?? null });
            return { ok: false, errorKind, error: message, activePendingCount: 0 };
        }

        if (!isObject(response?.content) || !('icpSuggestions' in response.content) || !Array.isArray(response.content.icpSuggestions)) {
            const errorKind = isObject(response?.content) ? 'missing_keys' : 'malformed_json';
            logGeneration({ section: 'icps', outcome: outcomeForKind(errorKind), modelUsed: response?.modelUsed ?? null, usage: response?.usage ?? null });
            return { ok: false, errorKind, error: 'The AI response for ICPs was not in the expected format.', activePendingCount: 0 };
        }

        logGeneration({ section: 'icps', outcome: 'success', modelUsed: response?.modelUsed ?? null, usage: response?.usage ?? null });
        const icps = normalizeIcpSuggestions(response.content.icpSuggestions, { sourcesUsed, populationMode: true });

        try {
            const sync = await brandService.syncGeneratedSuggestions(
                workspaceId,
                { competitors: [], icps },
                { forceRefresh, types: ['icp'] }
            );
            return {
                ok: true,
                generatedCount: icps.length,
                activePendingCount: Number(sync?.activePendingCount ?? 0),
            };
        } catch (err) {
            return { ok: false, errorKind: 'persist', error: `Could not save ICPs: ${err.message}`, activePendingCount: 0 };
        }
    },

    /**
     * Competitor enrichment: generate a messaging summary for a single confirmed
     * competitor and persist it to the competitors table (notes). Kept separate
     * from discovery.
     */
    enrichCompetitor: async (workspaceId, { workspace, brand, fileTexts = [], competitor, strict = false }) => {
        if (!competitor?.id) {
            return { ok: false, errorKind: 'insufficient_context', error: 'No competitor selected to enrich.' };
        }

        const { context, hasSource } = await acquireBrandSources(
            workspaceId,
            { workspace, brand, fileTexts }
        );

        if (!hasSource) {
            logGeneration({ section: 'competitorEnrichment', outcome: 'blocked_insufficient_context' });
            return { ok: false, errorKind: 'insufficient_context', error: 'Not enough source material to enrich this competitor. Add a website URL or upload project files.' };
        }

        let response;
        try {
            const prompt = strict
                ? `${buildCompetitorEnrichmentPrompt(context, competitor)}${STRICT_RETRY_SUFFIX}`
                : buildCompetitorEnrichmentPrompt(context, competitor);
            response = await callAI(prompt, {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                includeModelMeta: true,
                maxTokens: 400,
                temperature: 0.3,
                systemPrompt: DISCOVERY_SYSTEM_PROMPT,
            });
        } catch (err) {
            const { errorKind, message } = categorizeCallError(err);
            logGeneration({ section: 'competitorEnrichment', outcome: outcomeForKind(errorKind), modelUsed: err?.modelUsed ?? null, usage: err?.usage ?? null });
            return { ok: false, errorKind, error: message };
        }

        if (!isObject(response?.content) || !('messagingSummary' in response.content)) {
            const errorKind = isObject(response?.content) ? 'missing_keys' : 'malformed_json';
            logGeneration({ section: 'competitorEnrichment', outcome: outcomeForKind(errorKind), modelUsed: response?.modelUsed ?? null, usage: response?.usage ?? null });
            return { ok: false, errorKind, error: 'The AI response for enrichment was not in the expected format.' };
        }

        const messagingSummary = String(response.content.messagingSummary ?? '').trim();
        if (!messagingSummary) {
            logGeneration({ section: 'competitorEnrichment', outcome: 'empty_content', modelUsed: response?.modelUsed ?? null, usage: response?.usage ?? null });
            return { ok: false, errorKind: 'empty_content', error: 'The AI returned no messaging summary for this competitor.' };
        }

        logGeneration({ section: 'competitorEnrichment', outcome: 'success', modelUsed: response?.modelUsed ?? null, usage: response?.usage ?? null });

        try {
            const updated = await brandService.updateCompetitor(workspaceId, competitor.id, {
                notes: messagingSummary,
            });
            return { ok: true, competitor: updated };
        } catch (err) {
            return { ok: false, errorKind: 'persist', error: `Could not save enrichment: ${err.message}` };
        }
    },

    getSuggestions: (workspaceId) => brandService.getSuggestions(workspaceId),

    acceptCompetitorSuggestion: (workspaceId, suggestion) =>
        brandService.acceptSuggestion(workspaceId, suggestion.id, 'competitor'),

    acceptIcpSuggestion: (workspaceId, suggestion) =>
        brandService.acceptSuggestion(workspaceId, suggestion.id, 'icp'),

    updateSuggestion: (workspaceId, suggestionId, payload) =>
        brandService.updateSuggestion(workspaceId, suggestionId, payload),

    dismissSuggestion: (workspaceId, id) => brandService.dismissSuggestion(workspaceId, id),
};
