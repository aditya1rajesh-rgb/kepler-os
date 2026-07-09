// Per-platform ad copy field limits, ported from the ad-creative skill's spec
// tables. Char limits are ENFORCED IN CODE because the model miscounts
// characters - the prompt asks it to respect limits, but validateVariant is the
// source of truth the UI trusts.
//
// Limits are the recommended/visible caps (not absolute API maxes) so copy looks
// right in-feed. Fields a platform doesn't use are omitted.

export const AD_PLATFORM_SPECS = {
    google: {
        label: 'Google Ads (RSA)',
        fields: { headline: 30, description: 90 },
        guidance: 'Responsive Search Ad: punchy 30-char headlines, 90-char descriptions. No primary text.',
    },
    meta: {
        label: 'Meta',
        fields: { headline: 40, primaryText: 125, description: 30 },
        guidance: 'Front-load the hook in the first 125 chars of primary text; it truncates after that in-feed.',
    },
    linkedin: {
        label: 'LinkedIn',
        fields: { headline: 70, primaryText: 150, description: 100 },
        guidance: 'Professional tone, no consumer hype. Intro text shows ~150 chars before "see more".',
    },
};

// Multi-platform: validate against the most restrictive field limits so copy
// fits everywhere (Google's 30-char headline is the binding constraint).
export const MULTI_PLATFORM_SPEC = {
    label: 'Multi-platform',
    fields: { headline: 30, primaryText: 125, description: 30 },
    guidance: 'Copy must fit the most restrictive platform (Google headline 30, Meta description 30).',
};

export const getPlatformSpec = (platform) =>
    platform === 'multi' ? MULTI_PLATFORM_SPEC : (AD_PLATFORM_SPECS[platform] ?? MULTI_PLATFORM_SPEC);

/**
 * Attach code-computed char counts + within-limit flags to a generated variant.
 * @returns the variant with a `fieldStatus` map and an `overLimit` boolean.
 */
export const validateVariant = (variant, platform) => {
    const spec = getPlatformSpec(platform);
    const fieldStatus = {};
    let overLimit = false;
    for (const [field, limit] of Object.entries(spec.fields)) {
        const text = String(variant?.[field] ?? '');
        if (!text) continue;
        const chars = text.length;
        const withinLimit = chars <= limit;
        if (!withinLimit) overLimit = true;
        fieldStatus[field] = { chars, limit, withinLimit };
    }
    return { ...variant, fieldStatus, overLimit };
};
