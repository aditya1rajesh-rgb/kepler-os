import { FIELD_ORIGINS } from './brandContracts';

const normalizeConfidence = (value) => {
    if (value === 'high' || value === 'medium') return value;
    return 'low';
};

export const resolveCompetitorSourceOrigin = (sourcesUsed = [], explicitOrigin) => {
    if (explicitOrigin && Object.values(FIELD_ORIGINS).includes(explicitOrigin)) {
        return explicitOrigin;
    }
    const hasWebsite = sourcesUsed.includes('website');
    const hasFiles = sourcesUsed.includes('files');
    if (hasFiles && hasWebsite) return FIELD_ORIGINS.COMBINED;
    if (hasFiles) return FIELD_ORIGINS.FILE;
    if (hasWebsite) return FIELD_ORIGINS.WEBSITE;
    return FIELD_ORIGINS.AI;
};

/**
 * Normalize a single competitor suggestion from AI or API input.
 * Returns null when name is missing or confidence is too low for auto-suggestion.
 */
export const normalizeCompetitorSuggestion = (raw, { sourcesUsed = [], populationMode = false } = {}) => {
    const name = String(raw?.name ?? '').trim();
    if (!name) return null;

    const confidence = normalizeConfidence(raw?.confidence);
    if (populationMode && confidence === 'low') return null;

    const reasonSuggested = String(
        raw?.reasonSuggested ?? raw?.rationale ?? raw?.reason ?? ''
    ).trim();

    if (populationMode && !reasonSuggested) return null;

    return {
        name,
        url: String(raw?.url ?? '').trim(),
        reasonSuggested,
        sourceOrigin: resolveCompetitorSourceOrigin(sourcesUsed, raw?.sourceOrigin),
        confidence,
        messagingSummary: String(raw?.messagingSummary ?? '').trim(),
    };
};

export const normalizeCompetitorSuggestions = (rawList, options = {}) =>
    (Array.isArray(rawList) ? rawList : [])
        .map((item) => normalizeCompetitorSuggestion(item, options))
        .filter(Boolean);

export const competitorNameKey = (name) => String(name ?? '').trim().toLowerCase();

export const EMPTY_COMPETITOR_SUGGESTION_DRAFT = {
    name: '',
    url: '',
    reasonSuggested: '',
};
