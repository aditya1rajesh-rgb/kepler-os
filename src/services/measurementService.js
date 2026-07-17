import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { integrationService } from './integrationService';
import { matchCampaign, matchByText } from '../lib/tracking';
import { attributeDeals, DEFAULT_WON_STAGES } from '../lib/revenueAttribution';

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

    /**
     * Aggregate the send engine's OWN events (sent / replied / meetings) per
     * campaign from v_outreach_sequence_metrics and snapshot them. This is real
     * outreach performance joined by sequences.campaign_id — not the old
     * string-matched CRM record count.
     */
    pullOutreach: async (workspaceId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('v_outreach_sequence_metrics')
            .select('campaign_id, enrolled, sent, replied, meetings')
            .eq('workspace_id', workspaceId);
        if (error) throw error;
        const agg = {};
        for (const r of data ?? []) {
            const key = r.campaign_id ?? UNATTRIBUTED;
            const a = agg[key] || (agg[key] = { campaignId: r.campaign_id ?? null, enrolled: 0, sent: 0, replied: 0, meetings: 0 });
            a.enrolled += r.enrolled || 0;
            a.sent += r.sent || 0;
            a.replied += r.replied || 0;
            a.meetings += r.meetings || 0;
        }
        const inserts = Object.values(agg)
            .filter((a) => a.enrolled || a.sent || a.replied || a.meetings)
            .map((a) => ({
                workspace_id: workspaceId,
                campaign_id: a.campaignId,
                provider: 'outreach',
                metrics: { enrolled: a.enrolled, sent: a.sent, replied: a.replied, meetings: a.meetings },
            }));
        if (inserts.length) {
            const { error: insErr } = await supabase.from('campaign_metrics').insert(inserts);
            if (insErr) throw insErr;
        }
        return { sequences: (data ?? []).length, attributed: inserts.filter((i) => i.campaign_id).length };
    },

    /**
     * Closed-loop revenue: pull Zoho won deals, attribute each to a campaign via
     * the reliable zohoContactId->campaign reverse-join (v_prospect_campaigns),
     * falling back to the campaign tag in the deal Description, and snapshot the
     * per-campaign won revenue as provider:'revenue'.
     */
    pullZohoRevenue: async (workspaceId, campaigns = []) => {
        assertWorkspaceId(workspaceId);
        const res = await integrationService.fetchFromConnector(workspaceId, 'zoho', { resource: 'deals' });
        const deals = res?.result?.deals ?? [];
        const { data: rows, error: viewErr } = await supabase
            .from('v_prospect_campaigns')
            .select('zoho_contact_id, campaign_id')
            .eq('workspace_id', workspaceId);
        if (viewErr) throw viewErr;
        const contactCampaign = new Map();
        for (const r of rows ?? []) {
            if (r.zoho_contact_id && !contactCampaign.has(r.zoho_contact_id)) {
                contactCampaign.set(String(r.zoho_contact_id), r.campaign_id);
            }
        }
        const { byCampaign, wonTotal, attributedCount } = attributeDeals(deals, {
            contactCampaign, campaigns, wonStages: DEFAULT_WON_STAGES,
        });
        const inserts = Object.values(byCampaign)
            .filter((a) => a.campaignId) // only snapshot revenue we could attribute
            .map((a) => ({
                workspace_id: workspaceId,
                campaign_id: a.campaignId,
                provider: 'revenue',
                metrics: { revenue: a.revenue, wonDeals: a.wonDeals },
            }));
        if (inserts.length) {
            const { error } = await supabase.from('campaign_metrics').insert(inserts);
            if (error) throw error;
        }
        return { deals: deals.length, wonDeals: wonTotal, attributed: attributedCount };
    },
};

export default measurementService;
