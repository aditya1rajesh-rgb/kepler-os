import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, LogOut, Settings, HelpCircle, List } from '../../lib/icons';
import { useAuth } from '../../context/AuthContext';
import { useActiveWorkspaceId } from '../../hooks/useActiveWorkspaceId';
import { eventService } from '../../services/eventService';
import { clientState } from '../../lib/clientState';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { usePageTitle } from '../../hooks/usePageTitle';
import './Header.css';

const Header = ({ onOpenMobileNav }) => {
    const navigate = useNavigate();
    const { displayName, initials, user, signOut } = useAuth();
    const workspaceId = useActiveWorkspaceId();
    const { crumb, title } = usePageTitle();
    const [panel, setPanel] = useState(null); // 'bell' | 'user' | null
    const [events, setEvents] = useState([]);
    const [eventsLoaded, setEventsLoaded] = useState(false);
    const [latestAt, setLatestAt] = useState(null);
    const [hasUnread, setHasUnread] = useState(false);

    // Unread dot: is the newest workspace event newer than the read cursor?
    useEffect(() => {
        if (!workspaceId) { setHasUnread(false); return; }
        let cancelled = false;
        eventService.latestAt(workspaceId)
            .then((iso) => {
                if (cancelled || !iso) return;
                setLatestAt(iso);
                const cursor = clientState.getEventsReadAt(workspaceId);
                setHasUnread(!cursor || iso > cursor);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [workspaceId]);

    useEffect(() => {
        const onDown = (e) => {
            if (!e.target.closest?.('.header__chip-wrap')) setPanel(null);
        };
        const onKey = (e) => { if (e.key === 'Escape') setPanel(null); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, []);

    const openBell = () => {
        if (panel === 'bell') { setPanel(null); return; }
        setPanel('bell');
        if (workspaceId && !eventsLoaded) {
            setEventsLoaded(true);
            eventService.list(workspaceId, { limit: 12 }).then(setEvents).catch(() => setEvents([]));
        }
        // Mark read.
        if (workspaceId && latestAt) {
            clientState.setEventsReadAt(workspaceId, latestAt);
            setHasUnread(false);
        }
    };

    const handleSignOut = async () => {
        await signOut();
        navigate('/login', { replace: true });
    };

    return (
        <header className="header kepler-shell">
            <button type="button" className="header__mobile-nav" onClick={onOpenMobileNav} aria-label="Open navigation">
                <List size={20} strokeWidth={1.7} />
            </button>
            <div className="header__title-block">
                {crumb && <span className="header__crumb">{crumb}</span>}
                <h1 className="header__title font-section">{title}</h1>
            </div>

            <div className="header__actions">
                <div className="header__chip-wrap">
                    <button
                        type="button"
                        className={`header__chip-btn ${panel === 'bell' ? 'is-active' : ''}`}
                        aria-label="Recent activity"
                        onClick={openBell}
                    >
                        <Bell size={18} strokeWidth={1.6} />
                        {hasUnread && <span className="header__chip-dot" aria-hidden="true" />}
                    </button>
                    {panel === 'bell' && (
                        <div className="header__panel header__panel--right">
                            <p className="header__panel-label">Recent activity</p>
                            {!workspaceId ? (
                                <p className="header__panel-empty">Open a workspace to see its activity.</p>
                            ) : !eventsLoaded ? (
                                <p className="header__panel-empty">Loading…</p>
                            ) : events.length === 0 ? (
                                <p className="header__panel-empty">No activity yet.</p>
                            ) : (
                                <div className="header__panel-group">
                                    {events.map((ev) => (
                                        <div key={ev.id} className="header__result header__result--static">
                                            <span className="header__result-title">{ev.title || ev.kind}</span>
                                            <span className="header__result-meta">{formatRelativeTime(ev.createdAt)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="header__chip-wrap">
                    <button
                        type="button"
                        className="header__user-chip"
                        aria-label="Account menu"
                        onClick={() => setPanel(panel === 'user' ? null : 'user')}
                    >
                        <span className="header__user-avatar font-heading">{initials}</span>
                    </button>
                    {panel === 'user' && (
                        <div className="header__panel header__panel--right header__user-menu">
                            <div className="header__user-info">
                                <span className="header__user-info-name">{displayName}</span>
                                {user?.email && <span className="header__user-info-email">{user.email}</span>}
                            </div>
                            <button type="button" className="header__menu-item" onClick={() => { setPanel(null); navigate('/profile'); }}>
                                <Settings size={15} strokeWidth={1.7} />
                                Settings
                            </button>
                            <button type="button" className="header__menu-item" onClick={() => { setPanel(null); navigate('/help'); }}>
                                <HelpCircle size={15} strokeWidth={1.7} />
                                Help Center
                            </button>
                            <button type="button" className="header__menu-item" onClick={handleSignOut}>
                                <LogOut size={15} strokeWidth={1.7} />
                                Sign out
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
