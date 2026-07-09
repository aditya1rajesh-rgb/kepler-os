import { extractWorkspaceSource } from './sources/workspaceSource';
import { extractPersistedSource } from './sources/persistedSource';
import { extractWebsiteSource } from './sources/websiteSource';
import { extractFileSource } from './sources/fileSource';
import { extractAiSource, extractStoredSuggestions } from './sources/aiSource';
import { mergeSourceBundles, mergeSuggestionFields } from './merge';
import {
    buildBrandOverview,
    buildBrandColors,
    buildBusinessDetails,
    buildFileIntelligenceSummary,
    buildCompetitorSuggestions,
    buildIcpSuggestions,
} from './structures';

/**
 * @typedef {Object} BrandIntelligenceModel
 * @property {ReturnType<buildBrandOverview>} brandOverview
 * @property {ReturnType<buildBrandColors>} brandColors
 * @property {ReturnType<buildBusinessDetails>} businessDetails
 * @property {import('./fieldFactory').BrandIntelligenceField[]} competitorSuggestions
 * @property {import('./fieldFactory').BrandIntelligenceField[]} icpSuggestions
 * @property {ReturnType<buildFileIntelligenceSummary>} fileIntelligenceSummary
 * @property {Record<string, import('./fieldFactory').BrandIntelligenceField>} fields - flat merged map
 * @property {Object} meta - source bundle metadata for debugging
 */

/**
 * Build the canonical Brand Intelligence model from all available inputs.
 * Missing sources are safe - each extractor returns empty bundles.
 *
 * @param {Object} input
 * @param {Object} [input.workspace]
 * @param {Object} [input.brandProfile] - flat persisted brand row (mapped)
 * @param {Object} [input.websiteAnalysis]
 * @param {Array} [input.files]
 * @param {Object} [input.fileAnalysis] - optional AI extraction from files
 * @param {Object} [input.aiSynthesis]
 * @param {Array} [input.storedSuggestions] - brand_suggestions rows
 * @param {boolean} [input.aiCombined=false] - mark AI fields as combined origin
 */
export const buildBrandIntelligenceModel = ({
    workspace = null,
    brandProfile = null,
    websiteAnalysis = null,
    files = [],
    fileAnalysis = null,
    aiSynthesis = null,
    storedSuggestions = [],
    aiCombined = false,
} = {}) => {
    const workspaceBundle = extractWorkspaceSource(workspace);
    const persistedBundle = extractPersistedSource(brandProfile);
    const websiteBundle = extractWebsiteSource(websiteAnalysis);
    const fileBundle = extractFileSource(files, fileAnalysis);

    const aiSourceRefs = [
        ...(websiteBundle.meta.id ? [`website:${websiteBundle.meta.id}`] : []),
        ...(fileBundle.meta.fileRefs ?? []),
    ];

    const aiBundle = extractAiSource(aiSynthesis, {
        sourceRefs: aiSourceRefs,
        combined: aiCombined || aiSourceRefs.length > 1,
    });

    const stored = extractStoredSuggestions(storedSuggestions);

    // Merge order: lowest priority first, highest last (persisted/user wins over AI)
    const mergedFields = mergeSourceBundles([
        aiBundle,
        fileBundle,
        websiteBundle,
        workspaceBundle,
        persistedBundle,
    ]);

    const competitorSuggestions = mergeSuggestionFields(
        stored.competitorSuggestions,
        aiBundle.competitorSuggestions
    );

    const icpSuggestions = mergeSuggestionFields(
        stored.icpSuggestions,
        aiBundle.icpSuggestions
    );

    return {
        brandOverview: buildBrandOverview(mergedFields),
        brandColors: buildBrandColors(mergedFields),
        businessDetails: buildBusinessDetails(mergedFields),
        competitorSuggestions: buildCompetitorSuggestions(competitorSuggestions),
        icpSuggestions: buildIcpSuggestions(icpSuggestions),
        fileIntelligenceSummary: buildFileIntelligenceSummary(files),
        fields: mergedFields,
        meta: {
            sources: {
                workspace: workspaceBundle.meta,
                persisted: persistedBundle.meta,
                website: websiteBundle.meta,
                file: fileBundle.meta,
                ai: aiBundle.meta,
            },
            fieldCount: Object.keys(mergedFields).length,
            suggestionCount: competitorSuggestions.length + icpSuggestions.length,
        },
    };
};

export default buildBrandIntelligenceModel;
