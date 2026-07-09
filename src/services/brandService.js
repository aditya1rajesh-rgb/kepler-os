import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import {
    mapBrandProfileRow,
    mapCompetitorRow,
    mapPersonaRow,
    mapSuggestionRow,
    toBrandProfileInsert,
} from '../lib/mappers';
import { createLiveBrandBaseline } from '../lib/liveDefaults';
import { computeBrandCompleteness } from '../lib/brandCompleteness';
import { workspaceService } from './workspaceService';
import {
    filterIncomingCompetitorSuggestions,
    toCompetitorSuggestionRows,
} from './brandIntelligence/competitorSuggestions';
import { icpPayloadToPersona } from '../lib/icpContracts';

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) {
        throw new Error('Invalid workspace id');
    }
};

/** Detect "column does not exist" / schema-cache errors so we can fall back gracefully. */
const isMissingColumnError = (error) => {
    if (!error) return false;
    if (error.code === 'PGRST204' || error.code === '42703') return true;
    const msg = String(error.message ?? '').toLowerCase();
    return msg.includes('column') && (msg.includes('does not exist') || msg.includes('schema cache'));
};

const isMissingSuggestionsTableError = (error) => {
    if (!error) return false;
    if (error.code === 'PGRST205' || error.code === '42P01') return true;
    const msg = String(error.message ?? '').toLowerCase();
    return (
        (msg.includes("could not find the table") && msg.includes('brand_suggestions')) ||
        (msg.includes('relation') && msg.includes('brand_suggestions') && msg.includes('does not exist'))
    );
};

const normalizeKey = (value) => String(value ?? '').trim().toLowerCase();
const competitorSuggestionKey = (payload = {}) => normalizeKey(payload?.name);
const icpSuggestionKey = (payload = {}) => {
    const role = normalizeKey(payload?.role ?? payload?.segment);
    const segment = normalizeKey(payload?.segment ?? payload?.role);
    if (!role && !segment) return '';
    return `${role}::${segment}`;
};
const personaRecordKey = (persona = {}) => {
    const role = normalizeKey(persona.role);
    const segment = normalizeKey(persona.segment ?? persona.details?.segment ?? persona.role);
    if (!role && !segment) return '';
    return `${role}::${segment}`;
};

/**
 * Raised when entity creation succeeded (or already existed) but we could not
 * persist suggestion status. Safe to retry: dedupe will converge on one entity
 * and another attempt can complete status transition.
 */
export class SuggestionAcceptSyncError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'SuggestionAcceptSyncError';
        this.code = 'SUGGESTION_ACCEPT_SYNC_FAILED';
        this.details = details;
    }
}

