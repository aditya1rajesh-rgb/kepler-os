import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { integrationService } from './integrationService';
import { matchCampaign, matchByText } from '../lib/tracking';

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

const UNATTRIBUTED = '__unattributed__';

/**
 * Measurement / attribution. Reads campaign_metrics snapshots (workspace-scoped
 * RLS) and pulls fresh GA4-attributed outcomes, matching GA4's utm_campaign back
 * to KEPLER campaigns by id-suffix. See [[connector-architecture]].
 */
export const measurementService = {
    /**
     * Latest snapshot per campaign, MERGED across providers (so GA4 metrics and
     * Zoho CRM metrics coexist on one campaign). key → { campaignId, metrics, capturedAt }.
     */
    getSnapshots: async (workspaceId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('campaign_metrics')
            .select('campaign_id, provider, metrics, captured_at')
            .eq('workspace_id', workspaceId)
            .order('captured_at', { ascending: false });
        if (error) throw error;
        // Keep the latest row per (campaign, provider), then merge providers.
        const latestByKeyProvider = {};
        for (const row of data ?? []) {
            const kp = `${row.campaign_id ?? UNATTRIBUTED}|${row.provider}`;
            if (!latestByKeyProvider[kp]) latestByKeyProvider[kp] = row;
        }
        const merged = {};
        for (const row of Object.values(latestByKeyProvider)) {
            const key = row.campaign_id ?? UNATTRIBUTED;
            if (!merged[key]) merged[key] = { campaignId: row.campaign_id ?? null, metrics: {}, capturedAt: null };
            merged[key].metrics = { ...merged[key].metrics, ...(row.metrics ?? {}) };
            if (!merged[key].capturedAt || row.captured_at > merged[key].capturedAt) merged[key].capturedAt = row.captured_at;
        }
        return merged;
    },

    /** Pull GA4 outcomes attributed by campaign, snapshot them, return a summary. */
    pullGa4: async (workspaceId, campaigns = []) => {
        assertWorkspaceId(workspaceId);
        const res = await integrationService.query(workspaceId, 'ga4', { mode: 'byCampaign' });
        const rows = res?.rows ?? [];
        const agg = {};
        for (const r of rows) {
            const c = matchCampaign(r.campaign, campaigns);
            const key = c ? c.id : UNATTRIBUTED;
            const a = agg[key] || (agg[key] = { campaignId: c ? c.id : null, sessions: 0, users: 0, conversions: 0 });
            a.sessions += r.sessions || 0;
            a.users += r.users || 0;
            a.conversions += r.conversions || 0;
        }
        const inserts = Object.values(agg).map((a) => ({
            workspace_id: workspaceId,
            campaign_id: a.campaignId,
            provider: 'ga4',
            metrics: { sessions: a.sessions, users: a.users, conversions: a.conversions },
        }));
        if (inserts.length) {
            const { error } = await supabase.from('campaign_metrics').insert(inserts);
            if (error) throw error;
        }
        return { rowsSeen: rows.length, attributed: inserts.filter((i) => i.campaign_id).length };
    },

    /**
     * Pull CRM (Zoho) records, attribute them to campaigns by the utm stamped in
     * each record's Description on push, and snapshot the per-campaign counts.
     */
    pullZoho: async (workspaceId, campaigns = []) => {
        assertWorkspaceId(workspaceId);
        const res = await integrationService.fetchFromConnector(workspaceId, 'zoho', { resource: 'attribution' });
        const records = res?.result?.records ?? [];
        const agg = {};
        for (const r of records) {
            const c = matchByText(r.description, campaigns);
            if (!c) continue; // only count records attributable to a KEPLER campaign
            const a = agg[c.id] || (agg[c.id] = { campaignId: c.id, crmRecords: 0 });
            a.crmRecords += 1;
        }
        const inserts = Object.values(agg).map((a) => ({
            workspace_id: workspaceId,
            campaign_id: a.campaignId,
            provider: 'zoho',
            metrics: { crmRecords: a.crmRecords },
        }));
        if (inserts.length) {
            const { error } = await supabase.from('campaign_metrics').insert(inserts);
            if (error) throw error;
        }
        return { records: records.length, attributed: inserts.length };
    },
};

export default measurementService;
