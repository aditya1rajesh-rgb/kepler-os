import { useCallback, useEffect, useState } from 'react';
import { integrationService } from '../services/integrationService';
import { campaignService } from '../services/campaignService';
import { dashboardService } from '../services/dashboardService';
import { eventService } from '../services/eventService';
import { visibilityService } from '../services/visibilityService';

// One hook for all Dashboard data. Core loads run in parallel; the chart series
// reloads on its own when granularity changes. Refresh pulls fresh provider metrics
// (for connected sources) then re-reads everything.
export const useDashboardData = (workspaceId) => {
    const [statuses, setStatuses] = useState({});
    const [campaigns, setCampaigns] = useState([]);
    const [trends, setTrends] = useState(null);
    const [series, setSeries] = useState(null);
    const [tableRows, setTableRows] = useState([]);
    const [events, setEvents] = useState([]);
    const [hasVisibility, setHasVisibility] = useState(false);
    const [granularity, setGranularity] = useState('monthly');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadCore = useCallback(async () => {
        if (!workspaceId) return;
        const [st, camps, tbl, evs, vis] = await Promise.all([
            integrationService.listStatuses(workspaceId).catch(() => ({})),
            campaignService.listCampaigns(workspaceId, { limit: 100 }).catch(() => []),
            dashboardService.getCampaignTable(workspaceId).catch(() => []),
            eventService.list(workspaceId, { limit: 40 }).catch(() => []),
            visibilityService.getLatestVisibility(workspaceId).catch(() => null),
        ]);
        setStatuses(st);
        setCampaigns(camps);
        setTableRows(tbl);
        setEvents(evs);
        setHasVisibility(Boolean(vis));
        const tr = await dashboardService.getTrends(workspaceId, { campaigns: camps }).catch(() => null);
        setTrends(tr);
    }, [workspaceId]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        loadCore().finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [loadCore]);

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        dashboardService.getSeries(workspaceId, granularity)
            .then((s) => { if (!cancelled) setSeries(s); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [workspaceId, granularity]);

    const refresh = useCallback(async () => {
        if (!workspaceId) return;
        setRefreshing(true);
        try {
            await dashboardService.refreshAll(workspaceId, { statuses, campaigns });
            await loadCore();
            const s = await dashboardService.getSeries(workspaceId, granularity).catch(() => null);
            if (s) setSeries(s);
        } finally {
            setRefreshing(false);
        }
    }, [workspaceId, statuses, campaigns, granularity, loadCore]);

    return {
        statuses, campaigns, trends, series, granularity, setGranularity,
        tableRows, events, hasVisibility, loading, refreshing, refresh,
    };
};
