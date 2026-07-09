import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveWorkspaceId } from '../hooks/useActiveWorkspaceId';
import { useWorkspaceConfig, deriveReadiness } from '../hooks/useWorkspaceConfig';
import { contentService } from '../services/contentService';
import { campaignService } from '../services/campaignService';
import { deriveActivation } from '../lib/activation';

/**
 * Activation context - one source of truth for the active workspace's readiness,
 * content summary/recent activity, and derived activation state. Consumed by the
 * sidebar + workspace tabs (lock/next cues), the cockpit, and the header. Loaded
 * once per active workspace (persists across module/tab switches) and refreshable
 * after mutations.
 */

const EMPTY_SUMMARY = {
    total: 0,
    byType: { seo: 0, ads: 0, outreach: 0, social: 0 },
    byStatus: { queue: 0, generating: 0, completed: 0 },
};

const EMPTY_CAMPAIGN_SUMMARY = { total: 0, active: 0, draft: 0, completed: 0 };

const ActivationContext = createContext(null);

export const ActivationProvider = ({ children }) => {
    const workspaceId = useActiveWorkspaceId();
    const config = useWorkspaceConfig(workspaceId);
    const { brand, competitors, personas, files, loading: configLoading, refresh: refreshConfig } = config;

    const [summary, setSummary] = useState(EMPTY_SUMMARY);
    const [recent, setRecent] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [campaignSummary, setCampaignSummary] = useState(EMPTY_CAMPAIGN_SUMMARY);
    const [contentLoading, setContentLoading] = useState(true);

    // Stable readiness reference (useWorkspaceConfig re-derives a fresh object each
    // render; recompute here keyed on the underlying data so consumers don't churn).
    const readiness = useMemo(
        () => deriveReadiness({ brand, competitors, personas, files }),
        [brand, competitors, personas, files]
    );

    const refreshContent = useCallback(async () => {
        if (!workspaceId) {
            setSummary(EMPTY_SUMMARY);
            setRecent([]);
            setCampaigns([]);
            setCampaignSummary(EMPTY_CAMPAIGN_SUMMARY);
            setContentLoading(false);
            return;
        }
        setContentLoading(true);
        try {
            // Campaign calls are individually guarded so a not-yet-migrated
            // campaigns table can never break the rest of the cockpit.
            const [nextSummary, nextRecent, campSummary, activeCamps] = await Promise.all([
                contentService.getContentSummary(workspaceId),
                contentService.getRecentContent(workspaceId, { limit: 8 }),
                campaignService.getCampaignSummary(workspaceId).catch(() => EMPTY_CAMPAIGN_SUMMARY),
                campaignService.listCampaigns(workspaceId, { status: 'active', limit: 25 }).catch(() => []),
            ]);
            setSummary(nextSummary);
            setRecent(nextRecent);
            setCampaignSummary(campSummary);
            setCampaigns(activeCamps);
        } catch (err) {
            console.error('Failed to load activation content:', err);
            setSummary(EMPTY_SUMMARY);
            setRecent([]);
            setCampaigns([]);
            setCampaignSummary(EMPTY_CAMPAIGN_SUMMARY);
        } finally {
            setContentLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        refreshContent();
    }, [refreshContent]);

    const refresh = useCallback(async () => {
        await Promise.all([refreshConfig(), refreshContent()]);
    }, [refreshConfig, refreshContent]);

    const activation = useMemo(
        () => deriveActivation({ readiness, contentTotal: summary.total, workspaceId }),
        [readiness, summary.total, workspaceId]
    );

    const value = useMemo(
        () => ({
            workspaceId,
            readiness,
            summary,
            recent,
            campaigns,
            campaignSummary,
            activation,
            brand,
            icpCount: personas.length,
            competitorCount: competitors.length,
            fileCount: files.length,
            loading: configLoading || contentLoading,
            refresh,
        }),
        [
            workspaceId,
            readiness,
            summary,
            recent,
            campaigns,
            campaignSummary,
            activation,
            brand,
            personas.length,
            competitors.length,
            files.length,
            configLoading,
            contentLoading,
            refresh,
        ]
    );

    return <ActivationContext.Provider value={value}>{children}</ActivationContext.Provider>;
};

export const useActivation = () => {
    const ctx = useContext(ActivationContext);
    if (!ctx) {
        throw new Error('useActivation must be used within ActivationProvider');
    }
    return ctx;
};
