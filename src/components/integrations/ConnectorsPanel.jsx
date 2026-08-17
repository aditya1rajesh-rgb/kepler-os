import { useEffect, useState } from 'react';
import { Plug, Check, LoaderCircle } from '../../lib/icons';
import Panel, { PanelHeader } from '../ui/Panel';
import Modal from '../ui/Modal';
import { integrationService } from '../../services/integrationService';
import { capabilityService } from '../../services/capabilityService';
import { eventService } from '../../services/eventService';
import { CONNECTORS } from '../../lib/connectors';
import EmptyState from '../ui/EmptyState';
import CapabilityList from './CapabilityList';
// capabilityReport is read by the MODALS now, not by the card: requested-vs-granted
// needs room for both halves and for the third state (`granted: null`).
import { capabilityReport, compareByState, connectorState, missingCapabilities } from '../../lib/connectorState';
import { shortfallConsequence } from '../../lib/connectorCapabilityCopy';
import gscLogo from '../../assets/connectors/gsc.png';
import ga4Logo from '../../assets/connectors/ga4.png';
import googleAdsLogo from '../../assets/connectors/google-ads.png';
import googleAioLogo from '../../assets/connectors/google-aio.png';
import hubspotLogo from '../../assets/connectors/hubspot.png';
import zohoLogo from '../../assets/connectors/zoho.png';
import salesforceLogo from '../../assets/connectors/salesforce.png';
import metaAdLibraryLogo from '../../assets/connectors/meta-ad-library.png';
import metaAdsLogo from '../../assets/connectors/meta-ads.png';
import metaPagesLogo from '../../assets/connectors/meta-pages.png';
import apolloLogo from '../../assets/connectors/apollo.png';
import linkedinLogo from '../../assets/connectors/linkedin.png';
import wordpressLogo from '../../assets/connectors/wordpress.png';
import perplexityLogo from '../../assets/connectors/perplexity.png';
import openaiLogo from '../../assets/connectors/openai.png';
import anthropicLogo from '../../assets/connectors/anthropic.png';
// Shared connector + form-primitive styles (also used by the account Settings page).
import '../../pages/ProfilePage.css';

// Brand logos per connector, one per id, all 144×144 square icons pulled from
// Brandfetch. The previous set covered 7 of 16 at aspect ratios from 1:1 to 16:9
// (hubspot was a 3840×2160 image, gsc an Open Graph share card), which is why the
// card renders them in a fixed square slot.
//
// Brandfetch has no product-specific marks for Google's or Meta's sub-products,
// so the four Google connectors share the Google mark and the two Facebook-domain
// connectors share the Facebook mark. That is the brand, not a mapping error.
const CONNECTOR_LOGOS = {
    gsc: gscLogo,
    ga4: ga4Logo,
    'google-ads': googleAdsLogo,
    'google-aio': googleAioLogo,
    hubspot: hubspotLogo,
    zoho: zohoLogo,
    salesforce: salesforceLogo,
    'meta-ad-library': metaAdLibraryLogo,
    'meta-ads': metaAdsLogo,
    'meta-pages': metaPagesLogo,
    apollo: apolloLogo,
    linkedin: linkedinLogo,
    wordpress: wordpressLogo,
    perplexity: perplexityLogo,
    openai: openaiLogo,
    anthropic: anthropicLogo,
};

const PROVIDER_LABEL = { google: 'Google', meta: 'Meta', linkedin: 'LinkedIn' };

/**
 * Preconditions the USER must satisfy before consent will produce a working
 * connection. Stated before the redirect, not discovered after it: a capability
 * that silently stays unavailable because of an unlinked account is the exact
 * failure the needs-attention modal exists to explain.
 */
