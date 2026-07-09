import { FIELD_ORIGINS } from '../../lib/brandContracts';
import { SOURCE_ORIGINS } from './constants';

/** Map legacy field_provenance.origin → canonical sourceOrigin. */
export const legacyOriginToSourceOrigin = (legacyOrigin) => {
    switch (legacyOrigin) {
        case FIELD_ORIGINS.MANUAL:
            return SOURCE_ORIGINS.USER_INPUT;
        case FIELD_ORIGINS.WORKSPACE:
            return SOURCE_ORIGINS.USER_INPUT;
        case FIELD_ORIGINS.WEBSITE:
            return SOURCE_ORIGINS.WEBSITE;
        case FIELD_ORIGINS.FILE:
            return SOURCE_ORIGINS.FILE;
        case FIELD_ORIGINS.COMBINED:
            return SOURCE_ORIGINS.COMBINED;
        case FIELD_ORIGINS.AI:
            return SOURCE_ORIGINS.AI_SUGGESTION;
        default:
            return SOURCE_ORIGINS.USER_INPUT;
    }
};

/** Map canonical sourceOrigin → legacy field_provenance.origin for persistence adapter. */
export const sourceOriginToLegacyOrigin = (sourceOrigin) => {
    switch (sourceOrigin) {
        case SOURCE_ORIGINS.WEBSITE:
            return FIELD_ORIGINS.WEBSITE;
        case SOURCE_ORIGINS.FILE:
            return FIELD_ORIGINS.FILE;
        case SOURCE_ORIGINS.AI_SUGGESTION:
            return FIELD_ORIGINS.AI;
        case SOURCE_ORIGINS.COMBINED:
            return FIELD_ORIGINS.COMBINED;
        case SOURCE_ORIGINS.USER_INPUT:
        default:
            return FIELD_ORIGINS.MANUAL;
    }
};

export const provenanceEntryToFieldMeta = (provenanceEntry) => {
    if (!provenanceEntry) {
        return {
            sourceOrigin: SOURCE_ORIGINS.USER_INPUT,
            sourceRefs: [],
            confidence: null,
            confirmed: false,
            updatedAt: null,
        };
    }

    const sourceOrigin = legacyOriginToSourceOrigin(provenanceEntry.origin);
    const isManual = provenanceEntry.origin === FIELD_ORIGINS.MANUAL;

    return {
        sourceOrigin,
        sourceRefs: provenanceEntry.source ? [provenanceEntry.source] : [],
        confidence: provenanceEntry.confidence ?? null,
        confirmed: isManual || provenanceEntry.confirmed === true,
        updatedAt: provenanceEntry.updatedAt ?? null,
    };
};

export const fieldMetaToProvenanceEntry = (field) => ({
    origin: sourceOriginToLegacyOrigin(field.sourceOrigin),
    source: field.sourceRefs?.[0] ?? '',
    confidence: field.confidence,
    confirmed: field.confirmed,
    updatedAt: field.updatedAt ?? new Date().toISOString(),
});
