/**
 * Canonical source origins for Brand Intelligence field values.
 * Distinct from legacy FIELD_ORIGINS in lib/provenance.js - mapped via provenanceAdapter.
 */
export const SOURCE_ORIGINS = {
    USER_INPUT: 'user_input',
    WEBSITE: 'website',
    FILE: 'file',
    COMBINED: 'combined',
    AI_SUGGESTION: 'ai_suggestion',
};

/** Merge priority - higher index wins when values conflict. */
export const SOURCE_PRIORITY = [
    SOURCE_ORIGINS.AI_SUGGESTION,
    SOURCE_ORIGINS.FILE,
    SOURCE_ORIGINS.WEBSITE,
    SOURCE_ORIGINS.COMBINED,
    SOURCE_ORIGINS.USER_INPUT,
];

/** Known onboarding default palette - not promoted as confirmed brand colours. */
export const ONBOARDING_DEFAULT_PALETTE = [
    '#6666ff',
    '#b9b8ff',
    '#b9f0d7',
    '#ffffff',
];

export const BRAND_OVERVIEW_KEYS = [
    'name',
    'url',
    'tagline',
    'overview',
    'values',
    'aesthetic',
    'tone',
    'fonts',
];

export const BRAND_COLOR_KEYS = [
    'primaryColor',
    'secondaryColor',
    'accentColor',
    'supportDarkColor',
    'backgroundLightColor',
    'textColor',
    'typographySuggestion',
    'visualDirectionNotes',
];

export const BUSINESS_DETAIL_KEYS = [
    'industry',
    'productsServices',
    'offersProducts',
    'offerDescriptions',
    'targetMarket',
    'valueProposition',
    'differentiators',
    'painPointsSolved',
    'proofPoints',
    'companySize',
    'geographicFocus',
    'keyMessages',
];
