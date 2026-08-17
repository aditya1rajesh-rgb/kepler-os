import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TrendingUp, RefreshCw, Check } from '../../lib/icons';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import ModuleScreen from '../../components/layout/ModuleScreen';
import ToolRail, { ToolCard, ToolGroup } from '../../components/layout/ToolRail';
import EmptyState from '../../components/ui/EmptyState';
import Ga4Panel from '../../components/measurement/Ga4Panel';
import ChannelDetail from '../../components/measurement/ChannelDetail';
import { useWorkspaceConfig } from '../../hooks/useWorkspaceConfig';
import { campaignService } from '../../services/campaignService';
import { measurementService } from '../../services/measurementService';
import { integrationService } from '../../services/integrationService';
import { goalsService } from '../../services/goalsService';
import { workspacePath } from '../../constants/routes';
import { buildTrackedUrl, campaignUtm, TRACKING_SOURCES } from '../../lib/tracking';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import '../../styles/module-kepler.css';
import './Measurement.css';

const fmt = (n) => new Intl.NumberFormat().format(Math.round(Number(n) || 0));
const dash = (v) => (v === null || v === undefined ? '—' : fmt(v));
const money = (n) => `$${new Intl.NumberFormat().format(Math.round(Number(n) || 0))}`;


// Measurement is a two-screen parent: Performance (traffic → conversions → revenue,
// attributed by UTM) and AI Visibility (AEO share of voice). State loads once at the
// parent so the Performance strip can still surface the AI-share fact and link across.
const Measurement = ({ workspaceId }) => {
    const { brand } = useWorkspaceConfig(workspaceId);
    const navigate = useNavigate();
    const baseUrl = brand?.url || '';

    // L1 · the drill target. The cockpit links here with the compound key and the
    // goal that was in context, so the thread survives the click.
    const [searchParams, setSearchParams] = useSearchParams();
    const channelKey = searchParams.get('channel');
    const goalId = searchParams.get('goal');
    const [channelDetail, setChannelDetail] = useState(null);
    const [channelGoal, setChannelGoal] = useState(null);
    // Clear during render when the drilled channel changes, so the previous
    // channel's numbers never paint under the new channel's heading.
    const [lastChannelKey, setLastChannelKey] = useState(channelKey);
    if (channelKey !== lastChannelKey) {
        setLastChannelKey(channelKey);
        setChannelDetail(null);
        setChannelGoal(null);
    }

    const [gaReady, setGaReady] = useState(null); // null = loading, then boolean
    const [zohoConnected, setZohoConnected] = useState(false);
    const [salesforceConnected, setSalesforceConnected] = useState(false);
    const [campaigns, setCampaigns] = useState([]);
    const [snapshots, setSnapshots] = useState({});
    const [loading, setLoading] = useState(true);
    const [pulling, setPulling] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [openLinks, setOpenLinks] = useState(null);
    const [copied, setCopied] = useState('');

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const [ga, zoho, sf, camps, snaps] = await Promise.all([
                    integrationService.getStatus(workspaceId, 'ga4'),
                    integrationService.getStatus(workspaceId, 'zoho'),
                    integrationService.getStatus(workspaceId, 'salesforce'),
                    campaignService.listCampaigns(workspaceId),
                    measurementService.getSnapshots(workspaceId),
                ]);
                if (cancelled) return;
                setGaReady(ga?.status === 'connected' && Boolean(ga?.propertyUrl));
                setZohoConnected(zoho?.status === 'connected');
                setSalesforceConnected(sf?.status === 'connected');
                setCampaigns(camps ?? []);
                setSnapshots(snaps ?? {});
            } catch (e) {
                if (!cancelled) { setError(e?.message || 'Could not load measurement data.'); setGaReady(false); }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    // Load the drilled channel. Scoped to the goal's campaigns when one came with
    // the link — a workspace-wide view here would credit the goal with every
    // campaign, which is the inflation the goals engine refuses.
    useEffect(() => {
        if (!workspaceId || !channelKey) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const goal = goalId ? await goalsService.get(workspaceId, goalId).catch(() => null) : null;
                const goalCampaigns = goal ? await goalsService.campaignsFor(workspaceId, goal.id).catch(() => []) : null;
                const detail = await measurementService.getChannelDetail(workspaceId, {
                    key: channelKey,
                    goalCampaignIds: goalCampaigns ? goalCampaigns.map((c) => c.id) : null,
                });
                if (cancelled) return;
                setChannelGoal(goal);
                setChannelDetail(detail);
            } catch (e) {
                if (!cancelled) setError(e?.message || 'Could not load that channel.');
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId, channelKey, goalId]);

    const pull = async () => {
        setPulling(true);
        setError('');
        setNotice('');
        try {
            const notes = [];
            if (gaReady) {
                const r = await measurementService.pullGa4(workspaceId, campaigns);
                notes.push(`GA4: ${r.attributed} campaign${r.attributed === 1 ? '' : 's'} from ${r.rowsSeen} source${r.rowsSeen === 1 ? '' : 's'}`);
            }
            if (zohoConnected) {
                const r = await measurementService.pullZoho(workspaceId, campaigns);
                notes.push(`Zoho: ${r.attributed} campaign${r.attributed === 1 ? '' : 's'} from ${r.records} record${r.records === 1 ? '' : 's'}`);
                const rev = await measurementService.pullZohoRevenue(workspaceId, campaigns);
                if (rev.wonDeals) notes.push(`Revenue: ${money(rev.revenue)} from ${rev.wonDeals} won deal${rev.wonDeals === 1 ? '' : 's'}`);
            }
            if (salesforceConnected) {
                const r = await measurementService.pullSalesforce(workspaceId, campaigns);
                notes.push(`Salesforce: ${r.attributed} campaign${r.attributed === 1 ? '' : 's'} from ${r.records} record${r.records === 1 ? '' : 's'}`);
                const rev = await measurementService.pullSalesforceRevenue(workspaceId, campaigns);
                if (rev.wonDeals) notes.push(`Salesforce revenue: ${rev.attributed} campaign${rev.attributed === 1 ? '' : 's'} from ${rev.wonDeals} won deal${rev.wonDeals === 1 ? '' : 's'}`);
            }
            const outreach = await measurementService.pullOutreach(workspaceId);
            if (outreach.sequences) {
                notes.push(`Outreach: ${outreach.attributed} campaign${outreach.attributed === 1 ? '' : 's'} from ${outreach.sequences} sequence${outreach.sequences === 1 ? '' : 's'}`);
            }
            setSnapshots(await measurementService.getSnapshots(workspaceId));
            setNotice(notes.length ? `Pulled: ${notes.join(' · ')}.` : 'Nothing to pull yet. Connect GA4/Zoho or run a sequence.');
        } catch (e) {
            setError(e?.message || 'Could not pull outcomes.');
        } finally {
            setPulling(false);
        }
    };

    const copyLink = (key, url) => {
        navigator.clipboard.writeText(url).then(
            () => { setCopied(key); setTimeout(() => setCopied(''), 1500); },
            () => setError('Copy blocked by the browser.'),
        );
    };

    if (loading) {
        return <div className="measurement-module module-kepler"><EmptyState loading message="Loading…" /></div>;
    }

    const unattributed = snapshots.__unattributed__?.metrics ?? null;
    const totals = Object.values(snapshots).reduce(
        (a, s) => ({
            sessions: a.sessions + (s.metrics?.sessions || 0),
            conversions: a.conversions + (s.metrics?.conversions || 0),
            crmRecords: a.crmRecords + (s.metrics?.crmRecords || 0),
            replied: a.replied + (s.metrics?.replied || 0),
            meetings: a.meetings + (s.metrics?.meetings || 0),
            revenue: a.revenue + (s.metrics?.revenue || 0),
        }),
        { sessions: 0, conversions: 0, crmRecords: 0, replied: 0, meetings: 0, revenue: 0 },
    );
    const lastPulled = Object.values(snapshots).map((s) => s.capturedAt).filter(Boolean).sort().pop();


    /* The three "connect X for the Y rail" hints were the entire body of v3's
       near-empty Performance panel. They are setup guidance, so they belong with
       the other setup in the rail — not above the numbers they qualify. */
    const setupHints = [
        !gaReady && { key: 'ga4', text: <>Connect Google Analytics 4 and pick a property in <strong>Integrations</strong> for the traffic/conversion rail.</> },
        !zohoConnected && { key: 'zoho', text: <>Connect Zoho for the CRM lead rail. Push a campaign-linked sequence from <strong>Outreach</strong> and it attributes back here.</> },
        !baseUrl && { key: 'url', text: <>Add your site URL in <strong>Brand Intelligence</strong> so tracked links can be generated.</> },
    ].filter(Boolean);

    const renderPerformance = () => (
        <>
            {/* One stat strip, not two. v3 rendered this one and a second inside
                Ga4Panel in the same scroll, with no relationship between them. */}
            <div className="cockpit__intel-facts measurement-totals">
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value">{fmt(totals.sessions)}</span>
                    <span className="cockpit__intel-label">Sessions (28d)</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value">{fmt(totals.conversions)}</span>
                    <span className="cockpit__intel-label">Conversions</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value">{fmt(totals.crmRecords)}</span>
                    <span className="cockpit__intel-label">CRM records</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value">{fmt(totals.meetings)}</span>
                    <span className="cockpit__intel-label">Meetings</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value">{money(totals.revenue)}</span>
                    <span className="cockpit__intel-label">Revenue (won)</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value">{campaigns.length}</span>
                    <span className="cockpit__intel-label">Campaigns</span>
                </div>
            </div>

            <Panel variant="quiet">
                <PanelHeader title="Campaign performance" meta={`${campaigns.length} campaigns · matched by UTM`} />
                {campaigns.length === 0 ? (
                    <EmptyState message="No campaigns yet. Create one in Campaigns, then ship its tracked links to attribute outcomes." />
                ) : (
                    <ul className="measurement-list">
                        {campaigns.map((c) => {
                            const steps = c.plan?.steps ?? [];
                            const done = steps.filter((s) => s.status === 'done').length;
                            const m = snapshots[c.id]?.metrics ?? null;
                            const open = openLinks === c.id;
                            return (
                                <li key={c.id} className="measurement-row">
                                    <div className="measurement-row__head">
                                        <div className="measurement-row__main">
                                            <span className="measurement-row__title">{c.title || c.goal || 'Untitled campaign'}</span>
                                            <span className="measurement-row__sub">{done}/{steps.length} assets · <code>{campaignUtm(c)}</code></span>
                                        </div>
                                        <div className="measurement-row__metrics">
                                            <span><strong>{m ? dash(m.sessions) : '—'}</strong> sessions</span>
                                            <span><strong>{m ? dash(m.conversions) : '—'}</strong> conversions</span>
                                            <span><strong>{m ? dash(m.sent) : '—'}</strong> sent</span>
                                            <span><strong>{m ? dash(m.replied) : '—'}</strong> replied</span>
                                            <span><strong>{m ? dash(m.meetings) : '—'}</strong> meetings</span>
                                            <span><strong>{m ? dash(m.crmRecords) : '—'}</strong> CRM records</span>
                                            <span><strong>{m && m.revenue ? money(m.revenue) : '—'}</strong> revenue</span>
                                        </div>
                                        <button type="button" className="btn btn-ghost" onClick={() => setOpenLinks(open ? null : c.id)} disabled={!baseUrl}>
                                            {open ? 'Hide links' : 'Tracked links'}
                                        </button>
                                    </div>
                                    {open && baseUrl && (
                                        <div className="measurement-row__links">
                                            {TRACKING_SOURCES.map((s) => {
                                                const url = buildTrackedUrl({ baseUrl, source: s.value, campaign: c });
                                                const key = `${c.id}:${s.value}`;
                                                return (
                                                    <div key={s.value} className="measurement-link">
                                                        <span className="measurement-link__label">{s.label}</span>
                                                        <code className="measurement-link__url" title={url}>{url}</code>
                                                        <button type="button" className="btn btn-secondary" onClick={() => copyLink(key, url)}>
                                                            {copied === key ? <><Check size={13} strokeWidth={2.2} /> Copied</> : 'Copy'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {unattributed && (unattributed.sessions > 0) && (
                    <p className="brand-intel-module__source-label measurement-unattributed">
                        <TrendingUp size={13} strokeWidth={1.8} /> {fmt(unattributed.sessions)} sessions not attributed to a KEPLER campaign (direct, organic, or untagged links).
                    </p>
                )}
            </Panel>
        </>
    );


    return (
        <ModuleScreen
            className="measurement-module module-kepler"
            moduleKey="measurement"
            banner={
                <>
                    {channelKey && (
                        <button type="button" className="campaigns__back" onClick={() => setSearchParams({})}>
                            ← All channels
                        </button>
                    )}
                    {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                    {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
                </>
            }
            /* E30 · the mode switch is gone with AI Visibility. Measurement is
               one screen again until E14/E15 give Channels and Pages content. */
            status={lastPulled ? <span>Last pulled {formatRelativeTime(lastPulled)}</span> : null}
            primary={
                <button type="button" className="btn btn-primary" onClick={pull} disabled={pulling}>
                    <RefreshCw size={15} strokeWidth={1.8} /> {pulling ? 'Pulling…' : 'Pull latest'}
                </button>
            }
            railLabel="Sources"
            rail={(
                <ToolRail>
                    <ToolGroup label="Data sources">
                        <ToolCard title="Google Analytics 4" state={gaReady ? 'Connected' : 'Not connected'} tone={gaReady ? 'ok' : 'warn'}>
                            <Ga4Panel workspaceId={workspaceId} chrome={false} />
                        </ToolCard>
                    </ToolGroup>
                    {setupHints.length > 0 && (
                        <ToolGroup label="To measure more">
                            {setupHints.map((h) => (
                                <ToolCard key={h.key} title={h.key === 'ga4' ? 'Traffic & conversions' : h.key === 'zoho' ? 'CRM records' : 'Tracked links'} defaultOpen>
                                    <p className="cockpit__intel-hint">{h.text}</p>
                                </ToolCard>
                            ))}
                        </ToolGroup>
                    )}
                </ToolRail>
            )}
        >
            {channelKey && !channelDetail ? (
                /* Not "no readings" — that is a different, and much more
                   alarming, sentence than "still loading". */
                <EmptyState loading message="Loading channel…" />
            ) : channelKey ? (
                <ChannelDetail
                    detail={channelDetail}
                    goalName={channelGoal?.name ?? ''}
                    onBack={() => setSearchParams({})}
                    onOpenCampaign={(c) => navigate(`${workspacePath(workspaceId, 'campaigns', 'all')}?campaign=${c.id}`)}
                />
            ) : renderPerformance()}
        </ModuleScreen>
    );
};

export default Measurement;
