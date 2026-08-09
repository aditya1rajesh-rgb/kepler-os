import { FIELD_ORIGINS } from './brandContracts';
import { EMPTY_ICP_TARGETING, normalizeTargeting } from './icpTargeting';

const cleanString = (value, max = 600) => String(value ?? '').trim().slice(0, max);

const cleanList = (value, max = 12) => {
    if (Array.isArray(value)) {
        return value.map((v) => cleanString(v, 120)).filter(Boolean).slice(0, max);
    }
    if (typeof value === 'string' && value.trim()) {
        return value
            .split(',')
            .map((v) => cleanString(v, 120))
            .filter(Boolean)
            .slice(0, max);
    }
    return [];
};

const normalizeConfidence = (value) => {
    if (value === 'high' || value === 'medium') return value;
    return 'low';
};

export const resolveIcpSourceOrigin = (sourcesUsed = [], explicitOrigin) => {
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

/** Extended ICP fields persisted in personas.details JSONB. */
export const EMPTY_ICP_DETAILS = {
    segment: '',
    companyType: '',
    geography: '',
    triggers: '',
    blockers: '',
    buyingContext: '',
    messagingHooks: [],
    useCases: '',
    // E22 · platform-agnostic firmographics. Kept inside details rather than as
    // new persona columns: it is one cohesive block that only S8's renditions
    // read, and personas.details is already the extension point (migration 005).
    targeting: EMPTY_ICP_TARGETING,
};

export const EMPTY_ICP_DRAFT = {
    segment: '',
    role: '',
    titles: '',
    companyType: '',
    geography: '',
    primaryPains: '',
    triggers: '',
    blockers: '',
    buyingContext: '',
    messagingHooks: '',
    channels: '',
    targeting: EMPTY_ICP_TARGETING,
};

/**
 * Normalize one ICP suggestion (from AI or edits) into the canonical payload shape.
 * Firmographic specifics (companyType, geography) are withheld when source support is weak,
 * to avoid inventing details - per requirement 6.
 *
 * @returns normalized payload or null when there is not enough to suggest.
 */
export const normalizeIcpSuggestion = (raw, { sourcesUsed = [], populationMode = false } = {}) => {
    const role = cleanString(raw?.role ?? raw?.segment, 160);
    const segment = cleanString(raw?.segment ?? raw?.role, 160);
    if (!role && !segment) return null;

    const confidence = normalizeConfidence(raw?.confidence);
    const hasRealSource = sourcesUsed.includes('website') || sourcesUsed.includes('files');

    // Withhold specific firmographics unless source support is decent.
    const firmographicsAllowed = !populationMode || (hasRealSource && confidence !== 'low');
    const companyType = firmographicsAllowed ? cleanString(raw?.companyType, 200) : '';
    const geography = firmographicsAllowed ? cleanString(raw?.geography, 160) : '';

    const primaryPains = cleanString(raw?.primaryPains ?? raw?.painPoints, 800);
    const messagingHooks = cleanList(raw?.messagingHooks, 8);
    const channels = cleanList(raw?.channels, 8);
    const titles = cleanList(raw?.titles, 10);

    if (populationMode && !primaryPains && messagingHooks.length === 0 && titles.length === 0) {
        // Not enough substance to be a useful starter suggestion.
        return null;
    }

    return {
        segment: segment || role,
        role: role || segment,
        titles,
        companyType,
        geography,
        primaryPains,
        // legacy alias retained for downstream persona mapping + older readers
        painPoints: primaryPains,
        triggers: cleanString(raw?.triggers, 600),
        blockers: cleanString(raw?.blockers ?? raw?.objections, 600),
        buyingContext: cleanString(raw?.buyingContext, 600),
        messagingHooks,
        channels,
        rationale: cleanString(raw?.rationale ?? raw?.reasonSuggested, 600),
        sourceOrigin: resolveIcpSourceOrigin(sourcesUsed, raw?.sourceOrigin),
        confidence,
        useCases: cleanString(raw?.useCases, 800),
        // Unknown taxonomy ids are dropped by normalizeTargeting, so an AI
        // suggestion cannot invent a company size band that no platform sells.
        targeting: normalizeTargeting(raw?.targeting),
    };
};

export const normalizeIcpSuggestions = (rawList, options = {}) => {
    const max = options.max ?? 3;
    return (Array.isArray(rawList) ? rawList : [])
        .map((item) => normalizeIcpSuggestion(item, options))
        .filter(Boolean)
        .slice(0, max);
};

/** Split a normalized ICP payload into persona table columns + details JSONB. */
export const icpPayloadToPersona = (payload = {}) => ({
    role: payload.role || payload.segment || '',
    titles: cleanList(payload.titles, 10),
    painPoints: cleanString(payload.primaryPains ?? payload.painPoints, 800),
    channels: cleanList(payload.channels, 8),
    sourceOrigin: payload.sourceOrigin ?? 'manual',
    details: {
        segment: cleanString(payload.segment, 160),
        companyType: cleanString(payload.companyType, 200),
        geography: cleanString(payload.geography, 160),
        triggers: cleanString(payload.triggers, 600),
        blockers: cleanString(payload.blockers, 600),
        buyingContext: cleanString(payload.buyingContext, 600),
        messagingHooks: cleanList(payload.messagingHooks, 8),
        useCases: cleanString(payload.useCases, 800),
        targeting: normalizeTargeting(payload.targeting),
    },
});

/** Build a draft object (form state) from an existing suggestion payload. */
export const icpPayloadToDraft = (payload = {}) => ({
    segment: payload.segment ?? '',
    role: payload.role ?? '',
    titles: (payload.titles ?? []).join(', '),
    companyType: payload.companyType ?? '',
    geography: payload.geography ?? '',
    primaryPains: payload.primaryPains ?? payload.painPoints ?? '',
    triggers: payload.triggers ?? '',
    blockers: payload.blockers ?? '',
    buyingContext: payload.buyingContext ?? '',
    messagingHooks: (payload.messagingHooks ?? []).join(', '),
    channels: (payload.channels ?? []).join(', '),
    targeting: normalizeTargeting(payload.targeting),
});

/** Build a normalized payload from a form draft (manual add or suggestion edit). */
export const icpDraftToPayload = (draft = {}, options = {}) =>
    normalizeIcpSuggestion(
        {
            segment: draft.segment,
            role: draft.role || draft.segment,
            titles: draft.titles,
            companyType: draft.companyType,
            geography: draft.geography,
            primaryPains: draft.primaryPains,
            triggers: draft.triggers,
            blockers: draft.blockers,
            buyingContext: draft.buyingContext,
            messagingHooks: draft.messagingHooks,
            channels: draft.channels,
            targeting: draft.targeting,
            confidence: 'high',
            sourceOrigin: FIELD_ORIGINS.MANUAL,
        },
        { ...options, populationMode: false }
    );
