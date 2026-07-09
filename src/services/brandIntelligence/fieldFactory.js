import { SOURCE_ORIGINS } from './constants';

const isEmptyValue = (value) => {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
};

/**
 * @typedef {Object} BrandIntelligenceField
 * @property {string} key
 * @property {*} value
 * @property {'user_input'|'website'|'file'|'combined'|'ai_suggestion'} sourceOrigin
 * @property {string[]} sourceRefs
 * @property {number|null} confidence
 * @property {boolean} confirmed
 * @property {boolean} editable
 * @property {string|null} updatedAt ISO timestamp
 */

/** @returns {BrandIntelligenceField} */
export const createField = ({
    key,
    value = null,
    sourceOrigin = SOURCE_ORIGINS.USER_INPUT,
    sourceRefs = [],
    confidence = null,
    confirmed = false,
    editable = true,
    updatedAt = null,
} = {}) => ({
    key: String(key),
    value: value ?? (Array.isArray(value) ? [] : typeof value === 'string' ? '' : value),
    sourceOrigin,
    sourceRefs: Array.isArray(sourceRefs) ? sourceRefs : [],
    confidence: confidence == null ? null : Math.min(1, Math.max(0, Number(confidence))),
    confirmed: Boolean(confirmed),
    editable: editable !== false,
    updatedAt: updatedAt ?? null,
});

/** @returns {BrandIntelligenceField} */
export const emptyField = (key, overrides = {}) =>
    createField({
        key,
        value: Array.isArray(overrides.value) ? [] : '',
        sourceOrigin: SOURCE_ORIGINS.USER_INPUT,
        confirmed: false,
        editable: true,
        ...overrides,
    });

export const fieldHasValue = (field) => !isEmptyValue(field?.value);

export const getFieldValue = (field, fallback = '') => {
    if (!field || isEmptyValue(field.value)) return fallback;
    return field.value;
};

export const mapFieldsByKey = (fields = []) =>
    fields.reduce((acc, field) => {
        if (field?.key) acc[field.key] = field;
        return acc;
    }, {});

export { isEmptyValue };
