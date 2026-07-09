import { createField } from '../fieldFactory';
import { SOURCE_ORIGINS } from '../constants';
import { normalizeColorIdentity, normalizeBusinessDetails } from '../../../lib/brandContracts';

/**
 * Extract field candidates from a website scrape / analysis payload.
 * Expects shape from websiteIntelligenceService or AI-normalized website block.
 */
export const extractWebsiteSource = (websiteAnalysis) => {
    if (!websiteAnalysis) return { fields: [], meta: { source: 'website', id: null } };

    const url = websiteAnalysis.url ?? websiteAnalysis.sourceUrl ?? '';
    const refs = url ? [`website:${url}`] : ['website:unknown'];
    const fields = [];
    const confidence = websiteAnalysis.confidence ?? (websiteAnalysis.ok ? 0.7 : null);

    const push = (key, value, extra = {}) => {
        if (value == null || (typeof value === 'string' && !value.trim())) return;
        if (Array.isArray(value) && value.length === 0) return;
        fields.push(createField({
            key,
            value,
            sourceOrigin: SOURCE_ORIGINS.WEBSITE,
            sourceRefs: refs,
            confidence,
            confirmed: false,
            ...extra,
        }));
    };

    // Raw scrape metadata
    push('overview.tagline', websiteAnalysis.tagline);
    push('overview.overview', websiteAnalysis.overview ?? websiteAnalysis.description);
    push('overview.name', websiteAnalysis.title ?? websiteAnalysis.name);

    // Normalized AI website extraction (if already parsed)
    if (websiteAnalysis.tagline) push('overview.tagline', websiteAnalysis.tagline);
    if (websiteAnalysis.overview) push('overview.overview', websiteAnalysis.overview);
    if (Array.isArray(websiteAnalysis.values)) push('overview.values', websiteAnalysis.values);
    if (Array.isArray(websiteAnalysis.aesthetic)) push('overview.aesthetic', websiteAnalysis.aesthetic);
    if (Array.isArray(websiteAnalysis.tone)) push('overview.tone', websiteAnalysis.tone);

    const colors = normalizeColorIdentity(websiteAnalysis.colorIdentity ?? websiteAnalysis.colors ?? {});
    for (const [k, v] of Object.entries(colors)) {
        if (v) push(`colors.${k}`, v);
    }

    const details = normalizeBusinessDetails(websiteAnalysis.businessDetails ?? {});
    for (const [k, v] of Object.entries(details)) {
        if (v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim())) {
            push(`businessDetails.${k}`, v);
        }
    }

    return { fields, meta: { source: 'website', id: url || null, ok: websiteAnalysis.ok ?? true } };
};
