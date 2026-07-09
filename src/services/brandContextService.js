import { brandService } from './brandService';
import { fileService } from './fileService';

// Shared brand-context provider for downstream content modules (blog, outreach,
// ads, social). It assembles the curated, high-signal brand context ONCE from
// the structured brand profile + ICPs + competitors, and optionally appends raw
// file excerpts on demand. Downstream modules call this instead of each
// re-implementing how to gather "what this brand offers and who it's for".
//
// Why structured-first: the Brand Intelligence module already distills sources
// into a reviewed, lossless-of-what-matters profile (overview, value prop,
// differentiators, proof points, key messages, ICP pains/hooks). That is the
// right context for generation - compact, accurate, and cheap - far better than
// re-feeding raw scraped text on every call. Raw file text is pulled only when
// depth === 'full', for pieces that need deep product detail.

// Per-module emphasis: which structured fields lead for each consumer. Used to
// order the context block so the most relevant material comes first; nothing is
// hard-excluded (the profile is compact enough to include in full).
const MODULE_FOCUS = {
    blog: ['overview', 'valueProposition', 'differentiators', 'keyMessages', 'proofPoints', 'offers', 'tone'],
    outreach: ['icps', 'painPointsSolved', 'differentiators', 'proofPoints', 'valueProposition'],
    ads: ['valueProposition', 'keyMessages', 'proofPoints', 'tone', 'icps'],
    social: ['tone', 'keyMessages', 'overview', 'icps'],
    default: ['overview', 'valueProposition', 'differentiators', 'keyMessages', 'proofPoints', 'icps', 'tone'],
};

// Cap on raw file text appended under depth:'full', leaving headroom under the
// ai-proxy 60K-char ceiling for the structured block + the module's own prompt.
const FILE_EXCERPT_BUDGET = 20000;

const proofPointText = (p) => (typeof p === 'string' ? p : p?.text ?? '');

/** Build the compact structured context object from the persisted brand data. */
const buildStructured = (brand, personas, competitors) => {
    const bd = brand?.businessDetails ?? {};
    return {
        name: brand?.name ?? '',
        url: brand?.url ?? '',
        tagline: brand?.tagline ?? '',
        overview: brand?.overview ?? '',
        industry: bd.industry ?? '',
        offers: bd.offersProducts || bd.productsServices || '',
        offerDescriptions: bd.offerDescriptions ?? '',
        valueProposition: bd.valueProposition ?? '',
        differentiators: bd.differentiators ?? '',
        painPointsSolved: bd.painPointsSolved ?? '',
        targetMarket: bd.targetMarket ?? '',
        keyMessages: Array.isArray(bd.keyMessages) ? bd.keyMessages : [],
        proofPoints: (Array.isArray(bd.proofPoints) ? bd.proofPoints : [])
            .map(proofPointText)
            .filter(Boolean),
        values: Array.isArray(brand?.values) ? brand.values : [],
        tone: Array.isArray(brand?.tone) ? brand.tone : [],
        aesthetic: Array.isArray(brand?.aesthetic) ? brand.aesthetic : [],
        icps: (personas ?? []).map((p) => ({
            segment: p.segment || p.role || '',
            role: p.role || '',
            painPoints: p.painPoints || '',
            triggers: p.triggers || '',
            messagingHooks: p.messagingHooks ?? [],
            channels: p.channels ?? [],
        })),
        competitors: (competitors ?? [])
            .filter((c) => c.confirmed !== false)
            .map((c) => ({ name: c.name, notes: c.notes || '' })),
    };
};

