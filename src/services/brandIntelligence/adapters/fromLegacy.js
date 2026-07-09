import { buildBrandIntelligenceModel } from '../buildModel';
import { createLiveBrandBaseline } from '../../../lib/liveDefaults';

/**
 * Adapter: compose a BrandIntelligenceModel from legacy service outputs
 * without requiring schema migration or UI changes.
 *
 * @param {Object} params
 * @param {Object} params.workspace - mapped workspace row
 * @param {Object|null} params.brandProfile - mapped brand profile or baseline
 * @param {Array} [params.files]
 * @param {Array} [params.storedSuggestions]
 * @param {Object} [params.websiteAnalysis]
 * @param {Object} [params.fileAnalysis]
 * @param {Object} [params.aiSynthesis]
 */
export const fromLegacyRecords = ({
    workspace,
    brandProfile,
    files = [],
    storedSuggestions = [],
    websiteAnalysis = null,
    fileAnalysis = null,
    aiSynthesis = null,
    aiCombined = false,
}) => {
    const resolvedBrand = brandProfile ?? createLiveBrandBaseline(workspace);

    return buildBrandIntelligenceModel({
        workspace,
        brandProfile: resolvedBrand,
        files,
        storedSuggestions,
        websiteAnalysis,
        fileAnalysis,
        aiSynthesis,
        aiCombined,
    });
};

/**
 * Safe wrapper - never throws; returns minimal empty model on error.
 */
export const fromLegacyRecordsSafe = (params) => {
    try {
        return fromLegacyRecords(params ?? {});
    } catch (err) {
        console.error('[brandIntelligence] fromLegacyRecordsSafe failed:', err);
        return buildBrandIntelligenceModel({});
    }
};