export const brandService = {
    getBrandIdentity: async (workspaceId) => {
        assertWorkspaceId(workspaceId);

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
    },

    /**
     * Brand logos for every workspace the user belongs to (RLS-scoped, one query).
     * Extracts just the SVG string from each brand's color_identity JSONB.
     * @returns {Promise<Record<string, string>>} map of workspaceId → logoSvg
     */
    getWorkspaceLogos: async () => {
        const { data, error } = await supabase
            .from('brand_profiles')
            .select('workspace_id, logoSvg:color_identity->>logoSvg');
        if (error) throw error;
        const map = {};
        for (const row of data ?? []) {
            if (row.logoSvg) map[row.workspace_id] = row.logoSvg;
        }
        return map;
    },

    upsertBrandIdentity: async (workspaceId, brandData) => {
        assertWorkspaceId(workspaceId);

        const payload = toBrandProfileInsert(workspaceId, brandData);
        const { data, error } = await supabase
            .from('brand_profiles')
            .upsert(payload, { onConflict: 'workspace_id' })
            .select()
            .maybeSingle();

        if (error) throw error;
        const brand = mapBrandProfileRow(data ?? payload);

        // Keep the workspace's brand-completeness score fresh (shown on Home cards,
        // the workspace hero, and the cockpit). Non-fatal - never blocks a save.
        await brandService.persistBrandCompleteness(workspaceId, brand);

        return brand;
    },

    /**
     * Recompute brand-profile completeness (%) and store it on the workspace row.
     * Non-throwing so it never blocks a save or read; used by upsertBrandIdentity
     * and the cockpit self-heal for brands saved before this was tracked.
     */
    persistBrandCompleteness: async (workspaceId, brand) => {
        if (!isUuid(workspaceId)) return null;
        try {
            const { percent } = computeBrandCompleteness(brand);
            await supabase
                .from('workspaces')
                .update({ brand_intel_status: percent })
                .eq('id', workspaceId);
            return percent;
        } catch (statusError) {
            console.error('Failed to update brand completeness score:', statusError);
            return null;
        }
    },

    /**
     * Canonical normalized Brand Intelligence model (field-level provenance).
     * Does not replace getBrandIdentity - additive read path for future tab consumption.
     */
    getBrandIntelligenceModel: async (workspaceId, options) => {
        const { brandIntelligenceService } = await import('./brandIntelligenceService');
        return brandIntelligenceService.getModel(workspaceId, options);
    },

    getCompetitors: async (workspaceId) => {
        assertWorkspaceId(workspaceId);

        const { data, error } = await supabase
            .from('competitors')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return (data ?? []).map(mapCompetitorRow);
    },

    addCompetitor: async (workspaceId, competitor) => {
        assertWorkspaceId(workspaceId);

        const insertPayload = {
            workspace_id: workspaceId,
            name: competitor.name,
            url: competitor.url ?? '',
            confirmed: competitor.confirmed ?? false,
            notes: competitor.notes ?? '',
        };
        const { data, error } = await supabase
            .from('competitors')
            .insert(insertPayload)
            .select()
            .maybeSingle();

        if (error) throw error;
        return mapCompetitorRow(data ?? insertPayload);
    },

    removeCompetitor: async (workspaceId, id) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('competitors')
            .delete()
            .eq('id', id)
            .eq('workspace_id', workspaceId);
        if (error) throw error;
        return true;
    },

    getPersonas: async (workspaceId) => {
        assertWorkspaceId(workspaceId);

        const { data, error } = await supabase
            .from('personas')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return (data ?? []).map(mapPersonaRow);
    },

    addPersona: async (workspaceId, persona) => {
        assertWorkspaceId(workspaceId);

        const legacyPayload = {
            workspace_id: workspaceId,
            role: persona.role,
            titles: persona.titles ?? [],
            pain_points: persona.painPoints ?? '',
            channels: persona.channels ?? [],
        };
        const fullPayload = {
            ...legacyPayload,
            details: persona.details ?? {},
            source_origin: persona.sourceOrigin ?? 'manual',
        };

        let { data, error } = await supabase
            .from('personas')
            .insert(fullPayload)
            .select()
            .maybeSingle();

        // Graceful fallback if migration 005 (details/source_origin) is not applied yet.
        if (error && isMissingColumnError(error)) {
            ({ data, error } = await supabase
                .from('personas')
                .insert(legacyPayload)
                .select()
                .maybeSingle());
        }

        if (error) throw error;
        return mapPersonaRow(data ?? fullPayload);
    },

    updatePersona: async (workspaceId, id, updates) => {
        assertWorkspaceId(workspaceId);
        const dbUpdates = {};
        if (updates.role != null) dbUpdates.role = updates.role;
        if (updates.titles != null) dbUpdates.titles = updates.titles;
        if (updates.painPoints != null) dbUpdates.pain_points = updates.painPoints;
        if (updates.channels != null) dbUpdates.channels = updates.channels;

        const withDetails = { ...dbUpdates };
        if (updates.details != null) withDetails.details = updates.details;
        if (updates.sourceOrigin != null) withDetails.source_origin = updates.sourceOrigin;

        let { data, error } = await supabase
            .from('personas')
            .update(withDetails)
            .eq('id', id)
            .eq('workspace_id', workspaceId)
            .select()
            .maybeSingle();

        if (error && isMissingColumnError(error)) {
            ({ data, error } = await supabase
                .from('personas')
                .update(dbUpdates)
                .eq('id', id)
                .eq('workspace_id', workspaceId)
                .select()
                .maybeSingle());
        }

        if (error) throw error;
        return data ? mapPersonaRow(data) : null;
    },

    removePersona: async (workspaceId, id) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('personas')
            .delete()
            .eq('id', id)
            .eq('workspace_id', workspaceId);
        if (error) throw error;
        return true;
    },

    updateCompetitor: async (workspaceId, id, updates) => {
        assertWorkspaceId(workspaceId);
        const dbUpdates = {};
        if (updates.name != null) dbUpdates.name = updates.name;
        if (updates.url != null) dbUpdates.url = updates.url;
        if (updates.confirmed != null) dbUpdates.confirmed = updates.confirmed;
        if (updates.notes != null) dbUpdates.notes = updates.notes;

        const { data, error } = await supabase
            .from('competitors')
            .update(dbUpdates)
            .eq('id', id)
            .eq('workspace_id', workspaceId)
            .select()
            .maybeSingle();

        if (error) throw error;
        return data ? mapCompetitorRow(data) : null;
    },

    getSuggestions: async (workspaceId) => {
        assertWorkspaceId(workspaceId);

        const { data, error } = await supabase
            .from('brand_suggestions')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (error && isMissingSuggestionsTableError(error)) {
            return [];
        }
        if (error) throw error;
        return (data ?? []).map(mapSuggestionRow);
    },

    /**
     * Sync generated (AI/website/file) competitor and ICP suggestions.
     * Preserves user-edited suggestions and skips names already confirmed.
     */
    syncGeneratedSuggestions: async (workspaceId, { competitors = [], icps = [] }, { forceRefresh = false, types } = {}) => {
        assertWorkspaceId(workspaceId);
        // Limit force-refresh stale dismissal to these suggestion types so generating
        // one type (e.g. competitors) never clears the other type's pending suggestions.
        const refreshTypes = Array.isArray(types) && types.length > 0 ? types : ['competitor', 'icp'];

        let pendingSuggestions = [];
        try {
            pendingSuggestions = await brandService.getSuggestions(workspaceId);
        } catch (error) {
            if (isMissingSuggestionsTableError(error)) {
                return {
                    inserted: [],
                    updated: [],
                    dismissedCount: 0,
                    activePendingCount: 0,
                };
            }
            throw error;
        }
        const [confirmedCompetitors, confirmedPersonas] = await Promise.all([
            brandService.getCompetitors(workspaceId),
            brandService.getPersonas(workspaceId),
        ]);

        const { toInsert: competitorsToInsert } = filterIncomingCompetitorSuggestions(competitors, {
            confirmedCompetitors,
            pendingSuggestions,
            forceRefresh,
        });

        // De-dupe ICP suggestions against confirmed personas + retained manual ICP suggestions.
        const confirmedPersonaKeys = new Set(confirmedPersonas.map((p) => personaRecordKey(p)));
        const manualIcpKeys = new Set(
            pendingSuggestions
                .filter((s) => s.type === 'icp' && (s.origin === 'manual' || s.payload?.userEdited))
                .map((s) => icpSuggestionKey(s.payload))
        );
        const icpsToInsert = icps.filter((p) => {
            const key = icpSuggestionKey(p);
            return key && !confirmedPersonaKeys.has(key) && !manualIcpKeys.has(key);
        });

        const generatedPending = pendingSuggestions.filter(
            (s) => s.origin !== 'manual' && !s.payload?.userEdited
        );
        const existingGeneratedByKey = {
            competitor: new Map(),
            icp: new Map(),
        };
        generatedPending.forEach((s) => {
            const key = s.type === 'competitor'
                ? competitorSuggestionKey(s.payload)
                : icpSuggestionKey(s.payload);
            if (!key) return;
            if (!existingGeneratedByKey[s.type].has(key)) {
                existingGeneratedByKey[s.type].set(key, s);
            }
        });

        const incomingRows = [
            ...toCompetitorSuggestionRows(workspaceId, competitorsToInsert),
            ...icpsToInsert.map((p) => ({
                workspace_id: workspaceId,
                suggestion_type: 'icp',
                payload: p,
                origin: 'ai',
                status: 'pending',
            })),
        ];

        const rowsToInsert = [];
        const rowsToUpdate = [];
        const seenKeys = new Set();

        incomingRows.forEach((row) => {
            const key = row.suggestion_type === 'competitor'
                ? competitorSuggestionKey(row.payload)
                : icpSuggestionKey(row.payload);
            if (!key || seenKeys.has(`${row.suggestion_type}:${key}`)) return;
            seenKeys.add(`${row.suggestion_type}:${key}`);

            const existing = existingGeneratedByKey[row.suggestion_type].get(key);
            if (existing) {
                rowsToUpdate.push({ id: existing.id, row });
            } else {
                rowsToInsert.push(row);
            }
        });

        let inserted = [];
        if (rowsToInsert.length > 0) {
            const { data, error } = await supabase
                .from('brand_suggestions')
                .insert(rowsToInsert)
                .select();
            if (error && isMissingSuggestionsTableError(error)) {
                return {
                    inserted: [],
                    updated: [],
                    dismissedCount: 0,
                    activePendingCount: 0,
                };
            }
            if (error) throw error;
            inserted = (data ?? []).map(mapSuggestionRow);
        }

        const updated = [];
        for (const { id, row } of rowsToUpdate) {
            const { data, error } = await supabase
                .from('brand_suggestions')
                .update({
                    payload: row.payload,
                    origin: row.origin,
                    status: 'pending',
                })
                .eq('id', id)
                .eq('workspace_id', workspaceId)
                .select()
                .maybeSingle();
            if (error && isMissingSuggestionsTableError(error)) {
                return {
                    inserted: [],
                    updated: [],
                    dismissedCount: 0,
                    activePendingCount: 0,
                };
            }
            if (error) throw error;
            if (data) updated.push(mapSuggestionRow(data));
        }

        // Mark stale generated suggestions only after inserts/updates succeed.
        // We only do this on force refresh so non-refresh runs never clear prior generated suggestions.
        let dismissedCount = 0;
        if (forceRefresh) {
            const keepIds = new Set(rowsToUpdate.map((item) => item.id));
            const staleIds = generatedPending
                .filter((s) => refreshTypes.includes(s.type))
                .map((s) => s.id)
                .filter((id) => !keepIds.has(id));
            if (staleIds.length > 0) {
                const { error } = await supabase
                    .from('brand_suggestions')
                    .update({ status: 'dismissed' })
                    .in('id', staleIds)
                    .eq('workspace_id', workspaceId);
                if (error && isMissingSuggestionsTableError(error)) {
                    return {
                        inserted: [],
                        updated: [],
                        dismissedCount: 0,
                        activePendingCount: 0,
                    };
                }
                if (error) throw error;
                dismissedCount = staleIds.length;
            }
        }

        const activePendingCount = (await brandService.getSuggestions(workspaceId)).length;
        return {
            inserted,
            updated,
            dismissedCount,
            activePendingCount,
        };
    },

    /**
     * Update a pending suggestion's payload (e.g. user edits before accepting).
     */
    updateSuggestion: async (workspaceId, suggestionId, payload) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('brand_suggestions')
            .update({ payload, origin: 'manual' })
            .eq('id', suggestionId)
            .eq('workspace_id', workspaceId)
            .select()
            .maybeSingle();

        if (error && isMissingSuggestionsTableError(error)) return null;
        if (error) throw error;
        return data ? mapSuggestionRow(data) : null;
    },

    acceptSuggestion: async (workspaceId, suggestionId, type) => {
        assertWorkspaceId(workspaceId);

        const { data: suggestion, error: fetchErr } = await supabase
            .from('brand_suggestions')
            .select('*')
            .eq('id', suggestionId)
            .eq('workspace_id', workspaceId)
            .maybeSingle();

        if (fetchErr && isMissingSuggestionsTableError(fetchErr)) {
            throw new Error('Suggestions storage is not available yet. Apply migration 004/008 and retry.');
        }
        if (fetchErr) throw fetchErr;
        if (!suggestion) throw new Error('Suggestion not found');
        const suggestionType = suggestion.suggestion_type;
        if (suggestionType && suggestionType !== type) {
            throw new Error(`Suggestion type mismatch: expected ${type}, got ${suggestionType}`);
        }

        const resolveEntity = async () => {
            if (type === 'competitor') {
                const incomingKey = competitorSuggestionKey(suggestion.payload);
                const existing = (await brandService.getCompetitors(workspaceId))
                    .find((c) => competitorSuggestionKey(c) === incomingKey);
                if (existing) return existing;
                return brandService.addCompetitor(workspaceId, {
                    name: suggestion.payload.name,
                    url: suggestion.payload.url ?? '',
                    notes: suggestion.payload.reasonSuggested ?? suggestion.payload.rationale ?? '',
                    confirmed: true,
                });
            }

            if (type === 'icp') {
                const persona = icpPayloadToPersona(suggestion.payload);
                const incomingKey = icpSuggestionKey({
                    role: persona.role,
                    segment: persona.details?.segment ?? suggestion.payload?.segment,
                });
                const existing = (await brandService.getPersonas(workspaceId))
                    .find((p) => personaRecordKey(p) === incomingKey);
                if (existing) return existing;
                return brandService.addPersona(workspaceId, persona);
            }

            return null;
        };

        // Already accepted (e.g. another tab beat us) -> converge idempotently.
        if (suggestion.status === 'accepted') {
            return resolveEntity();
        }
        if (suggestion.status !== 'pending') {
            throw new Error(`Suggestion is ${suggestion.status} and cannot be accepted`);
        }

        // Compare-and-set claim: only one concurrent caller can transition pending -> accepted.
        const { data: claimed, error: claimErr } = await supabase
            .from('brand_suggestions')
            .update({ status: 'accepted' })
            .eq('id', suggestionId)
            .eq('workspace_id', workspaceId)
            .eq('status', 'pending')
            .select('*')
            .maybeSingle();

        if (claimErr) throw claimErr;
        if (!claimed) {
            const { data: latest, error: latestErr } = await supabase
                .from('brand_suggestions')
                .select('*')
                .eq('id', suggestionId)
                .eq('workspace_id', workspaceId)
                .maybeSingle();
            if (latestErr) throw latestErr;
            if (!latest) throw new Error('Suggestion not found');
            if (latest.status === 'accepted') {
                return resolveEntity();
            }
            throw new Error(`Suggestion is ${latest.status} and cannot be accepted`);
        }

        try {
            return await resolveEntity();
        } catch (entityErr) {
            // Best-effort rollback keeps suggestion retryable if entity creation fails.
            const { error: rollbackErr } = await supabase
                .from('brand_suggestions')
                .update({ status: 'pending' })
                .eq('id', suggestionId)
                .eq('workspace_id', workspaceId)
                .eq('status', 'accepted');

            if (rollbackErr) {
                throw new SuggestionAcceptSyncError(
                    'Suggestion status could not be rolled back after entity creation failure.',
                    {
                        workspaceId,
                        suggestionId,
                        type,
                        cause: (entityErr && entityErr.message) || String(entityErr),
                        rollbackCause: rollbackErr.message,
                    }
                );
            }

            throw entityErr;
        }
    },

    dismissSuggestion: async (workspaceId, id) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('brand_suggestions')
            .update({ status: 'dismissed' })
            .eq('id', id)
            .eq('workspace_id', workspaceId);
        if (error && isMissingSuggestionsTableError(error)) return true;
        if (error) throw error;
        return true;
    },
};
