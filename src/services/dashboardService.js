import { isUuid } from '../lib/validation';
import { measurementService } from './measurementService';
import { eventService } from './eventService';

// The provider-pull layer.
//
// This was the dashboard's read+refresh service. E5 replaced the dashboard with
// the cockpit, which reads through cockpitService, so the KPI/series/table reads
// went with the components that consumed them. What survives is the one thing
// the cockpit still needs and nothing else owns: running the pulls a workspace
// has connectors for.

const assertWs = (workspaceId) => { if (!isUuid(workspaceId)) throw new Error('Invalid workspace id'); };

export const dashboardService = {
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
