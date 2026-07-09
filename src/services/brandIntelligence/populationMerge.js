import { isManualField } from '../../lib/provenance';
import { extractPersistedSource } from './sources/persistedSource';
import { extractPopulationFromAi } from './sources/populationSource';
import { mergeSourceBundles } from './merge';
import { buildBrandOverview, buildBrandColors, buildBusinessDetails } from './structures';
import { toLegacyBrandProfile } from './adapters/toLegacy';
import { isEmptyValue } from './fieldFactory';

const legacyPathForFieldKey = (fieldKey) => {
    if (fieldKey.startsWith('overview.')) return fieldKey.slice('overview.'.length);
    if (fieldKey.startsWith('colors.')) return `colorIdentity.${fieldKey.slice('colors.'.length)}`;
    return fieldKey;
};

const getBrandValueAtPath = (brand, legacyPath) => {
    if (legacyPath.startsWith('businessDetails.')) {
        const key = legacyPath.slice('businessDetails.'.length);
        return brand.businessDetails?.[key];
    }
    if (legacyPath.startsWith('colorIdentity.')) {
        const key = legacyPath.slice('colorIdentity.'.length);
        return brand.colorIdentity?.[key];
    }
    return brand[legacyPath];
};

const fieldHasBrandValue = (brand, legacyPath) => !isEmptyValue(getBrandValueAtPath(brand, legacyPath));

/**
 * Merge AI population candidates into an existing brand profile using the shared
 * Brand Intelligence merge layer. Respects manual edits and forceRefresh semantics.
 *
 * @returns {{ brand: Object, fieldsUpdated: number }}
 */
export const mergePopulationIntoProfile = (existingBrand, aiSynthesis, {
    sourcesUsed = [],
    forceRefresh = false,
} = {}) => {
    const incomingBundle = extractPopulationFromAi(aiSynthesis, sourcesUsed);
    const provenance = existingBrand.fieldProvenance ?? {};

    const filteredIncoming = incomingBundle.fields.filter((field) => {
        const legacyPath = legacyPathForFieldKey(field.key);
        const hasValue = fieldHasBrandValue(existingBrand, legacyPath);
        // Manual edits are protected only when they actually hold a value. An
        // empty manual field has nothing to preserve, so an explicit generate
        // (or refresh) is allowed to fill it - otherwise "Generate" reports
        // success but silently writes nothing.
        if (isManualField(provenance, legacyPath) && hasValue) return false;
        if (!forceRefresh && hasValue) return false;
        return true;
    });

    const persistedBundle = extractPersistedSource(existingBrand, {
        onlyConfirmedManual: forceRefresh,
    });

    const mergedFields = mergeSourceBundles([
        { fields: filteredIncoming },
        persistedBundle,
    ]);

    const model = {
        brandOverview: buildBrandOverview(mergedFields),
        brandColors: buildBrandColors(mergedFields),
        businessDetails: buildBusinessDetails(mergedFields),
        fields: mergedFields,
    };

    const brand = toLegacyBrandProfile(model, existingBrand);

    return {
        brand,
        fieldsUpdated: filteredIncoming.length,
    };
};

export default mergePopulationIntoProfile;
