import { colorIdentityToLegacyColors } from '../../../lib/brandContracts';
import { fieldMetaToProvenanceEntry } from '../provenanceAdapter';
import { getFieldValue } from '../fieldFactory';
import { BRAND_COLOR_KEYS, BUSINESS_DETAIL_KEYS } from '../constants';

/**
 * Adapter: flatten a BrandIntelligenceModel (or section subset) back into
 * the existing persisted brand profile shape for upsertBrandIdentity().
 *
 * Does NOT invent values - only writes fields that have content in the model.
 */
export const toLegacyBrandProfile = (model, existingProfile = {}) => {
    if (!model) return existingProfile;

    const { brandOverview, brandColors, businessDetails: businessDetailsSection, fields = {} } = model;

    const fieldProvenance = { ...(existingProfile.fieldProvenance ?? {}) };

    const applyProvenance = (path, field) => {
        if (field && field.sourceOrigin) {
            fieldProvenance[path] = fieldMetaToProvenanceEntry(field);
        }
    };

    const existingDetails = existingProfile.businessDetails ?? {};
    const existingColors = existingProfile.colorIdentity ?? {};

    const colorIdentity = {};
    for (const k of BRAND_COLOR_KEYS) {
        const field = brandColors?.[k];
        if (field) {
            colorIdentity[k] = getFieldValue(field, existingColors[k] ?? '');
            applyProvenance(`colorIdentity.${k}`, field);
        }
    }

    const businessDetailsOut = {};
    for (const k of BUSINESS_DETAIL_KEYS) {
        const field = businessDetailsSection?.[k];
        const fallback = k === 'keyMessages' || k === 'proofPoints'
            ? (existingDetails[k] ?? [])
            : (existingDetails[k] ?? '');
        if (field) {
            businessDetailsOut[k] = getFieldValue(field, fallback);
            applyProvenance(`businessDetails.${k}`, field);
        }
    }

    // Keep legacy productsServices in sync with offersProducts
    if (businessDetailsOut.offersProducts && !businessDetailsOut.productsServices) {
        businessDetailsOut.productsServices = businessDetailsOut.offersProducts;
    }

    const overviewFields = [
        ['tagline', brandOverview?.tagline],
        ['overview', brandOverview?.overview],
        ['values', brandOverview?.values],
        ['aesthetic', brandOverview?.aesthetic],
        ['tone', brandOverview?.tone],
        ['fonts', brandOverview?.fonts],
    ];

    for (const [key, field] of overviewFields) {
        applyProvenance(key, field);
    }

    return {
        ...existingProfile,
        name: getFieldValue(brandOverview?.name, existingProfile.name ?? ''),
        url: getFieldValue(brandOverview?.url, existingProfile.url ?? ''),
        tagline: getFieldValue(brandOverview?.tagline, existingProfile.tagline ?? ''),
        overview: getFieldValue(brandOverview?.overview, existingProfile.overview ?? ''),
        values: getFieldValue(brandOverview?.values, existingProfile.values ?? []),
        aesthetic: getFieldValue(brandOverview?.aesthetic, existingProfile.aesthetic ?? []),
        tone: getFieldValue(brandOverview?.tone, existingProfile.tone ?? []),
        fonts: getFieldValue(brandOverview?.fonts, existingProfile.fonts ?? []),
        colorIdentity: { ...existingColors, ...colorIdentity },
        businessDetails: { ...existingDetails, ...businessDetailsOut },
        colors: colorIdentityToLegacyColors({ ...existingColors, ...colorIdentity }),
        fieldProvenance,
    };
};

/**
 * Extract competitor/ICP suggestion payloads from model for brand_suggestions table.
 */
export const toLegacySuggestions = (model) => {
    const competitors = (model?.competitorSuggestions ?? []).map((f) => ({
        ...(f.value ?? {}),
        _field: f,
    }));

    const icps = (model?.icpSuggestions ?? []).map((f) => ({
        ...(f.value ?? {}),
        _field: f,
    }));

    return { competitors, icps };
};
