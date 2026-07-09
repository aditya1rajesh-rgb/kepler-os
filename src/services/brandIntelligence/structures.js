import { emptyField, fieldHasValue } from './fieldFactory';
import {
    BRAND_OVERVIEW_KEYS,
    BRAND_COLOR_KEYS,
    BUSINESS_DETAIL_KEYS,
} from './constants';

const pick = (mergedMap, key, fallback = '') => {
    const field = mergedMap[key];
    if (!field || !fieldHasValue(field)) {
        return emptyField(key, { value: fallback });
    }
    return field;
};

const pickArray = (mergedMap, key) => {
    const field = mergedMap[key];
    if (!field || !Array.isArray(field.value) || field.value.length === 0) {
        return emptyField(key, { value: [] });
    }
    return field;
};

/**
 * @typedef {Object} BrandOverviewSection
 * @property {import('./fieldFactory').BrandIntelligenceField} name
 * @property {import('./fieldFactory').BrandIntelligenceField} url
 * @property {import('./fieldFactory').BrandIntelligenceField} tagline
 * @property {import('./fieldFactory').BrandIntelligenceField} overview
 * @property {import('./fieldFactory').BrandIntelligenceField} values
 * @property {import('./fieldFactory').BrandIntelligenceField} aesthetic
 * @property {import('./fieldFactory').BrandIntelligenceField} tone
 * @property {import('./fieldFactory').BrandIntelligenceField} fonts
 */

/** @param {Record<string, import('./fieldFactory').BrandIntelligenceField>} mergedMap */
export const buildBrandOverview = (mergedMap) => ({
    name: pick(mergedMap, 'overview.name'),
    url: pick(mergedMap, 'overview.url'),
    tagline: pick(mergedMap, 'overview.tagline'),
    overview: pick(mergedMap, 'overview.overview'),
    values: pickArray(mergedMap, 'overview.values'),
    aesthetic: pickArray(mergedMap, 'overview.aesthetic'),
    tone: pickArray(mergedMap, 'overview.tone'),
    fonts: pickArray(mergedMap, 'overview.fonts'),
});

/** @param {Record<string, import('./fieldFactory').BrandIntelligenceField>} mergedMap */
export const buildBrandColors = (mergedMap) => {
    const section = {};
    for (const k of BRAND_COLOR_KEYS) {
        section[k] = pick(mergedMap, `colors.${k}`);
    }
    return section;
};

/** @param {Record<string, import('./fieldFactory').BrandIntelligenceField>} mergedMap */
export const buildBusinessDetails = (mergedMap) => {
    const section = {};
    for (const k of BUSINESS_DETAIL_KEYS) {
        const key = `businessDetails.${k}`;
        section[k] = (k === 'keyMessages' || k === 'proofPoints')
            ? pickArray(mergedMap, key)
            : pick(mergedMap, key);
    }
    return section;
};

/**
 * @typedef {Object} FileIntelligenceSummary
 * @property {number} totalFiles
 * @property {number} parsedTextCount
 * @property {number} processingCount
 * @property {string[]} fileRefs
 * @property {import('./fieldFactory').BrandIntelligenceField[]} files
 */

export const buildFileIntelligenceSummary = (files = []) => {
    const safeFiles = Array.isArray(files) ? files : [];
    const parsedTextCount = safeFiles.filter((f) => (f.extractedText ?? f.text ?? '').trim()).length;
    const processingCount = safeFiles.filter((f) => f.status === 'processing' || f.status === 'pending').length;
    const includedCount = safeFiles.filter((f) => f.includedInAnalysis !== false).length;

    return {
        totalFiles: safeFiles.length,
        parsedTextCount,
        processingCount,
        includedCount,
        fileRefs: safeFiles.map((f) => `file:${f.id ?? f.name}`),
        files: safeFiles.map((f) => ({
            id: f.id ?? null,
            name: f.name ?? '',
            status: f.status ?? 'unknown',
            hasParsedText: Boolean((f.extractedText ?? f.text ?? '').trim()),
            mimeType: f.mimeType ?? '',
            size: f.size ?? null,
            uploadSource: f.origin ?? 'upload',
            uploadedAt: f.uploadedAt ?? null,
            includedInAnalysis: f.includedInAnalysis !== false,
            extractedThemes: f.analysisMeta?.extractedThemes ?? [],
            extractedStats: f.analysisMeta?.extractedStats ?? [],
            modulesLikelyImpacted: f.analysisMeta?.modulesLikelyImpacted ?? [],
        })),
    };
};

export const buildCompetitorSuggestions = (suggestionFields = []) =>
    suggestionFields.filter((f) => f.key.startsWith('competitorSuggestions.'));

export const buildIcpSuggestions = (suggestionFields = []) =>
    suggestionFields.filter((f) => f.key.startsWith('icpSuggestions.'));

export { BRAND_OVERVIEW_KEYS, BRAND_COLOR_KEYS, BUSINESS_DETAIL_KEYS };
