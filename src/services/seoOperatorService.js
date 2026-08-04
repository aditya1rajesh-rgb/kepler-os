import { integrationService } from './integrationService';
import { buildOpportunities } from '../lib/seoOperator';

// WS1a orchestration: pull the Search Console datasets the operator analysis needs
// and run it. Zero new vendor/secret — this rides the existing GSC connector
// (oauth-proxy gscQuery, now parameterized). Three pulls:
//   • current  — 28 days by query        → striking-distance, low-CTR
//   • prior    — the preceding 28 days    → content decay (vs current)
//   • by page  — 28 days by query×page    → cannibalization + (aggregated) dead pages
// Requires the gsc_operator capability (workspace has GSC connected); the caller
// gates on it and shows the honest "connect" state otherwise.

export const seoOperatorService = {
    /**
     * @param {string} workspaceId
     * @param {object} [opts] { minImpressions?, limit? }
     * @returns {Promise<{ok:boolean, opportunities?, summary?, totalImpact?, propertyUrl?, error?}>}
     */
    analyze: async (workspaceId, { minImpressions = 20, limit = 50 } = {}) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };
        let current, prior, byPage;
        try {
            [current, prior, byPage] = await Promise.all([
                integrationService.query(workspaceId, 'gsc', { dimensions: ['query'], days: 28, rowLimit: 1000 }),
                integrationService.query(workspaceId, 'gsc', { dimensions: ['query'], days: 28, offsetDays: 28, rowLimit: 1000 }),
                integrationService.query(workspaceId, 'gsc', { dimensions: ['query', 'page'], days: 28, rowLimit: 5000 }),
            ]);
        } catch (e) {
            return { ok: false, error: e.message || 'Could not pull Search Console data.' };
        }

        const result = buildOpportunities({
            queryRows: current?.rows ?? [],
            priorQueryRows: prior?.rows ?? [],
            queryPageRows: byPage?.rows ?? [],
        }, { minImpressions, limit });

        return {
            ok: true,
            ...result,
            propertyUrl: current?.propertyUrl ?? '',
            scannedQueries: (current?.rows ?? []).length,
        };
    },
};

export default seoOperatorService;
