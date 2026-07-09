import { createField } from '../fieldFactory';
import { SOURCE_ORIGINS } from '../constants';
import {
    normalizeColorIdentity,
    normalizeBusinessDetails,
} from '../../../lib/brandContracts';

const resolveBusinessDetailOrigin = (sourcesUsed = []) => {
    const hasWebsite = sourcesUsed.includes('website');
    const hasFiles = sourcesUsed.includes('files');
    if (hasFiles && hasWebsite) return SOURCE_ORIGINS.COMBINED;
    if (hasFiles) return SOURCE_ORIGINS.FILE;
    if (hasWebsite) return SOURCE_ORIGINS.WEBSITE;
    return SOURCE_ORIGINS.AI_SUGGESTION;
};

const resolveOverviewOrigin = (sourcesUsed = []) => {
    const hasWebsite = sourcesUsed.includes('website');
    const hasFiles = sourcesUsed.includes('files');
    if (hasWebsite && hasFiles) return SOURCE_ORIGINS.COMBINED;
    if (hasWebsite) return SOURCE_ORIGINS.WEBSITE;
    if (hasFiles) return SOURCE_ORIGINS.FILE;
    return SOURCE_ORIGINS.AI_SUGGESTION;
};

const resolveColorOrigin = (sourcesUsed = []) => {
    const hasWebsite = sourcesUsed.includes('website');
    const hasFiles = sourcesUsed.includes('files');
    if (hasWebsite && hasFiles) return SOURCE_ORIGINS.COMBINED;
    if (hasWebsite) return SOURCE_ORIGINS.WEBSITE;
    if (hasFiles) return SOURCE_ORIGINS.FILE;
    return SOURCE_ORIGINS.AI_SUGGESTION;
};

/**
 * Convert AI synthesis output into normalized field candidates with source-aware origins.
 * Business detail fields prefer file origin when project files contributed to analysis.
 */
export const extractPopulationFromAi = (aiSynthesis, sourcesUsed = []) => {
    if (!aiSynthesis) {
        return { fields: [], meta: { source: 'population', sourcesUsed } };
    }

    const refs = sourcesUsed.length ? sourcesUsed.map((s) => `source:${s}`) : ['ai:synthesis'];
    const overviewOrigin = resolveOverviewOrigin(sourcesUsed);
    const detailOrigin = resolveBusinessDetailOrigin(sourcesUsed);
    const colorOrigin = resolveColorOrigin(sourcesUsed);
    const fields = [];

    const push = (key, value, origin, confidence = 0.7) => {
        if (value == null || (typeof value === 'string' && !value.trim())) return;
        if (Array.isArray(value) && value.length === 0) return;
        fields.push(createField({
            key,
            value,
            sourceOrigin: origin,
            sourceRefs: refs,
            confidence,
            confirmed: false,
        }));
    };

    push('overview.tagline', aiSynthesis.tagline, overviewOrigin);
    push('overview.overview', aiSynthesis.overview, detailOrigin, 0.75);
    if (Array.isArray(aiSynthesis.values)) push('overview.values', aiSynthesis.values, detailOrigin);
    if (Array.isArray(aiSynthesis.aesthetic)) push('overview.aesthetic', aiSynthesis.aesthetic, detailOrigin);
    if (Array.isArray(aiSynthesis.tone)) push('overview.tone', aiSynthesis.tone, detailOrigin);

    const colors = normalizeColorIdentity(aiSynthesis.colorIdentity ?? {});
    for (const [k, v] of Object.entries(colors)) {
        if (v) push(`colors.${k}`, v, colorOrigin);
    }

    const details = normalizeBusinessDetails(aiSynthesis.businessDetails ?? {}, { populationMode: true });
    for (const [k, v] of Object.entries(details)) {
        if (v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim())) {
            push(`businessDetails.${k}`, v, detailOrigin, 0.8);
        }
    }

    return {
        fields,
        meta: { source: 'population', sourcesUsed, fieldCount: fields.length },
    };
};
