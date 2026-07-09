import { useEffect, useState } from 'react';
import {
    Search, Megaphone, BarChart3, Users, Contact, Plug, Check, LoaderCircle,
} from '../lib/icons';
import Panel, { PanelHeader } from '../components/ui/Panel';
import Tabs from '../components/ui/Tabs';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { workspaceService } from '../services/workspaceService';
import { integrationService } from '../services/integrationService';
import { CONNECTORS } from '../lib/connectors';
import './ProfilePage.css';

const CONNECTOR_ICONS = {
    gsc: Search,
    'meta-ad-library': Megaphone,
    ga4: BarChart3,
    'google-ads': Megaphone,
    'meta-ads': Megaphone,
    hubspot: Users,
    zoho: Users,
    apollo: Contact,
};

// ── Account (name) - keyed on the loaded profile so the input seeds correctly ──
const AccountSection = ({ initialName, email, onSaved }) => {
    const [name, setName] = useState(initialName ?? '');
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');

    const save = async () => {
        setSaving(true);
        setNotice('');
        setError('');
        try {
            await workspaceService.updateProfile({ displayName: name.trim() });
            await onSaved?.();
            setNotice('Saved.');
        } catch (e) {
            setError(e.message || 'Could not save your name.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Panel className="profile__panel">
            <PanelHeader title="Account" meta="Your name appears across KEPLER - the home greeting and menus." />
            <div className="profile__field">
                <label className="profile__label">Display name</label>
                <input
                    className="profile__input"
                    type="text"
                    value={name}
                    placeholder="e.g. Aditya"
                    onChange={(e) => setName(e.target.value)}
                />
            </div>
            <div className="profile__field">
                <label className="profile__label">Email</label>
                <input className="profile__input" type="text" value={email ?? ''} readOnly disabled />
            </div>
            <div className="profile__actions">
                <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                </button>
                {notice && <span className="profile__notice"><Check size={14} strokeWidth={2} /> {notice}</span>}
                {error && <span className="profile__error">{error}</span>}
            </div>
        </Panel>
    );
};

// ── Per-workspace connector configuration ─────────────────────────────────────
const ConnectorsSection = ({ workspaces }) => {
    const [activeWs, setActiveWs] = useState(() => {
        const stored = workspaceService.getActiveWorkspaceId?.();
        if (stored && workspaces.some((w) => String(w.id) === String(stored))) return String(stored);
        return workspaces[0]?.id ? String(workspaces[0].id) : null;
    });
    const [statuses, setStatuses] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    // API-key connect modal.
    const [modalConnector, setModalConnector] = useState(null);
    const [fieldValues, setFieldValues] = useState({});
    const [connecting, setConnecting] = useState(false);
    const [modalError, setModalError] = useState('');

    // Load all connection statuses for the selected workspace (keyed by provider).
    useEffect(() => {
        if (!activeWs) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const map = await integrationService.listStatuses(activeWs);
                if (!cancelled) { setStatuses(map); setLoading(false); }
            } catch {
                if (!cancelled) { setStatuses({}); setLoading(false); }
            }
        })();
        return () => { cancelled = true; };
    }, [activeWs, reloadKey]);

    const reload = () => setReloadKey((k) => k + 1);

    const connectOauth = (connectorId) => {
        try {
            window.location.assign(integrationService.buildAuthUrl(activeWs, connectorId));
        } catch (e) {
            setError(e.message);
        }
    };

    const openApiKeyModal = (connector) => {
        // Seed select fields to their first option so nothing submits blank.
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
            await integrationService.connectApiKey(activeWs, modalConnector.id, fieldValues);
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
            await integrationService.disconnect(activeWs, provider);
            reload();
        } catch (e) {
            setError(e.message || 'Could not disconnect.');
        }
    };

    if (workspaces.length === 0) {
        return (
            <Panel className="profile__panel">
                <PanelHeader title="Connectors" meta="Ground each workspace in real data." />
                <EmptyState message="Create a workspace first, then connect its data sources here." />
            </Panel>
        );
    }

    const wsTabs = workspaces.map((w) => ({ id: String(w.id), label: w.name }));

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
        return <button type="button" className="btn btn-secondary connector-card__btn" onClick={() => connectOauth(c.id)}>Connect</button>;
    };

    return (
        <Panel className="profile__panel">
            <PanelHeader
                title="Connectors"
                meta="Optional - per workspace. Everything works without them; connecting one raises that workspace's quality."
            />
            <Tabs tabs={wsTabs} activeTab={activeWs} onTabChange={setActiveWs} variant="kepler" />
            {error && <p className="profile__error profile__error--block">{error}</p>}
            <div className="connector-grid">
                {CONNECTORS.map((c) => {
                    const Icon = CONNECTOR_ICONS[c.id] ?? Plug;
                    return (
                        <article key={c.id} className={`connector-card ${c.status === 'planned' ? 'connector-card--planned' : ''}`}>
                            <div className="connector-card__head">
                                <span className="connector-card__icon"><Icon size={18} strokeWidth={1.7} /></span>
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

const ProfilePage = () => {
    const { profile, user, refreshProfile } = useAuth();
    const { workspaces } = useWorkspace();

    return (
        <div className="profile">
            <div className="profile__inner">
                <header className="profile__hero">
                    <h1 className="profile__title font-display">Profile &amp; settings</h1>
                    <p className="profile__subtitle">Your account and each workspace's data connectors.</p>
                </header>

                <AccountSection
                    key={profile?.display_name ?? 'no-profile'}
                    initialName={profile?.display_name ?? ''}
                    email={user?.email}
                    onSaved={refreshProfile}
                />

                <ConnectorsSection workspaces={workspaces} />
            </div>
        </div>
    );
};

export default ProfilePage;
