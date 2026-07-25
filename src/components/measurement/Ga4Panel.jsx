import { useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from '../../lib/icons';
import Panel, { PanelHeader } from '../ui/Panel';
import EmptyState from '../ui/EmptyState';
import { integrationService } from '../../services/integrationService';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import './Ga4Panel.css';

const fmt = (n) => new Intl.NumberFormat().format(Math.round(Number(n) || 0));

// Overview measurement widget: connect GA4 → pick a property → pull last-28-day
// traffic. Self-contained (loads its own status); renders nothing heavy until
// connected. Consumption for the ga4 connector (see [[connector-architecture]]).
const Ga4Panel = ({ workspaceId }) => {
    // undefined = loading, null = not connected, object = connected status row.
    const [status, setStatus] = useState(undefined);
    const [properties, setProperties] = useState([]);
    const [picking, setPicking] = useState(false);
    const [propChoice, setPropChoice] = useState('');
    const [report, setReport] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const s = await integrationService.getStatus(workspaceId, 'ga4');
                if (!cancelled) setStatus(s ?? null);
            } catch {
                if (!cancelled) setStatus(null);
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    const connect = () => {
        try {
            window.location.assign(integrationService.buildAuthUrl(workspaceId, 'ga4'));
        } catch (e) {
            setError(e.message);
        }
    };

    const openPicker = async () => {
        setError('');
        setBusy(true);
        try {
            const { properties: list } = await integrationService.listProperties(workspaceId, 'ga4');
            setProperties(list ?? []);
            setPropChoice(list?.[0]?.id ?? '');
            setPicking(true);
        } catch (e) {
            setError(e.message || 'Could not load your GA4 properties.');
        } finally {
            setBusy(false);
        }
    };

    const pull = async (s = status) => {
        if (!s?.propertyUrl) { await openPicker(); return; }
        setBusy(true);
        setError('');
        try {
            const res = await integrationService.query(workspaceId, 'ga4');
            setReport(res);
            const fresh = await integrationService.getStatus(workspaceId, 'ga4');
            setStatus(fresh);
        } catch (e) {
            setError(e.message || 'Could not pull GA4 data.');
        } finally {
            setBusy(false);
        }
    };

    const saveProperty = async () => {
        if (!propChoice) return;
        setBusy(true);
        setError('');
        try {
            await integrationService.setProperty(workspaceId, propChoice, 'ga4');
            const s = await integrationService.getStatus(workspaceId, 'ga4');
            setStatus(s);
            setPicking(false);
            await pull(s);
        } catch (e) {
            setError(e.message || 'Could not save the property.');
            setBusy(false);
        }
    };

    const channelRows = (report?.rows ?? []).slice(0, 8);
    const maxSessions = Math.max(1, ...channelRows.map((r) => r.sessions));

    return (
        <Panel className="cockpit__intel">
            <PanelHeader
                title="Measurement · Google Analytics 4"
                meta="Live traffic from your GA4 property - last 28 days"
                action={status?.propertyUrl && (
                    <div className="module-toolbar module-toolbar--inline">
                        <button type="button" className="dash-chip-btn" onClick={openPicker} disabled={busy}>
                            Change property
                        </button>
                        <button type="button" className="dash-chip-btn" onClick={() => pull()} disabled={busy}>
                            <RefreshCw size={15} strokeWidth={1.8} /> {busy ? 'Pulling…' : 'Refresh'}
                        </button>
                    </div>
                )}
            />
            {error && <p className="brand-intel-module__error" role="alert">{error}</p>}

            {status === undefined && <EmptyState loading message="Checking connection…" />}

            {status === null && (
                <div className="ga4-panel__cta">
                    <p className="cockpit__intel-hint">Connect GA4 to ground your Overview in real traffic and engagement.</p>
                    <button type="button" className="btn btn-primary" onClick={connect}>
                        <BarChart3 size={16} strokeWidth={1.8} /> Connect Google Analytics 4
                    </button>
                </div>
            )}

            {status && !status.propertyUrl && !picking && (
                <div className="ga4-panel__cta">
                    <p className="cockpit__intel-hint">Connected. Pick which GA4 property to read.</p>
                    <button type="button" className="btn btn-primary" onClick={openPicker} disabled={busy}>
                        {busy ? 'Loading…' : 'Choose property'}
                    </button>
                </div>
            )}

            {picking && (
                <div className="input-group">
                    <label className="label-text">GA4 property</label>
                    <select className="intel-input" value={propChoice} onChange={(e) => setPropChoice(e.target.value)}>
                        {properties.length === 0 && <option value="">No properties found for this account</option>}
                        {properties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                    <div className="module-toolbar module-toolbar--inline">
                        <button type="button" className="btn btn-secondary" onClick={() => setPicking(false)} disabled={busy}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={saveProperty} disabled={busy || !propChoice}>
                            {busy ? 'Saving…' : 'Save & pull'}
                        </button>
                    </div>
                </div>
            )}

            {status?.propertyUrl && report && (
                <>
                    <div className="cockpit__intel-facts">
                        <div className="cockpit__intel-fact">
                            <span className="cockpit__intel-value font-heading">{fmt(report.totals?.sessions)}</span>
                            <span className="cockpit__intel-label">Sessions</span>
                        </div>
                        <div className="cockpit__intel-fact">
                            <span className="cockpit__intel-value font-heading">{fmt(report.totals?.users)}</span>
                            <span className="cockpit__intel-label">Users</span>
                        </div>
                        <div className="cockpit__intel-fact">
                            <span className="cockpit__intel-value font-heading">{fmt(report.totals?.pageViews)}</span>
                            <span className="cockpit__intel-label">Page views</span>
                        </div>
                    </div>
                    {channelRows.length > 0 && (
                        <>
                            <p className="ga4-bar-caption">Sessions by channel</p>
                            <div className="ga4-bars">
                                {channelRows.map((r) => (
                                    <div key={r.channel} className="ga4-bar-row">
                                        <span className="ga4-bar-label" title={r.channel}>{r.channel}</span>
                                        <span className="ga4-bar-track">
                                            <span className="ga4-bar-fill" style={{ width: `${Math.max(2, (r.sessions / maxSessions) * 100)}%` }} />
                                        </span>
                                        <span className="ga4-bar-value">{fmt(r.sessions)}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                    {status.lastSyncAt && (
                        <p className="cockpit__intel-feedback">Last pulled {formatRelativeTime(status.lastSyncAt)}.</p>
                    )}
                </>
            )}

            {status?.propertyUrl && !report && !picking && (
                <button type="button" className="btn btn-primary" onClick={() => pull()} disabled={busy}>
                    {busy ? 'Pulling…' : 'Pull latest'}
                </button>
            )}
        </Panel>
    );
};

export default Ga4Panel;
