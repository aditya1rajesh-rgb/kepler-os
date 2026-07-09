import { competitorNameKey } from '../../lib/competitorContracts';

/**
 * Decide which incoming competitor suggestions should be persisted.
 * Separates suggested (brand_suggestions) from confirmed (competitors table).
 */
export const filterIncomingCompetitorSuggestions = (
    incoming = [],
    { confirmedCompetitors = [], pendingSuggestions = [], forceRefresh = false } = {}
) => {
    const confirmedNames = new Set(
        confirmedCompetitors.map((c) => competitorNameKey(c.name))
    );
    const manualPending = pendingSuggestions.filter(
        (s) => s.type === 'competitor' && (s.origin === 'manual' || s.payload?.userEdited)
    );
    const manualNames = new Set(
        manualPending.map((s) => competitorNameKey(s.payload?.name))
    );
    const existingPendingNames = new Set(
        pendingSuggestions
            .filter((s) => s.type === 'competitor')
            .map((s) => competitorNameKey(s.payload?.name))
    );

    const filtered = incoming.filter((item) => {
        const key = competitorNameKey(item.name);
        if (!key || confirmedNames.has(key)) return false;
        if (manualNames.has(key)) return false;
        if (!forceRefresh && existingPendingNames.has(key)) return false;
        return true;
    });

    return {
        toInsert: filtered,
        manualPending,
        confirmedNames,
    };
};

/**
 * Map normalized suggestion objects to brand_suggestions insert rows.
 */
export const toCompetitorSuggestionRows = (workspaceId, suggestions = []) =>
    suggestions.map((s) => ({
        workspace_id: workspaceId,
        suggestion_type: 'competitor',
        payload: {
            name: s.name,
            url: s.url ?? '',
            reasonSuggested: s.reasonSuggested ?? '',
            rationale: s.reasonSuggested ?? '',
            sourceOrigin: s.sourceOrigin ?? 'ai',
            confidence: s.confidence ?? 'medium',
            messagingSummary: s.messagingSummary ?? '',
        },
        origin: s.sourceOrigin ?? 'ai',
        status: 'pending',
    }));