// Renders one structured field into a labelled line/block, or '' when empty so
// nothing blank pollutes the prompt.
const renderField = (key, s) => {
    const list = (label, arr) => (arr?.length ? `${label}: ${arr.join(', ')}` : '');
    switch (key) {
        case 'overview': return s.overview ? `Overview: ${s.overview}` : '';
        case 'valueProposition': return s.valueProposition ? `Value proposition: ${s.valueProposition}` : '';
        case 'differentiators': return s.differentiators ? `Differentiators: ${s.differentiators}` : '';
        case 'painPointsSolved': return s.painPointsSolved ? `Pains solved: ${s.painPointsSolved}` : '';
        case 'offers': return s.offers ? `Offers/products: ${s.offers}${s.offerDescriptions ? ` - ${s.offerDescriptions}` : ''}` : '';
        case 'keyMessages': return list('Key messages', s.keyMessages);
        case 'proofPoints': return list('Proof points', s.proofPoints);
        case 'tone': return list('Voice/tone', s.tone);
        case 'icps':
            return s.icps.length
                ? `Ideal customer profiles:\n${s.icps.map((i) =>
                    `  - ${i.segment}${i.role && i.role !== i.segment ? ` (${i.role})` : ''}`
                    + `${i.painPoints ? ` - pains: ${i.painPoints}` : ''}`
                    + `${i.messagingHooks?.length ? `; hooks: ${i.messagingHooks.join(', ')}` : ''}`
                  ).join('\n')}`
                : '';
        default: return '';
    }
};

/** Assemble the final prompt-ready text block, ordered by module focus. */
const formatContextBlock = (s, fileTexts, module) => {
    const focus = MODULE_FOCUS[module] ?? MODULE_FOCUS.default;
    const ordered = [...focus, ...MODULE_FOCUS.default.filter((k) => !focus.includes(k))];

    const header = `BRAND: ${s.name || 'Unknown'}${s.tagline ? ` - "${s.tagline}"` : ''}`
        + `${s.industry ? `\nIndustry: ${s.industry}` : ''}`;

    const seen = new Set();
    const lines = [];
    for (const key of ordered) {
        if (seen.has(key)) continue;
        seen.add(key);
        const rendered = renderField(key, s);
        if (rendered) lines.push(rendered);
    }

    const competitors = s.competitors.length
        ? `Known competitors: ${s.competitors.map((c) => c.name).join(', ')}`
        : '';
    if (competitors) lines.push(competitors);

    let block = `${header}\n\n${lines.join('\n')}`;

    if (fileTexts?.length) {
        let budget = FILE_EXCERPT_BUDGET;
        const excerpts = [];
        for (const f of fileTexts) {
            if (budget <= 0) break;
            const text = (f.text ?? '').slice(0, budget);
            if (!text.trim()) continue;
            excerpts.push(`--- Source file: ${f.name} ---\n${text}`);
            budget -= text.length;
        }
        if (excerpts.length) {
            block += `\n\nSOURCE FILE DETAIL (use for specific, accurate facts):\n${excerpts.join('\n\n')}`;
        }
    }

    return block;
};

/**
 * Shared interface for content modules to get brand-grounded context.
 *
 * @param {string} workspaceId
 * @param {object} opts
 * @param {'blog'|'outreach'|'ads'|'social'|'default'} [opts.module] consumer module (tailors emphasis)
 * @param {'profile'|'full'} [opts.depth] 'profile' = structured only (cheap);
 *        'full' = structured + raw file excerpts (for pieces needing depth)
 * @returns {Promise<{ structured: object, prompt: string, files: Array, meta: object }>}
 *   - structured: the brand context as an object (for programmatic use)
 *   - prompt: ready-to-use text block to drop into an AI call
 *   - files: raw file texts included (empty unless depth==='full')
 *   - meta: { module, depth, hasBrand, icpCount, competitorCount }
 */
export const getBrandContextForGeneration = async (workspaceId, { module = 'default', depth = 'profile' } = {}) => {
    if (!workspaceId) {
        throw new Error('getBrandContextForGeneration: workspaceId is required');
    }

    const [brand, personas, competitors] = await Promise.all([
        brandService.getBrandIdentity(workspaceId),
        brandService.getPersonas(workspaceId),
        brandService.getCompetitors(workspaceId),
    ]);

    const files = depth === 'full'
        ? await fileService.getFileTextsForPopulation(workspaceId)
        : [];

    const structured = buildStructured(brand, personas, competitors);
    const prompt = formatContextBlock(structured, files, module);

    return {
        structured,
        prompt,
        files,
        meta: {
            module,
            depth,
            hasBrand: Boolean(structured.overview || structured.valueProposition),
            icpCount: structured.icps.length,
            competitorCount: structured.competitors.length,
        },
    };
};

export default getBrandContextForGeneration;
