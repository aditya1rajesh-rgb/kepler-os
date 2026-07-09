import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { workspaceService } from './workspaceService';
import { fileService } from './fileService';
import { mapBrandProfileRow, mapSuggestionRow } from '../lib/mappers';
import { createLiveBrandBaseline } from '../lib/liveDefaults';
import { fromLegacyRecordsSafe } from './brandIntelligence/adapters/fromLegacy';

const loadBrandProfile = async (workspaceId) => {
    const { data, error } = await supabase
        .from('brand_profiles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        const workspace = await workspaceService.getWorkspace(workspaceId);
        return createLiveBrandBaseline(workspace);
    }

    return mapBrandProfileRow(data);
};

const loadSuggestions = async (workspaceId) => {
    try {
        const { data, error } = await supabase
            .from('brand_suggestions')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (error) throw error;
        return (data ?? []).map(mapSuggestionRow);
    } catch {
        // Table may not exist yet if migration 004 is not applied
        return [];
    }
};

/**
 * Loads existing persisted records and builds the canonical BrandIntelligenceModel.
 * No side effects - safe to call from tabs when ready to consume normalized shape.
 */
export const brandIntelligenceService = {
    getModel: async (workspaceId, options = {}) => {
        if (!isUuid(workspaceId)) {
            throw new Error('Invalid workspace id');
        }

        const [workspace, brandProfile, files, storedSuggestions] = await Promise.all([
            workspaceService.getWorkspace(workspaceId),
            loadBrandProfile(workspaceId),
            fileService.getFiles(workspaceId),
            loadSuggestions(workspaceId),
        ]);

        return fromLegacyRecordsSafe({
            workspace,
            brandProfile,
            files,
            storedSuggestions,
            websiteAnalysis: options.websiteAnalysis ?? null,
            fileAnalysis: options.fileAnalysis ?? null,
            aiSynthesis: options.aiSynthesis ?? null,
            aiCombined: options.aiCombined ?? false,
        });
    },

    /** Build model from in-memory inputs without DB reads. */
    buildFromInputs: (inputs) => fromLegacyRecordsSafe(inputs),
};
