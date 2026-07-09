import { SOURCE_PRIORITY, SOURCE_ORIGINS } from './constants';
import { createField, isEmptyValue } from './fieldFactory';

const priorityOf = (sourceOrigin) => {
    const idx = SOURCE_PRIORITY.indexOf(sourceOrigin);
    return idx === -1 ? -1 : idx;
};

/**
 * Pick the winning field when multiple sources supply the same key.
 * Rules:
 *  1. Confirmed user_input always wins.
 *  2. Higher SOURCE_PRIORITY wins.
 *  3. If same priority, prefer non-empty over empty.
 *  4. If still tied, prefer newer updatedAt.
 */
export const mergeField = (existing, incoming) => {
    if (!existing) return incoming ?? null;
    if (!incoming) return existing;
    if (isEmptyValue(incoming.value) && !isEmptyValue(existing.value)) return existing;
    if (isEmptyValue(existing.value) && !isEmptyValue(incoming.value)) return incoming;

    if (existing.confirmed && existing.sourceOrigin === SOURCE_ORIGINS.USER_INPUT) return existing;
    if (incoming.confirmed && incoming.sourceOrigin === SOURCE_ORIGINS.USER_INPUT) return incoming;

    const existingPri = priorityOf(existing.sourceOrigin);
    const incomingPri = priorityOf(incoming.sourceOrigin);

    if (incomingPri > existingPri) return incoming;
    if (existingPri > incomingPri) return existing;

    const existingTime = existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
    const incomingTime = incoming.updatedAt ? Date.parse(incoming.updatedAt) : 0;
    if (incomingTime > existingTime) return incoming;

    return existing;
};

/**
 * Merge an array of source bundles into a flat key → field map.
 * Each bundle: { fields: BrandIntelligenceField[] }
 */
export const mergeSourceBundles = (bundles = []) => {
    const merged = {};

    for (const bundle of bundles) {
        if (!bundle?.fields) continue;
        for (const field of bundle.fields) {
            if (!field?.key) continue;
            merged[field.key] = mergeField(merged[field.key], field);
        }
    }

    return merged;
};

/**
 * Merge suggestion field arrays - dedupe by key, incoming wins if same key.
 */
export const mergeSuggestionFields = (...lists) => {
    const map = {};
    for (const list of lists) {
        for (const field of list ?? []) {
            if (!field?.key) continue;
            map[field.key] = mergeField(map[field.key], field);
        }
    }
    return Object.values(map);
};

/**
 * Combine multiple source refs into a combined-origin field (for display/metadata).
 */
export const asCombinedField = (field, extraRefs = []) => {
    if (!field) return null;
    const refs = [...new Set([...(field.sourceRefs ?? []), ...extraRefs])];
    if (refs.length <= 1) return field;
    return createField({
        ...field,
        sourceOrigin: SOURCE_ORIGINS.COMBINED,
        sourceRefs: refs,
    });
};
