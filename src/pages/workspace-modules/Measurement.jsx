import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TrendingUp, RefreshCw, Check } from '../../lib/icons';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import EmptyState from '../../components/ui/EmptyState';
import Ga4Panel from '../../components/measurement/Ga4Panel';
import { getModule } from '../../constants/moduleRegistry';
import { workspacePath } from '../../constants/routes';
import { useWorkspaceConfig } from '../../hooks/useWorkspaceConfig';
import { campaignService } from '../../services/campaignService';
import { measurementService } from '../../services/measurementService';
import { visibilityService } from '../../services/visibilityService';
import { integrationService } from '../../services/integrationService';
import { buildTrackedUrl, campaignUtm, TRACKING_SOURCES } from '../../lib/tracking';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import '../../styles/module-kepler.css';
import './Measurement.css';

const fmt = (n) => new Intl.NumberFormat().format(Math.round(Number(n) || 0));
const dash = (v) => (v === null || v === undefined ? '—' : fmt(v));
const pct = (x) => `${Math.round((Number(x) || 0) * 100)}%`;
const money = (n) => `$${new Intl.NumberFormat().format(Math.round(Number(n) || 0))}`;

const MEASUREMENT = getModule('measurement');

// Measurement is a two-screen parent: Performance (traffic → conversions → revenue,
// attributed by UTM) and AI Visibility (AEO share of voice). State loads once at the
// parent so the Performance strip can still surface the AI-share fact and link across.
const Measurement = ({ workspaceId }) => {
    const { subModuleId } = useParams();
    const navigate = useNavigate();
    const { brand } = useWorkspaceConfig(workspaceId);
    const baseUrl = brand?.url || '';

    const [gaReady, setGaReady] = useState(null); // null = loading, then boolean
    const [zohoConnected, setZohoConnected] = useState(false);
    const [campaigns, setCampaigns] = useState([]);
    const [snapshots, setSnapshots] = useState({});
    const [visibility, setVisibility] = useState(null);
    const [gaps, setGaps] = useState([]);
    const [scanning, setScanning] = useState(false);
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
                const [ga, zoho, camps, snaps, vis, vgaps] = await Promise.all([
                    integrationService.getStatus(workspaceId, 'ga4'),
                    integrationService.getStatus(workspaceId, 'zoho'),
                    campaignService.listCampaigns(workspaceId),
                    measurementService.getSnapshots(workspaceId),
                    // Resilient: a not-yet-migrated visibility_scans table must not
                    // take down the whole Measurement page — degrade to null.
                    visibilityService.getLatestVisibility(workspaceId).catch(() => null),
                    visibilityService.getVisibilityGaps(workspaceId).catch(() => []),
                ]);
                if (cancelled) return;
                setGaReady(ga?.status === 'connected' && Boolean(ga?.propertyUrl));
                setZohoConnected(zoho?.status === 'connected');
                setCampaigns(camps ?? []);
                setSnapshots(snaps ?? {});
                setVisibility(vis);
                setGaps(vgaps ?? []);
            } catch (e) {
                if (!cancelled) { setError(e?.message || 'Could not load measurement data.'); setGaReady(false); }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

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
            const outreach = await measurementService.pullOutreach(workspaceId);
            if (outreach.sequences) {
                notes.push(`Outreach: ${outreach.attributed} campaign${outreach.attributed === 1 ? '' : 's'} from ${outreach.sequences} sequence${outreach.sequences === 1 ? '' : 's'}`);
            }
            setSnapshots(await measurementService.getSnapshots(workspaceId));
            setNotice(notes.length ? `Pulled — ${notes.join(' · ')}.` : 'Nothing to pull yet — connect GA4/Zoho or run a sequence.');
        } catch (e) {
            setError(e?.message || 'Could not pull outcomes.');
        } finally {
            setPulling(false);
        }
    };

    const runScan = async (mock = false) => {
        setScanning(true);
        setError('');
        setNotice('');
        try {
            const r = await visibilityService.runScan(workspaceId, { mock });
            setVisibility(await visibilityService.getLatestVisibility(workspaceId));
            setGaps(await visibilityService.getVisibilityGaps(workspaceId).catch(() => []));
            if (mock) {
                setNotice(`Sample scan — ${r.promptCount} prompts × ${r.surfaces.length} surfaces (illustrative, not real measurement).`);
            } else if (!r.promptCount) {
                setNotice(r.message || 'No buyer prompts could be generated yet.');
            } else if (!r.counts.ok) {
                setNotice('No AI surfaces are connected yet — connect Perplexity/OpenAI/Anthropic to measure live, or run a sample.');
            } else {
                setNotice(`Scan complete — share of voice ${pct(r.shareOfVoice)} across ${r.surfaces.length} surfaces.`);
            }
        } catch (e) {
            setError(e?.message || 'Could not run the visibility scan.');
        } finally {
            setScanning(false);
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

    const active = MEASUREMENT.children.some((c) => c.id === subModuleId) ? subModuleId : MEASUREMENT.defaultChild;
    const go = (id) => navigate(workspacePath(workspaceId, 'measurement', id));

    const renderPerformance = () => (
        <>
            <Panel>
                <PanelHeader
                    title="Performance"
                    meta="Per-campaign outcomes, attributed via UTM. Ship the tracked links below and GA4 reports back here."
                    action={(
                        <button type="button" className="btn btn-primary" onClick={pull} disabled={pulling}>
                            <RefreshCw size={15} strokeWidth={1.8} /> {pulling ? 'Pulling…' : 'Pull latest'}
                        </button>
                    )}
                />
                {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
                {!gaReady && (
                    <p className="cockpit__intel-hint">Connect Google Analytics 4 and pick a property in <strong>Integrations</strong> for the traffic/conversion rail.</p>
                )}
                {!zohoConnected && (
                    <p className="cockpit__intel-hint">Connect Zoho for the CRM lead rail — push a campaign-linked sequence from <strong>Outreach</strong> and it attributes back here.</p>
                )}
                {!baseUrl && (
                    <p className="cockpit__intel-hint">Add your site URL in <strong>Brand Intelligence</strong> so tracked links can be generated.</p>
                )}
            </Panel>

            <div className="cockpit__intel-facts measurement-totals">
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value font-heading">{fmt(totals.sessions)}</span>
                    <span className="cockpit__intel-label">Sessions (28d)</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value font-heading">{fmt(totals.conversions)}</span>
                    <span className="cockpit__intel-label">Conversions</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value font-heading">{fmt(totals.crmRecords)}</span>
                    <span className="cockpit__intel-label">CRM leads</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value font-heading">{fmt(totals.meetings)}</span>
                    <span className="cockpit__intel-label">Meetings</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value font-heading">{money(totals.revenue)}</span>
                    <span className="cockpit__intel-label">Revenue (won)</span>
                </div>
                <button type="button" className="cockpit__intel-fact measurement-fact-link" onClick={() => go('ai-visibility')} title="Open AI Visibility">
                    <span className="cockpit__intel-value font-heading">{visibility ? pct(visibility.shareOfVoice) : '—'}</span>
                    <span className="cockpit__intel-label">AI share of voice ↗</span>
                </button>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value font-heading">{campaigns.length}</span>
                    <span className="cockpit__intel-label">Campaigns</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value font-heading">{lastPulled ? formatRelativeTime(lastPulled) : '—'}</span>
                    <span className="cockpit__intel-label">Last pulled</span>
                </div>
            </div>

            <Panel className="module-panel">
                <PanelHeader title="Campaign performance" meta="Assets → sessions → conversions, matched by UTM" />
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
                                            <span><strong>{m ? dash(m.conversions) : '—'}</strong> conv.</span>
                                            <span><strong>{m ? dash(m.sent) : '—'}</strong> sent</span>
                                            <span><strong>{m ? dash(m.replied) : '—'}</strong> replied</span>
                                            <span><strong>{m ? dash(m.meetings) : '—'}</strong> mtgs</span>
                                            <span><strong>{m ? dash(m.crmRecords) : '—'}</strong> CRM</span>
                                            <span><strong>{m && m.revenue ? money(m.revenue) : '—'}</strong> rev.</span>
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

            <Ga4Panel workspaceId={workspaceId} />
        </>
    );

    const renderAiVisibility = () => (
        <Panel className="module-panel">
            <PanelHeader
                title="AI Visibility (AEO)"
                meta="Share of voice when buyers ask AI assistants — ChatGPT, Claude, Perplexity & Google AI Overviews"
                action={(
                    <div className="measurement-scan-actions">
                        <button type="button" className="btn btn-primary" onClick={() => runScan(false)} disabled={scanning}>
                            <RefreshCw size={15} strokeWidth={1.8} /> {scanning ? 'Scanning…' : 'Run visibility scan'}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => runScan(true)} disabled={scanning}>
                            Run sample
                        </button>
                    </div>
                )}
            />
            {!visibility ? (
                <EmptyState message="No visibility scans yet. Run a scan to see whether AI assistants mention your brand when buyers ask category questions — connect providers for live data, or run a sample to preview the loop." />
            ) : (
                <>
                    {!visibility.hasReal && (
                        <p className="brand-intel-module__source-label">
                            Sample data — providers not connected yet. Connect Perplexity / ChatGPT / Claude for live measurement.
                        </p>
                    )}
                    <div className="cockpit__intel-facts">
                        <div className="cockpit__intel-fact">
                            <span className="cockpit__intel-value font-heading">{pct(visibility.shareOfVoice)}</span>
                            <span className="cockpit__intel-label">Share of voice</span>
                        </div>
                        <div className="cockpit__intel-fact">
                            <span className="cockpit__intel-value font-heading">{pct(visibility.brandPresenceRate)}</span>
                            <span className="cockpit__intel-label">Answer presence</span>
                        </div>
                        <div className="cockpit__intel-fact">
                            <span className="cockpit__intel-value font-heading">{fmt(visibility.promptCount)}</span>
                            <span className="cockpit__intel-label">Prompts tracked</span>
                        </div>
                        <div className="cockpit__intel-fact">
                            <span className="cockpit__intel-value font-heading">{visibility.surfaces.length}</span>
                            <span className="cockpit__intel-label">Surfaces</span>
                        </div>
                        <div className="cockpit__intel-fact">
                            <span className="cockpit__intel-value font-heading">{visibility.capturedAt ? formatRelativeTime(visibility.capturedAt) : '—'}</span>
                            <span className="cockpit__intel-label">Last scan</span>
                        </div>
                    </div>
                    {visibility.perCompetitor?.length > 0 && (
                        <ul className="measurement-list measurement-sov">
                            <li className="measurement-row measurement-sov__row">
                                <span className="measurement-row__title">{brand?.name || 'Your brand'}</span>
                                <span className="measurement-sov__bar"><span className="measurement-sov__fill" style={{ width: pct(visibility.shareOfVoice) }} /></span>
                                <span className="measurement-sov__val">{pct(visibility.shareOfVoice)}</span>
                            </li>
                            {visibility.perCompetitor.map((c) => (
                                <li key={c.name} className="measurement-row measurement-sov__row">
                                    <span className="measurement-row__title">{c.name}</span>
                                    <span className="measurement-sov__bar"><span className="measurement-sov__fill measurement-sov__fill--comp" style={{ width: pct(c.share) }} /></span>
                                    <span className="measurement-sov__val">{pct(c.share)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {gaps.length > 0 && (
                        <div className="measurement-gaps">
                            <p className="brand-intel-module__source-label">Content opportunities — buyers ask these and a competitor is named, but you are not:</p>
                            <ul className="measurement-list">
                                {gaps.slice(0, 8).map((g) => (
                                    <li key={`${g.surface}:${g.prompt}`} className="measurement-row">
                                        <span className="measurement-row__title">{g.prompt}</span>
                                        <span className="measurement-sov__val">{g.competitors.slice(0, 3).join(', ')}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </Panel>
    );

    return (
        <div className="measurement-module module-kepler">
            {active === 'ai-visibility' ? renderAiVisibility() : renderPerformance()}
        </div>
    );
};

export default Measurement;
