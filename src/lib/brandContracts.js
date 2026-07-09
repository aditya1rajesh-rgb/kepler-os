/** Lightweight provenance origins for brand field values. */
export const FIELD_ORIGINS = {
    MANUAL: 'manual',
    WORKSPACE: 'workspace',
    WEBSITE: 'website',
    FILE: 'file',
    COMBINED: 'combined',
    AI: 'ai',
};

export const ORIGIN_LABELS = {
    manual: 'Edited by you',
    workspace: 'From workspace',
    website: 'From website',
    file: 'Suggested from files',
    combined: 'Combined suggestion',
    ai: 'Suggested',
};

export const EMPTY_COLOR_IDENTITY = {
    primaryColor: '',
    secondaryColor: '',
    accentColor: '',
    supportDarkColor: '',
    backgroundLightColor: '',
    textColor: '',
    typographySuggestion: '',
    visualDirectionNotes: '',
};

export const EMPTY_BUSINESS_DETAILS = {
    industry: '',
    productsServices: '',
    offersProducts: '',
    offerDescriptions: '',
    targetMarket: '',
    valueProposition: '',
    differentiators: '',
    painPointsSolved: '',
    proofPoints: [],
    companySize: '',
    geographicFocus: '',
    keyMessages: [],
};

/** Primary fields shown on the Business Details tab. */
export const BUSINESS_DETAILS_TAB_SCALAR_KEYS = [
    'offersProducts',
    'offerDescriptions',
    'differentiators',
    'painPointsSolved',
];

/** Legacy / supplemental keys kept in JSONB for backward compatibility. */
export const BUSINESS_DETAILS_LEGACY_KEYS = [
    'industry',
    'productsServices',
    'targetMarket',
    'valueProposition',
    'companySize',
    'geographicFocus',
    'keyMessages',
];

export const EMPTY_POPULATION_META = {
    lastRunAt: null,
    lastRunStatus: 'idle',
    lastRunErrors: [],
    sourcesUsed: [],
    autoRunCompleted: false,
};

export const COLOR_IDENTITY_FIELDS = [
    { key: 'primaryColor', label: 'Primary colour' },
    { key: 'secondaryColor', label: 'Secondary colour' },
    { key: 'accentColor', label: 'Accent colour' },
    { key: 'supportDarkColor', label: 'Dark / support colour' },
    { key: 'backgroundLightColor', label: 'Light / background colour' },
    { key: 'textColor', label: 'Text colour' },
];

export const isEmptyColorIdentity = (ci) =>
    !ci || COLOR_IDENTITY_FIELDS.every(({ key }) => !String(ci[key] ?? '').trim());

export const colorIdentityToLegacyColors = (ci) => {
    if (!ci) return [];
    return COLOR_IDENTITY_FIELDS
        .map(({ key }) => ci[key])
        .filter((c) => c && /^#[0-9a-fA-F]{3,8}$/.test(String(c).trim()));
};

export const normalizeHexColor = (value) => {
    if (!value) return '';
    const trimmed = String(value).trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
    return '';
};

export const normalizeColorIdentity = (raw = {}) => ({
    primaryColor: normalizeHexColor(raw.primaryColor),
    secondaryColor: normalizeHexColor(raw.secondaryColor),
    accentColor: normalizeHexColor(raw.accentColor),
    supportDarkColor: normalizeHexColor(raw.supportDarkColor),
    backgroundLightColor: normalizeHexColor(raw.backgroundLightColor),
    textColor: normalizeHexColor(raw.textColor),
    typographySuggestion: String(raw.typographySuggestion ?? '').trim(),
    visualDirectionNotes: String(raw.visualDirectionNotes ?? '').trim(),
});

export const normalizeProofPoints = (raw, { populationMode = false } = {}) => {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item) => {
            if (typeof item === 'string') {
                const text = item.trim();
                return text ? { text, confidence: 'low', source: '' } : null;
            }
            const text = String(item?.text ?? item?.stat ?? '').trim();
            if (!text) return null;
            const confidence = item?.confidence === 'high' ? 'high' : 'low';
            return {
                text,
                confidence,
                source: String(item?.source ?? '').trim(),
            };
        })
        .filter(Boolean)
        .filter((p) => !populationMode || p.confidence === 'high');
};

export const normalizeBusinessDetails = (raw = {}, options = {}) => {
    const offersProducts = String(raw.offersProducts ?? raw.productsServices ?? '').trim();
    return {
        industry: String(raw.industry ?? '').trim(),
        productsServices: offersProducts || String(raw.productsServices ?? '').trim(),
        offersProducts,
        offerDescriptions: String(raw.offerDescriptions ?? '').trim(),
        targetMarket: String(raw.targetMarket ?? '').trim(),
        valueProposition: String(raw.valueProposition ?? '').trim(),
        differentiators: String(raw.differentiators ?? '').trim(),
        painPointsSolved: String(raw.painPointsSolved ?? '').trim(),
        proofPoints: normalizeProofPoints(raw.proofPoints, options),
        companySize: String(raw.companySize ?? '').trim(),
        geographicFocus: String(raw.geographicFocus ?? '').trim(),
        keyMessages: Array.isArray(raw.keyMessages)
            ? raw.keyMessages.map((m) => String(m).trim()).filter(Boolean)
            : [],
    };
};

export const isBrandSparse = (brand) => {
    if (!brand) return true;
    const hasOverview = Boolean(brand.overview?.trim());
    const hasValues = (brand.values?.length ?? 0) > 0;
    const hasTone = (brand.tone?.length ?? 0) > 0;
    const hasColors = !isEmptyColorIdentity(brand.colorIdentity);
    const details = brand.businessDetails ?? {};
    const hasDetails = Boolean(
        details.offersProducts?.trim() ||
        details.productsServices?.trim() ||
        details.offerDescriptions?.trim() ||
        details.differentiators?.trim() ||
        details.painPointsSolved?.trim() ||
        (details.proofPoints?.length ?? 0) > 0 ||
        details.valueProposition?.trim()
    );
    return !(hasOverview || hasValues || hasTone || hasColors || hasDetails);
};

export const shouldAutoPopulate = (brand, populationMeta, workspaceUrl, hasFiles = false) => {
    if (!workspaceUrl?.trim() && !hasFiles) return false;
    const sparse = isBrandSparse(brand);
    const completed = Boolean(populationMeta?.autoRunCompleted);

    if (!completed) return sparse;

    // Retry-aware behavior:
    // - completed runs that were partial/failed remain retryable
    // - completed runs with no saved suggestions and still sparse data remain retryable
    const lastStatus = String(populationMeta?.lastRunStatus ?? 'idle');
    const savedSuggestionCount = Number(populationMeta?.savedSuggestionCount ?? 0);
    const fieldsUpdated = Number(populationMeta?.fieldsUpdated ?? 0);
    const hasErrors = Array.isArray(populationMeta?.lastRunErrors) && populationMeta.lastRunErrors.length > 0;

    if (lastStatus !== 'success' || hasErrors) return true;
    if (sparse && savedSuggestionCount === 0 && fieldsUpdated === 0) return true;
    return false;
};
