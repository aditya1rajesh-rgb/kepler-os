import { FIELD_ORIGINS } from './brandContracts';

export const provenanceKey = (path) => path;

export const createProvenanceEntry = (origin, source = '', extra = {}) => ({
    origin,
    source,
    updatedAt: new Date().toISOString(),
    ...extra,
});

export const getFieldProvenance = (provenanceMap, path) =>
    provenanceMap?.[path] ?? null;

export const isManualField = (provenanceMap, path) =>
    getFieldProvenance(provenanceMap, path)?.origin === FIELD_ORIGINS.MANUAL;

export const markFieldManual = (provenanceMap, path) => ({
    ...provenanceMap,
    [path]: createProvenanceEntry(FIELD_ORIGINS.MANUAL, 'user-edit'),
});

export const applyProvenanceBatch = (provenanceMap, entries) => {
    const next = { ...provenanceMap };
    for (const [path, entry] of Object.entries(entries)) {
        if (isManualField(provenanceMap, path)) continue;
        next[path] = entry;
    }
    return next;
};

import { ORIGIN_LABELS } from './brandContracts';

export const provenanceLabel = (entry) => {
    if (!entry?.origin) return null;
    return ORIGIN_LABELS[entry.origin] ?? entry.origin;
};
