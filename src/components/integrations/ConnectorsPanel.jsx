import { useEffect, useState } from 'react';
import { Plug, Check, LoaderCircle } from '../../lib/icons';
import Panel, { PanelHeader } from '../ui/Panel';
import Modal from '../ui/Modal';
import { integrationService } from '../../services/integrationService';
import { capabilityService } from '../../services/capabilityService';
import { eventService } from '../../services/eventService';
import { CONNECTORS } from '../../lib/connectors';
import { capabilityReport, compareByState, connectorState } from '../../lib/connectorState';
import gscLogo from '../../assets/connectors/gsc.png';
import hubspotLogo from '../../assets/connectors/hubspot.png';
import metaLogo from '../../assets/connectors/meta.png';
import ga4Logo from '../../assets/connectors/ga4.webp';
import googleAdsLogo from '../../assets/connectors/google-ads.png';
import zohoLogo from '../../assets/connectors/zoho.png';
import apolloLogo from '../../assets/connectors/apollo.png';
// Shared connector + form-primitive styles (also used by the account Settings page).
import '../../pages/ProfilePage.css';

// Brand logos per connector. Both Meta connectors share the Meta mark.
const CONNECTOR_LOGOS = {
    gsc: gscLogo,
    'meta-ad-library': metaLogo,
    ga4: ga4Logo,
    'google-ads': googleAdsLogo,
    'meta-ads': metaLogo,
    hubspot: hubspotLogo,
    zoho: zohoLogo,
    apollo: apolloLogo,
};

/**
 * Connector grid + API-key modal for a SINGLE workspace. Extracted from ProfilePage
 * so both the workspace-scoped Integrations screen and the account Settings page can
 * share one implementation. Workspace selection is the caller's concern (the sidebar
 * switcher scopes Integrations; Settings wraps this in workspace tabs).
 *
 * `chrome={false}` drops the panel wrapper and its header — for callers that are
 * already a ModuleScreen and so already name the screen and report its state.
 * `onStatusesChange` lets such a caller lift the connected count into its own
 * status line instead of repeating a header here.
 */
