import { useEffect, useState } from 'react';
import { Plug, Check, LoaderCircle } from '../../lib/icons';
import Panel, { PanelHeader } from '../ui/Panel';
import Modal from '../ui/Modal';
import { integrationService } from '../../services/integrationService';
import { eventService } from '../../services/eventService';
import { CONNECTORS } from '../../lib/connectors';
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
 */
const ConnectorsPanel = ({ workspaceId, title = 'Connectors', meta }) => {
    const [statuses, setStatuses] = useState({});
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
                const map = await integrationService.listStatuses(workspaceId);
                if (!cancelled) { setStatuses(map); setLoading(false); }
            } catch {
                if (!cancelled) { setStatuses({}); setLoading(false); }
            }
        })();
        return () => { cancelled = true; };
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

    const renderAction = (c) => {
        if (c.status === 'planned') return <span className="connector-card__soon">Coming soon</span>;
        const st = statuses[c.id];
        if (loading && !st) return <LoaderCircle size={16} strokeWidth={1.8} className="profile__spin" />;
        if (st) {
            return (
                <div className="connector-card__connected">
                    <span className="connector-card__status">
                        <Check size={13} strokeWidth={2.2} /> {st.status === 'connected' ? 'Connected' : st.status}
                    </span>
                    <button type="button" className="btn btn-ghost connector-card__btn" onClick={() => disconnect(c.id)}>Disconnect</button>
                </div>
            );
        }
        if (c.authType === 'apiKey') {
            return <button type="button" className="btn btn-secondary connector-card__btn" onClick={() => openApiKeyModal(c)}>Connect</button>;
        }
        if (!integrationService.isOAuthConfigured(c.id)) {
            return <span className="connector-card__soon">Setup required</span>;
        }
        return <button type="button" className="btn btn-secondary connector-card__btn" onClick={() => connectOauth(c.id)}>Connect</button>;
    };

    return (
        <Panel className="profile__panel">
            <PanelHeader
                title={title}
                meta={meta ?? 'Optional - per workspace. Everything works without them; connecting one raises that workspace’s quality.'}
            />
            {error && <p className="profile__error profile__error--block">{error}</p>}
            <div className="connector-grid">
                {CONNECTORS.map((c) => {
                    const logo = CONNECTOR_LOGOS[c.id];
                    return (
                        <article key={c.id} className={`connector-card ${c.status === 'planned' ? 'connector-card--planned' : ''}`}>
                            <div className="connector-card__head">
                                <span className="connector-card__icon">
                                    {logo
                                        ? <img className="connector-card__logo" src={logo} alt={`${c.label} logo`} loading="lazy" />
                                        : <Plug size={18} strokeWidth={1.7} />}
                                </span>
                                <span className="connector-card__cat">{c.category}</span>
                            </div>
                            <h3 className="connector-card__name">{c.label}</h3>
                            <p className="connector-card__desc">{c.description}</p>
                            <p className="connector-card__enhances">Enhances {c.enhances}</p>
                            <div className="connector-card__foot">{renderAction(c)}</div>
                        </article>
                    );
                })}
            </div>

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
        </Panel>
    );
};

export default ConnectorsPanel;
