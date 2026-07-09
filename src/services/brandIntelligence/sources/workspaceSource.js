import { createField } from '../fieldFactory';
import { SOURCE_ORIGINS, ONBOARDING_DEFAULT_PALETTE } from '../constants';
import { normalizeHexColor } from '../../../lib/brandContracts';

const paletteIsDefault = (colors = []) => {
    if (!Array.isArray(colors) || colors.length === 0) return false;
    const normalized = colors.map((c) => normalizeHexColor(c) || String(c).toLowerCase());
    const defaults = ONBOARDING_DEFAULT_PALETTE.map((c) => c.toLowerCase());
    return normalized.length === defaults.length && normalized.every((c, i) => c === defaults[i]);
};

/**
 * Extract field candidates from workspace / onboarding record.
 * Name and URL are confirmed user_input. Default palette is excluded from colour fields.
 */
export const extractWorkspaceSource = (workspace) => {
    if (!workspace) return { fields: [], meta: { source: 'workspace', id: null } };

    const refs = [`workspace:${workspace.id ?? 'unknown'}`];
    const fields = [];

    if (workspace.name) {
        fields.push(createField({
            key: 'overview.name',
            value: workspace.name,
            sourceOrigin: SOURCE_ORIGINS.USER_INPUT,
            sourceRefs: refs,
            confirmed: true,
            editable: false,
        }));
    }

    if (workspace.url) {
        fields.push(createField({
            key: 'overview.url',
            value: workspace.url,
            sourceOrigin: SOURCE_ORIGINS.USER_INPUT,
            sourceRefs: refs,
            confirmed: true,
            editable: false,
        }));
    }

    if (workspace.tagline) {
        fields.push(createField({
            key: 'overview.tagline',
            value: workspace.tagline,
            sourceOrigin: SOURCE_ORIGINS.USER_INPUT,
            sourceRefs: refs,
            confirmed: true,
        }));
    }

    if (workspace.industry) {
        fields.push(createField({
            key: 'businessDetails.industry',
            value: workspace.industry,
            sourceOrigin: SOURCE_ORIGINS.USER_INPUT,
            sourceRefs: refs,
            confirmed: true,
        }));
    }

    // Legacy flat palette on workspace - only surface if NOT the generic onboarding default
    const brandColors = workspace.brandColors ?? [];
    if (brandColors.length > 0 && !paletteIsDefault(brandColors)) {
        brandColors.forEach((color, index) => {
            const hex = normalizeHexColor(color);
            if (!hex) return;
            fields.push(createField({
                key: `colors.legacyPalette.${index}`,
                value: hex,
                sourceOrigin: SOURCE_ORIGINS.USER_INPUT,
                sourceRefs: [...refs, 'workspace.brand_colors'],
                confirmed: false,
                confidence: null,
            }));
        });
    }

    return { fields, meta: { source: 'workspace', id: workspace.id ?? null } };
};

export { paletteIsDefault };