const ConnectorsPanel = ({ workspaceId, title = 'Connectors', meta, chrome = true, onStatusesChange }) => {
    const [statuses, setStatuses] = useState({});
    // Platform secrets — decides whether a platform-managed surface (AI
    // visibility) is actually in a workspace's scans. Not per-workspace, but the
    // workspace still has to know.
    const [platform, setPlatform] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const [modalConnector, setModalConnector] = useState(null);
    const [fieldValues, setFieldValues] = useState({});
    const [connecting, setConnecting] = useState(false);
    const [modalError, setModalError] = useState('');

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const [map, plat] = await Promise.all([
                    integrationService.listStatuses(workspaceId),
                    capabilityService.getPlatform().catch(() => ({})),
                ]);
                if (!cancelled) { setStatuses(map); setPlatform(plat ?? {}); setLoading(false); onStatusesChange?.(map); }
            } catch {
                if (!cancelled) { setStatuses({}); setLoading(false); onStatusesChange?.({}); }
            }
        })();
        return () => { cancelled = true; };
        // onStatusesChange is a reporting callback; callers memoize it. Including
        // it here would refetch every render for callers that don't.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId, reloadKey]);

    const reload = () => setReloadKey((k) => k + 1);

    const connectOauth = (connectorId) => {
        try {
            window.location.assign(integrationService.buildAuthUrl(workspaceId, connectorId));
        } catch (e) {
            setError(e.message);
        }
    };

    const openApiKeyModal = (connector) => {
        const seed = {};
        for (const f of connector.fields ?? []) {
            if (f.type === 'select' && f.options?.length) seed[f.key] = f.options[0].value;
        }
        setModalConnector(connector);
        setFieldValues(seed);
        setModalError('');
    };

    const submitApiKey = async () => {
        if (!modalConnector) return;
        setConnecting(true);
        setModalError('');
        try {
            await integrationService.connectApiKey(workspaceId, modalConnector.id, fieldValues);
            eventService.log(workspaceId, 'connector.connected', { title: `${modalConnector.label} connected`, entityType: 'connector', meta: { connector: modalConnector.id } }).catch(() => {});
            setModalConnector(null);
            reload();
        } catch (e) {
            setModalError(e.message || 'Could not connect - check the credential and try again.');
        } finally {
            setConnecting(false);
        }
    };

    const disconnect = async (provider) => {
        try {
            await integrationService.disconnect(workspaceId, provider);
            reload();
        } catch (e) {
            setError(e.message || 'Could not disconnect.');
        }
    };

    /**
     * E29 · resolve one connector to its real state. A platform-managed surface
     * has no per-workspace row, so its "status" is the platform secret instead.
     */
    const stateOf = (c) => {
        const st = c.status === 'platform_managed'
            ? { configured: Boolean(platform[c.platformCapability]) }
            : statuses[c.id];
        return {
            st,
            view: connectorState(c, st, { oauthConfigured: integrationService.isOAuthConfigured(c.id) }),
        };
    };

    const renderAction = (c, view, st) => {
        if (loading && !st) return <LoaderCircle size={16} strokeWidth={1.8} className="profile__spin" />;

        // Nothing the user can do about these — offering a Connect button that
        // would fail at consent is worse than saying why it is unavailable.
        if (['planned', 'approval_pending', 'platform_managed', 'setup_required'].includes(view.state)) {
            return null;
        }

        if (st) {
            return (
                <div className="connector-card__connected">
                    {view.state === 'degraded' && c.authType === 'oauth' && (
                        <button type="button" className="btn btn-secondary connector-card__btn" onClick={() => connectOauth(c.id)}>Reconnect</button>
                    )}
                    {view.state === 'degraded' && c.authType === 'apiKey' && (
                        <button type="button" className="btn btn-secondary connector-card__btn" onClick={() => openApiKeyModal(c)}>Reconnect</button>
                    )}
                    <button type="button" className="btn btn-ghost connector-card__btn" onClick={() => disconnect(c.id)}>Disconnect</button>
                </div>
            );
        }
        if (c.authType === 'apiKey') {
            return <button type="button" className="btn btn-secondary connector-card__btn" onClick={() => openApiKeyModal(c)}>Connect</button>;
        }
        return <button type="button" className="btn btn-secondary connector-card__btn" onClick={() => connectOauth(c.id)}>Connect</button>;
    };

    // Resolve every connector once, then group. Category order follows the
    // registry so the eighth (AI visibility) lands last rather than alphabetically
    // in the middle of the things you can actually connect.
    const categories = [];
    for (const c of CONNECTORS) {
        const { st, view } = stateOf(c);
        let group = categories.find((g) => g.category === c.category);
        if (!group) { group = { category: c.category, items: [] }; categories.push(group); }
        group.items.push({ c, view, st });
    }
    for (const g of categories) g.items.sort((a, b) => compareByState(a.view, b.view));

    const grid = (
        <>
            {error && <p className="profile__error profile__error--block">{error}</p>}
            {/* Grouped by category and sorted attention-first within each: a
                connection that has stopped working needs you more than one that
                is fine, and both outrank things you cannot act on. */}
            {categories.map(({ category, items }) => (
                <section key={category} className="connector-cat">
                    <h3 className="connector-cat__title">{category}</h3>
                    <div className="connector-grid">
                        {items.map(({ c, view, st }) => {
                            const logo = CONNECTOR_LOGOS[c.id];
                            const caps = capabilityReport(c, st);
                            return (
                                <article
                                    key={c.id}
                                    className={`connector-card connector-card--${view.state}`}
                                >
                                    <div className="connector-card__head">
                                        <span className="connector-card__icon">
                                            {logo
                                                ? <img className="connector-card__logo" src={logo} alt={`${c.label} logo`} loading="lazy" />
                                                : <Plug size={18} strokeWidth={1.7} />}
                                        </span>
                                        <span className={`connector-state connector-state--${view.tone}`}>
                                            {view.state === 'connected' && <Check size={12} strokeWidth={2.4} />}
                                            {view.label}
                                        </span>
                                    </div>
                                    <h3 className="connector-card__name">{c.label}</h3>
                                    <p className="connector-card__desc">{c.description}</p>

                                    {/* Scope visibility: what this connection can actually
                                        do, so read-only never masquerades as full access. */}
                                    {caps.length > 0 && (
                                        <ul className="connector-caps">
                                            {caps.map((cap) => (
                                                <li
                                                    key={cap.id}
                                                    className={`connector-cap connector-cap--${cap.granted === true ? 'on' : cap.granted === false ? 'off' : 'unknown'}`}
                                                    title={cap.missing?.length ? `Needs ${cap.missing.join(', ')}` : ''}
                                                >
                                                    {cap.label}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {view.detail && <p className="connector-card__detail">{view.detail}</p>}
                                    <p className="connector-card__enhances">Enhances {c.enhances}</p>
                                    <div className="connector-card__foot">{renderAction(c, view, st)}</div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ))}

            <Modal
                isOpen={Boolean(modalConnector)}
                onClose={() => { if (!connecting) setModalConnector(null); }}
                title={modalConnector ? `Connect ${modalConnector.label}` : 'Connect'}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setModalConnector(null)} disabled={connecting}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={submitApiKey} disabled={connecting}>
                            {connecting ? 'Connecting…' : 'Connect'}
                        </button>
                    </>
                }
            >
                {modalConnector?.fields?.map((f) => (
                    <div key={f.key} className="profile__field">
                        <label className="profile__label">{f.label}</label>
                        {f.type === 'select' ? (
                            <select
                                className="profile__input"
                                value={fieldValues[f.key] ?? ''}
                                onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
                            >
                                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        ) : (
                            <input
                                className="profile__input"
                                type={f.type || 'text'}
                                value={fieldValues[f.key] ?? ''}
                                onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
                                autoComplete="off"
                            />
                        )}
                        {f.help && <span className="connector-modal__help">{f.help}</span>}
                    </div>
                ))}
                {modalConnector?.helpUrl && (
                    <a className="connector-modal__link" href={modalConnector.helpUrl} target="_blank" rel="noreferrer">
                        Where do I find this? ↗
                    </a>
                )}
                <p className="connector-modal__note">Your key is stored securely server-side and never exposed to the browser.</p>
                {modalError && <p className="profile__error">{modalError}</p>}
            </Modal>
        </>
    );

    if (!chrome) return grid;

    return (
        <Panel className="profile__panel">
            <PanelHeader
                title={title}
                meta={meta ?? 'Optional — per workspace. Connecting one raises that workspace’s quality.'}
            />
            {grid}
        </Panel>
    );
};

export default ConnectorsPanel;