const PRECONDITION = {
    'meta-pages': 'Instagram needs a Business or Creator account linked to the Page. Without that link, publishing to Instagram stays unavailable after connecting. Meta approves posting to your own Page without review; posting to a client’s account needs Meta app review, which Kepler has not completed yet.',
    linkedin: 'This publishes to your personal LinkedIn profile. Company-Page posting is a separate, gated tier.',
    'google-ads': 'Reading the Google Ads API also needs a Google-approved developer token. That is separate from this connection, and connecting works without it.',
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
    const [confirmDisconnect, setConfirmDisconnect] = useState(null);
    const [disconnecting, setDisconnecting] = useState(false);
    const [search, setSearch] = useState('');
    // The OAuth pre-consent step, and the needs-attention detail. Each holds
    // { connector, status } so the modal can report against the real connection.
    const [oauthIntent, setOauthIntent] = useState(null);
    const [attention, setAttention] = useState(null);

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
            setModalError(e.message || 'Could not connect. Check the credential and try again.');
        } finally {
            setConnecting(false);
        }
    };

    // Disconnecting revokes the credential, and for an API-key connector
    // reconnecting means going back to the provider for a new token. That is not
    // a single-click action, so it is confirmed.
    const disconnect = async () => {
        const connector = confirmDisconnect;
        if (!connector) return;
        setDisconnecting(true);
        try {
            await integrationService.disconnect(workspaceId, connector.id);
            setConfirmDisconnect(null);
            reload();
        } catch (e) {
            setError(e.message || 'Could not disconnect.');
            setConfirmDisconnect(null);
        } finally {
            setDisconnecting(false);
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
                    {/* A degraded connection leads with "Why?", not with Reconnect:
                        the shortfall is the thing to understand, and reconnecting
                        blind is what produced the shortfall the first time. */}
                    {view.state === 'degraded' && (
                        <button type="button" className="btn btn-secondary connector-card__btn" onClick={() => setAttention({ connector: c, status: st })}>
                            Why?
                        </button>
                    )}
                    <button type="button" className="btn btn-ghost connector-card__btn" onClick={() => setConfirmDisconnect(c)}>Disconnect</button>
                </div>
            );
        }
        if (c.authType === 'apiKey') {
            return <button type="button" className="btn btn-secondary connector-card__btn" onClick={() => openApiKeyModal(c)}>Connect</button>;
        }
        // OAuth goes through a pre-consent step: what is being asked for, and any
        // precondition, BEFORE the user is thrown to a provider consent screen.
        return <button type="button" className="btn btn-secondary connector-card__btn" onClick={() => setOauthIntent({ connector: c, status: st })}>Connect</button>;
    };

    /* One flat grid, not eight category sections. Sixteen connectors across eight
       categories meant five headers over a single card each, and a header plus a
       two-thirds-empty row costs more than it explains. Search finds a connector
       faster past a handful of items, and it matches what a connector ENHANCES as
       well as its name - which a category label cannot.

       Grouping is not lost: the registry order still clusters related connectors,
       and every card names the module it feeds. */
    const q = search.trim().toLowerCase();
    const visible = CONNECTORS
        .map((c) => ({ c, ...stateOf(c) }))
        .filter(({ c }) => {
            if (!q) return true;
            return `${c.label} ${c.enhances} ${c.category}`.toLowerCase().includes(q);
        })
        // Attention first, then working, then everything you cannot act on.
        .sort((a, b) => compareByState(a.view, b.view));

    const grid = (
        <>
            {error && <p className="profile__error profile__error--block">{error}</p>}
            <div className="connector-search-row">
                <input
                    type="search"
                    className="connector-search"
                    placeholder="Search connectors, or what they enhance…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search connectors"
                />
            </div>

            {visible.length === 0 ? (
                <EmptyState
                    message={`No connectors match “${search.trim()}”.`}
                    action={
                        <button type="button" className="btn btn-secondary" onClick={() => setSearch('')}>
                            Clear search
                        </button>
                    }
                />
            ) : (
                <div className="connector-grid">
                    {visible.map(({ c, view, st }) => {
                        const logo = CONNECTOR_LOGOS[c.id];
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
                                <p className="connector-card__enhances">Enhances {c.enhances}</p>
                                <p className="connector-card__desc">{c.description}</p>

                                {/* Capability chips used to sit here, and they were
                                    asserting something a card cannot know. A provider
                                    may grant a SUBSET at consent time, and `granted:
                                    null` means unknowable rather than refused - three
                                    flat chips reading Read/Write/Targeting implied all
                                    three were live even on a card in Needs attention.
                                    Requested-versus-granted now lives in the modal,
                                    where there is room for both halves and for the
                                    third state. */}

                                {view.detail && <p className="connector-card__detail">{view.detail}</p>}
                                <div className="connector-card__foot">{renderAction(c, view, st)}</div>
                            </article>
                        );
                    })}
                </div>
            )}

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

            {/* Says what stops working, and what does not. `enhances` already
                names the module this connection feeds, so the consequence is
                specific without inventing a per-connector string. */}
            <Modal
                isOpen={Boolean(confirmDisconnect)}
                onClose={() => { if (!disconnecting) setConfirmDisconnect(null); }}
                title={confirmDisconnect ? `Disconnect ${confirmDisconnect.label}?` : 'Disconnect'}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setConfirmDisconnect(null)} disabled={disconnecting}>Cancel</button>
                        <button type="button" className="btn-destructive" onClick={disconnect} disabled={disconnecting}>
                            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                        </button>
                    </>
                }
            >
                {confirmDisconnect && (
                    <>
                        <p>
                            {confirmDisconnect.enhances} stops using this connection, and its output
                            falls back to what Kepler can produce without it.
                        </p>
                        <p className="connector-modal__note">
                            Nothing already generated is deleted.
                            {confirmDisconnect.authType === 'apiKey'
                                ? ' Your credential is removed, so reconnecting means pasting it again or creating a new one.'
                                : ' Reconnecting means approving access with the provider again.'}
                        </p>
                    </>
                )}
            </Modal>

            {/* ── Connect (OAuth): what is asked for, before consent ───────────── */}
            <Modal
                isOpen={Boolean(oauthIntent)}
                onClose={() => setOauthIntent(null)}
                title={oauthIntent ? `Connect ${oauthIntent.connector.label}` : 'Connect'}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setOauthIntent(null)}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={() => connectOauth(oauthIntent.connector.id)}>
                            Continue to {PROVIDER_LABEL[oauthIntent?.connector?.family] ?? 'the provider'}
                        </button>
                    </>
                }
            >
                {oauthIntent && (
                    <>
                        <p>
                            You will be sent to {PROVIDER_LABEL[oauthIntent.connector.family] ?? 'the provider'} to
                            approve access. Kepler never sees your password.
                        </p>
                        <p className="connector-modal__eyebrow">What Kepler is asking for</p>
                        <CapabilityList
                            connector={oauthIntent.connector}
                            caps={capabilityReport(oauthIntent.connector, null).map((c) => ({ ...c, granted: null }))}
                            mode="request"
                        />
                        {PRECONDITION[oauthIntent.connector.id] && (
                            <>
                                <p className="connector-modal__eyebrow">Before you continue</p>
                                <p className="connector-modal__note">{PRECONDITION[oauthIntent.connector.id]}</p>
                            </>
                        )}
                        <p className="connector-modal__eyebrow">What it improves</p>
                        <p className="connector-modal__note">
                            {oauthIntent.connector.enhances}: {oauthIntent.connector.description}
                        </p>
                    </>
                )}
            </Modal>

            {/* ── Needs attention: requested vs GRANTED, and what that costs ───── */}
            <Modal
                isOpen={Boolean(attention)}
                onClose={() => setAttention(null)}
                title={attention ? `${attention.connector.label} needs attention` : 'Needs attention'}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setAttention(null)}>Close</button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                                const c = attention.connector;
                                setAttention(null);
                                if (c.authType === 'apiKey') openApiKeyModal(c);
                                else connectOauth(c.id);
                            }}
                        >
                            Reconnect
                        </button>
                    </>
                }
            >
                {attention && (() => {
                    const caps = capabilityReport(attention.connector, attention.status);
                    const missing = missingCapabilities(attention.connector, attention.status);
                    const view = connectorState(attention.connector, attention.status, {
                        oauthConfigured: integrationService.isOAuthConfigured(attention.connector.id),
                    });
                    return (
                        <>
                            <p>{view.detail}</p>
                            <p className="connector-modal__eyebrow">What this connection can do</p>
                            <CapabilityList connector={attention.connector} caps={caps} />
                            {missing.length > 0 && (
                                <>
                                    <p className="connector-modal__eyebrow">What that means today</p>
                                    <p className="connector-modal__note">
                                        {shortfallConsequence(attention.connector, missing)}
                                    </p>
                                </>
                            )}
                        </>
                    );
                })()}
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
