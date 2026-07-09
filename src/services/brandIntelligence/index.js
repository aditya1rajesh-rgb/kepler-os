/**
 * Brand Intelligence - shared data contract & source-normalization layer.
 *
 * Tabs and services should consume BrandIntelligenceModel via
 * brandIntelligenceService.getModel() rather than reading flat DB rows directly.
 */

export { SOURCE_ORIGINS, SOURCE_PRIORITY, ONBOARDING_DEFAULT_PALETTE } from './constants';
export { createField, emptyField, fieldHasValue, getFieldValue, mapFieldsByKey, isEmptyValue } from './fieldFactory';
export { legacyOriginToSourceOrigin, sourceOriginToLegacyOrigin, provenanceEntryToFieldMeta, fieldMetaToProvenanceEntry } from './provenanceAdapter';
export { mergeField, mergeSourceBundles, mergeSuggestionFields, asCombinedField } from './merge';
export { mergePopulationIntoProfile } from './populationMerge';
export { buildBrandIntelligenceModel } from './buildModel';
export {
    buildBrandOverview,
    buildBrandColors,
    buildBusinessDetails,
    buildFileIntelligenceSummary,
    buildCompetitorSuggestions,
    buildIcpSuggestions,
} from './structures';

export { extractWorkspaceSource } from './sources/workspaceSource';
export { extractPersistedSource } from './sources/persistedSource';
export { extractWebsiteSource } from './sources/websiteSource';
export { extractFileSource } from './sources/fileSource';
export { extractAiSource, extractStoredSuggestions } from './sources/aiSource';
export { extractPopulationFromAi } from './sources/populationSource';

export { fromLegacyRecords, fromLegacyRecordsSafe } from './adapters/fromLegacy';
export { toLegacyBrandProfile, toLegacySuggestions } from './adapters/toLegacy';
