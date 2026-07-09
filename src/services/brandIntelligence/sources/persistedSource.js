import { createField } from '../fieldFactory';
import { provenanceEntryToFieldMeta } from '../provenanceAdapter';
import { SOURCE_ORIGINS, BRAND_OVERVIEW_KEYS, BRAND_COLOR_KEYS, BUSINESS_DETAIL_KEYS } from '../constants';
import { paletteIsDefault } from './workspaceSource';

const overviewKey = (k) => `overview.${k}`;
const colorKey = (k) => `colors.${k}`;
const detailKey = (k) => `businessDetails.${k}`;

/**
 * Extract field candidates from a persisted (flat) brand profile row.
 * Uses field_provenance when present; falls back to user_input for non-empty values.
 */
export const extractPersistedSource = (brandProfile, { onlyConfirmedManual = false } = {}) => {
    if (!brandProfile) return { fields: [], meta: { source: 'persisted', id: null } };

    const refs = [`brand_profile:${brandProfile.id ?? brandProfile.workspaceId ?? 'unknown'}`];
    const provenance = brandProfile.fieldProvenance ?? brandProfile.field_provenance ?? {};
    const fields = [];

    const isManualPath = (path) =>
        provenance[path]?.origin === 'manual';

    const pushScalar = (key, value, confirmedDefault = true) => {
        if (onlyConfirmedManual && !isManualPath(key)) return;
        if (value == null || (typeof value === 'string' && !value.trim())) return;
        const meta = provenanceEntryToFieldMeta(provenance[key]);
        const hasProv = Boolean(provenance[key]);
        fields.push(createField({
            key,
            value,
            sourceOrigin: hasProv ? meta.sourceOrigin : SOURCE_ORIGINS.USER_INPUT,
            sourceRefs: hasProv ? meta.sourceRefs : refs,
            confidence: meta.confidence,
            confirmed: hasProv ? meta.confirmed : confirmedDefault,
            updatedAt: meta.updatedAt,
        }));
    };

    const pushFromPath = (pathPrefix, objKey, value) => {
        const path = `${pathPrefix}.${objKey}`;
        pushScalar(path, value);
    };

    // Overview scalars - name/url always preserved during force refresh
    pushFromPath('overview', 'name', brandProfile.name);
    pushFromPath('overview', 'url', brandProfile.url);

    if (!onlyConfirmedManual) {
        pushFromPath('overview', 'tagline', brandProfile.tagline);
        pushFromPath('overview', 'overview', brandProfile.overview);
    } else {
        if (isManualPath('tagline')) pushFromPath('overview', 'tagline', brandProfile.tagline);
        if (isManualPath('overview')) pushFromPath('overview', 'overview', brandProfile.overview);
    }

    // Overview arrays
    if (!onlyConfirmedManual) {
        for (const k of ['values', 'aesthetic', 'tone', 'fonts']) {
            const arr = brandProfile[k] ?? brandProfile[k === 'values' ? 'brand_values' : k];
            if (Array.isArray(arr) && arr.length > 0) {
                pushScalar(`overview.${k}`, arr);
            }
        }
    } else {
        for (const k of ['values', 'aesthetic', 'tone', 'fonts']) {
            const path = `overview.${k}`;
            if (!isManualPath(path)) continue;
            const arr = brandProfile[k];
            if (Array.isArray(arr) && arr.length > 0) {
                pushScalar(path, arr);
            }
        }
    }

    // Structured color identity (preferred)
    const colorIdentity = brandProfile.colorIdentity ?? brandProfile.color_identity ?? {};
    if (!onlyConfirmedManual) {
        for (const k of BRAND_COLOR_KEYS) {
            if (colorIdentity[k]) {
                pushFromPath('colors', k, colorIdentity[k]);
            }
        }
    } else {
        for (const k of BRAND_COLOR_KEYS) {
            const path = `colorIdentity.${k}`;
            if (!isManualPath(path)) continue;
            if (colorIdentity[k]) {
                pushFromPath('colors', k, colorIdentity[k]);
            }
        }
    }

    // Legacy flat colors - only if colorIdentity empty AND not default palette
    const legacyColors = brandProfile.colors ?? [];
    const hasStructuredColors = BRAND_COLOR_KEYS.some((k) => colorIdentity[k]);
    if (!hasStructuredColors && legacyColors.length > 0 && !paletteIsDefault(legacyColors)) {
        legacyColors.forEach((color, index) => {
            pushScalar(`colors.legacyPalette.${index}`, color, false);
        });
    }

    // Business details
    const details = brandProfile.businessDetails ?? brandProfile.business_details ?? {};
    for (const k of BUSINESS_DETAIL_KEYS) {
        const path = `businessDetails.${k}`;
        if (onlyConfirmedManual && !isManualPath(path)) continue;
        const val = details[k];
        if (val != null && (Array.isArray(val) ? val.length > 0 : String(val).trim())) {
            pushFromPath('businessDetails', k, val);
        }
    }

    return { fields, meta: { source: 'persisted', id: brandProfile.id ?? null } };
};

export { overviewKey, colorKey, detailKey, BRAND_OVERVIEW_KEYS };
