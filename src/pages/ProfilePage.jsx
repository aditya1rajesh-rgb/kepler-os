import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plug, ArrowRight } from '../lib/icons';
import Panel, { PanelHeader } from '../components/ui/Panel';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useActiveWorkspaceId } from '../hooks/useActiveWorkspaceId';
import { workspaceService } from '../services/workspaceService';
import { workspacePath } from '../constants/routes';
import './ProfilePage.css';

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
            <PanelHeader title="Account" meta="Your name appears across Kepler — the home greeting and menus." />
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

const ProfilePage = () => {
    const { profile, user, refreshProfile } = useAuth();
    const { workspaces } = useWorkspace();
    const workspaceId = useActiveWorkspaceId();
    const effectiveWorkspaceId = workspaceId ?? (workspaces[0]?.id ? String(workspaces[0].id) : null);

    return (
        <div className="profile">
            <div className="profile__inner">
                <header className="profile__hero">
                    <h1 className="profile__title font-display">Settings</h1>
                    <p className="profile__subtitle">Your account across Kepler.</p>
                </header>

                <AccountSection
                    key={profile?.display_name ?? 'no-profile'}
                    initialName={profile?.display_name ?? ''}
                    email={user?.email}
                    onSaved={refreshProfile}
                />

                <Panel className="profile__panel profile__pointer">
                    <div className="profile__pointer-icon"><Plug size={18} strokeWidth={1.7} /></div>
                    <div className="profile__pointer-body">
                        <h3 className="profile__pointer-title">Looking for connectors?</h3>
                        <p className="profile__pointer-text">Data sources moved to Integrations — they're scoped per workspace now, in the workspace sidebar.</p>
                    </div>
                    {effectiveWorkspaceId && (
                        <Link to={workspacePath(effectiveWorkspaceId, 'integrations')} className="btn btn-secondary profile__pointer-cta">
                            Open Integrations
                            <ArrowRight size={15} strokeWidth={1.8} />
                        </Link>
                    )}
                </Panel>
            </div>
        </div>
    );
};

export default ProfilePage;
