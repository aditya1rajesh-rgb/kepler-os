import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { campaignService } from './campaignService';
import { measurementService } from './measurementService';
import { eventService } from './eventService';
import { buildPeriods, latestPerPeriod, periodDelta } from '../lib/metricsHistory';

// Dashboard read/refresh layer. Trends + the lead/conversion series come from
// campaign_metrics history (period-over-period, latest-snapshot-per-period levels).
// The campaign table reuses measurementService's latest-merge. refreshAll runs the
// provider pulls the workspace has connectors for, then logs a metrics.pulled event.

const HISTORY_MONTHS = 15; // enough for 4 quarterly buckets
const SERIES_COUNT = { weekly: 8, monthly: 7, quarterly: 4 };

const assertWs = (workspaceId) => { if (!isUuid(workspaceId)) throw new Error('Invalid workspace id'); };

const fetchHistory = async (workspaceId) => {
    const since = new Date();
    since.setMonth(since.getMonth() - HISTORY_MONTHS);
    const { data, error } = await supabase
        .from('campaign_metrics')
        .select('campaign_id, provider, metrics, captured_at')
        .eq('workspace_id', workspaceId)
        .gte('captured_at', since.toISOString())
        .order('captured_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
};

export const dashboardService = {
    /**
     * The three KPI cards: active campaigns (+ created-this-month delta), conversion
     * rate (GA4, month-over-month), search CTR (GSC snapshots). Deltas are null when
     * there's no comparable prior period — pills hide rather than fabricate a trend.
     */
    getTrends: async (workspaceId, { campaigns = [] } = {}) => {
        assertWs(workspaceId);
        const rows = await fetchHistory(workspaceId);
        const now = new Date();

        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const activeCount = campaigns.filter((c) => c.status === 'active').length;
        const createdThis = campaigns.filter((c) => c.createdAt && new Date(c.createdAt) >= thisMonthStart).length;
        const createdLast = campaigns.filter((c) => c.createdAt && new Date(c.createdAt) >= lastMonthStart && new Date(c.createdAt) < thisMonthStart).length;

        const months = buildPeriods('monthly', 2, now);
        const conv = latestPerPeriod(rows, months, { provider: 'ga4', metricKey: 'conversions' });
        const sess = latestPerPeriod(rows, months, { provider: 'ga4', metricKey: 'sessions' });
        const rateOf = (i) => (sess[i].value ? conv[i].value / sess[i].value : 0);
        const ctr = latestPerPeriod(rows, months, { provider: 'gsc', metricKey: 'ctr' });

        const hasGa4 = rows.some((r) => r.provider === 'ga4');
        const hasGsc = rows.some((r) => r.provider === 'gsc');

        return {
            activeCampaigns: {
                value: activeCount,
                delta: createdLast ? periodDelta(createdThis, createdLast) : { pct: null, direction: 'flat' },
            },
            conversionRate: {
                value: rateOf(1),
                connected: hasGa4,
                delta: hasGa4 && sess[0].value ? periodDelta(rateOf(1), rateOf(0)) : { pct: null, direction: 'flat' },
            },
            searchCtr: {
                value: ctr[1].value,
                connected: hasGsc,
                delta: hasGsc && ctr[0].value ? periodDelta(ctr[1].value, ctr[0].value) : { pct: null, direction: 'flat' },
            },
        };
    },

    /** Lead/conversion series for the chart, bucketed by granularity. */
    getSeries: async (workspaceId, granularity = 'monthly') => {
        assertWs(workspaceId);
        const rows = await fetchHistory(workspaceId);
        const count = SERIES_COUNT[granularity] ?? 7;
        const periods = buildPeriods(granularity, count);
        const leads = latestPerPeriod(rows, periods, { provider: 'zoho', metricKey: 'crmRecords' });
        const conversions = latestPerPeriod(rows, periods, { provider: 'ga4', metricKey: 'conversions' });
        const hasData = rows.some((r) => r.provider === 'ga4' || r.provider === 'zoho');
        return {
            granularity,
            hasData,
            points: periods.map((p, i) => ({ label: p.label, leads: leads[i].value, conversions: conversions[i].value })),
        };
    },

    /** Campaign performance rows: listCampaigns × latest merged snapshots. */
    getCampaignTable: async (workspaceId) => {
        assertWs(workspaceId);
        const [campaigns, snapshots] = await Promise.all([
            campaignService.listCampaigns(workspaceId, { limit: 50 }),
            measurementService.getSnapshots(workspaceId),
        ]);
        return campaigns.map((c) => {
            const m = snapshots[c.id]?.metrics ?? {};
            return {
                id: c.id,
                title: c.title || c.goal || 'Untitled campaign',
                status: c.status,
                channelMix: Array.isArray(c.plan?.channelMix) ? c.plan.channelMix : [],
                sessions: m.sessions ?? null,
                conversions: m.conversions ?? null,
                revenue: m.revenue ?? null,
            };
        });
    },

    /** Run the provider pulls this workspace has connectors for; log a metrics.pulled event. */
    refreshAll: async (workspaceId, { statuses = {}, campaigns = [] } = {}) => {
        assertWs(workspaceId);
        const gaReady = statuses.ga4?.status === 'connected';
        const zohoReady = statuses.zoho?.status === 'connected';
        const summary = {};

        if (gaReady) {
            try { summary.ga4 = await measurementService.pullGa4(workspaceId, campaigns); }
            catch (e) { summary.ga4Error = e.message; }
        }
        if (zohoReady) {
            try { summary.zoho = await measurementService.pullZoho(workspaceId, campaigns); }
            catch (e) { summary.zohoError = e.message; }
            try { summary.revenue = await measurementService.pullZohoRevenue(workspaceId, campaigns); }
            catch (e) { summary.revenueError = e.message; }
        }
        try { summary.outreach = await measurementService.pullOutreach(workspaceId); }
        catch (e) { summary.outreachError = e.message; }

        eventService.log(workspaceId, 'metrics.pulled', { title: 'Refreshed campaign metrics' }).catch(() => {});
        return summary;
    },
};

export default dashboardService;
