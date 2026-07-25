import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Search, TrendingUp } from '../../lib/icons';
import { useAuth } from '../../context/AuthContext';
import { useActivation } from '../../context/ActivationContext';
import { useDashboardData } from '../../hooks/useDashboardData';
import { workspacePath } from '../../constants/routes';
import { integrationService } from '../../services/integrationService';
import { computeBrandCompleteness } from '../../lib/brandCompleteness';
import { pickSpotlight } from '../../lib/spotlight';
import { downloadCsv } from '../../lib/exportCsv';
import DashboardHeader from '../../components/dashboard/DashboardHeader';
import KpiCard from '../../components/dashboard/KpiCard';
import SpotlightCard from '../../components/dashboard/SpotlightCard';
import LeadConversionCard from '../../components/dashboard/LeadConversionCard';
import LatestUpdates from '../../components/dashboard/LatestUpdates';
import CampaignTable from '../../components/dashboard/CampaignTable';
import './Dashboard.css';

const pct = (x) => `${((Number(x) || 0) * 100).toFixed(1)}%`;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const Dashboard = ({ workspaceId, workspace }) => {
    const navigate = useNavigate();
    const { displayName } = useAuth();
    const { activation, brand } = useActivation();
    const data = useDashboardData(workspaceId);
    const { statuses, trends, series, granularity, setGranularity, tableRows, events, hasVisibility, loading, refreshing, refresh } = data;

    const [range, setRange] = useState('today');
    const [activityQuery, setActivityQuery] = useState('');

    const firstName = (displayName || 'there').split(' ')[0];
    const ga4Connected = statuses?.ga4?.status === 'connected';
    const gscConnected = statuses?.gsc?.status === 'connected';

    // Connect flow: OAuth if the connector is configured, else route to Integrations.
    const connect = (connector) => {
        try {
            window.location.assign(integrationService.buildAuthUrl(workspaceId, connector));
        } catch {
            navigate(workspacePath(workspaceId, 'integrations'));
        }
    };

    const brandCompleteness = useMemo(() => computeBrandCompleteness(brand ?? {})?.percent ?? 0, [brand]);
    const spotlight = useMemo(
        () => pickSpotlight({ activation, brandCompleteness, ga4Connected, hasVisibility }),
        [activation, brandCompleteness, ga4Connected, hasVisibility],
    );
    const runSpotlight = () => {
        const a = spotlight.action;
        if (a.type === 'connect') return connect(a.connector);
        if (a.to) return navigate(a.to);
        return navigate(workspacePath(workspaceId, a.module, a.child));
    };

    // Client-side range + text filter over the loaded events.
    const filteredEvents = useMemo(() => {
        const q = activityQuery.trim().toLowerCase();
        const since = range === 'today' ? startOfToday().getTime() : Date.now() - 7 * 86400000;
        return events.filter((ev) => new Date(ev.createdAt).getTime() >= since && (!q || (ev.title || '').toLowerCase().includes(q)));
    }, [events, range, activityQuery]);

    const exportAll = () => {
        downloadCsv(`${(workspace?.name || 'workspace').toLowerCase().replace(/\s+/g, '-')}-campaigns.csv`, tableRows, [
            { key: 'id', label: 'ID' },
            { key: 'title', label: 'Campaign' },
            { key: 'status', label: 'Status' },
            { key: 'channelMix', label: 'Channels', format: (v) => (Array.isArray(v) ? v.join(' / ') : '') },
            { key: 'sessions', label: 'Sessions' },
            { key: 'conversions', label: 'Conversions' },
            { key: 'revenue', label: 'Revenue' },
        ]);
    };

    const downloadSeries = () => {
        downloadCsv(`lead-conversion-${granularity}.csv`, series?.points ?? [], [
            { key: 'label', label: 'Period' },
            { key: 'leads', label: 'Leads' },
            { key: 'conversions', label: 'Conversions' },
        ]);
    };

    return (
        <div className="db">
            <DashboardHeader
                firstName={firstName}
                subtitle={`Here's what's happening across ${workspace?.name || 'your workspace'}.`}
                onRefresh={refresh}
                refreshing={refreshing}
                onExport={exportAll}
            />

            <div className="db__kpis">
                <KpiCard
                    label="Active Campaigns"
                    icon={Target}
                    value={trends?.activeCampaigns?.value ?? (loading ? '—' : 0)}
                    delta={trends?.activeCampaigns?.delta}
                />
                <KpiCard
                    label="Search CTR"
                    icon={Search}
                    state={gscConnected ? 'ready' : 'empty'}
                    value={pct(trends?.searchCtr?.value)}
                    delta={trends?.searchCtr?.delta}
                    empty={{ ctaLabel: 'Connect Search Console', message: 'for search click-through', onCta: () => connect('gsc') }}
                />
                <KpiCard
                    label="Conversion Rate"
                    icon={TrendingUp}
                    state={ga4Connected ? 'ready' : 'empty'}
                    value={pct(trends?.conversionRate?.value)}
                    delta={trends?.conversionRate?.delta}
                    empty={{ ctaLabel: 'Connect GA4', message: 'for conversion tracking', onCta: () => connect('ga4') }}
                />
                <SpotlightCard
                    icon={spotlight.icon}
                    title={spotlight.title}
                    body={spotlight.body}
                    progress={spotlight.progress}
                    ctaLabel={spotlight.ctaLabel}
                    onCta={runSpotlight}
                />
            </div>

            <div className="db__mid">
                <LeadConversionCard
                    series={series}
                    granularity={granularity}
                    onGranularityChange={setGranularity}
                    connected={ga4Connected || statuses?.zoho?.status === 'connected'}
                    onDownload={downloadSeries}
                />
                <LatestUpdates
                    events={filteredEvents}
                    loading={loading}
                    range={range}
                    onRangeChange={setRange}
                    query={activityQuery}
                    onQueryChange={setActivityQuery}
                />
            </div>

            <CampaignTable
                rows={tableRows}
                loading={loading}
                onViewAll={() => navigate(workspacePath(workspaceId, 'measurement'))}
            />
        </div>
    );
};

export default Dashboard;
