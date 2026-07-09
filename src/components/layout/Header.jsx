import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, HelpCircle, LogOut, Settings } from '../../lib/icons';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { workspacePath } from '../../constants/routes';
import { contentService } from '../../services/contentService';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import './Header.css';

const TYPE_LABEL = {
    seo: 'SEO & AEO',
    ads: 'Ad Campaigns',
    outreach: 'Outreach',
    social: 'Social Media',
};

const TYPE_MODULE = {
    seo: 'seo-aeo',
    ads: 'ad-campaigns',
    outreach: 'outreach',
    social: 'social-media',
};

const GETTING_STARTED = [
    { title: 'Build brand intelligence', desc: 'Add your site or a file so every module writes on-brand.' },
    { title: 'Confirm an ICP', desc: 'Define who you sell to - it unlocks SEO, Ads and Outreach.' },
    { title: 'Generate & rate', desc: 'Create assets in any module; rate them so results sharpen over time.' },
];

const Header = () => {
    const navigate = useNavigate();
    const { displayName, initials, user, signOut } = useAuth();
    const { workspaces } = useWorkspace();
    const [panel, setPanel] = useState(null); // 'help' | 'bell' | 'user' | null
    const [query, setQuery] = useState('');
    const [content, setContent] = useState([]);
    const [contentLoaded, setContentLoaded] = useState(false);
    const rootRef = useRef(null);

    // Lazily load the searchable content set the first time the user engages search/activity.
    const ensureContent = () => {
        if (contentLoaded) return;
        setContentLoaded(true);
        contentService
            .getUserContent({ limit: 200 })
            .then(setContent)
            .catch((err) => {
                console.error('Header content load failed:', err);
                setContent([]);
            });
    };

    useEffect(() => {
        const onDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) {
                setPanel(null);
                setQuery('');
            }
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setPanel(null);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, []);

    const wsById = useMemo(() => {
        const map = {};
        workspaces.forEach((w) => {
            map[String(w.id)] = w;
        });
        return map;
    }, [workspaces]);

    const q = query.trim().toLowerCase();

    const searchResults = useMemo(() => {
        if (!q) return { workspaces: [], content: [] };
        return {
            workspaces: workspaces
                .filter((w) => w.name.toLowerCase().includes(q) || (w.url ?? '').toLowerCase().includes(q))
                .slice(0, 4),
            content: content.filter((c) => (c.title ?? '').toLowerCase().includes(q)).slice(0, 6),
        };
    }, [q, workspaces, content]);

    const recent = useMemo(() => content.slice(0, 6), [content]);

    const openWorkspace = (id) => {
        setPanel(null);
        setQuery('');
        navigate(workspacePath(id));
    };

    const openContent = (item) => {
        setPanel(null);
        setQuery('');
        navigate(workspacePath(String(item.workspaceId), TYPE_MODULE[item.type] ?? 'overview'));
    };

    const toggleChip = (name) => {
        setQuery('');
        setPanel((current) => (current === name ? null : name));
    };

    const handleSignOut = async () => {
        await signOut();
        navigate('/login', { replace: true });
    };

    const hasSearch = q.length > 0;
    const noResults =
        hasSearch && searchResults.workspaces.length === 0 && searchResults.content.length === 0;

    return (
        <header className="header kepler-shell" ref={rootRef}>
            <div className="header__search">
                <Search className="header__search-icon" size={16} strokeWidth={1.6} />
                <input
                    type="search"
                    className="header__search-input"
                    placeholder="Search workspaces & content…"
                    value={query}
                    onFocus={ensureContent}
                    onChange={(e) => {
                        setPanel(null);
                        setQuery(e.target.value);
                    }}
                />
                {hasSearch && (
                    <div className="header__panel header__search-panel">
                        {noResults ? (
                            <p className="header__panel-empty">No matches for “{query}”.</p>
                        ) : (
                            <>
                                {searchResults.workspaces.length > 0 && (
                                    <div className="header__panel-group">
                                        <p className="header__panel-label">Workspaces</p>
                                        {searchResults.workspaces.map((w) => (
                                            <button
                                                key={w.id}
                                                type="button"
                                                className="header__result"
                                                onClick={() => openWorkspace(w.id)}
                                            >
                                                <span className="header__result-title">{w.name}</span>
                                                <span className="header__result-meta">{w.url || 'workspace'}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {searchResults.content.length > 0 && (
                                    <div className="header__panel-group">
                                        <p className="header__panel-label">Content</p>
                                        {searchResults.content.map((c) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                className="header__result"
                                                onClick={() => openContent(c)}
                                            >
                                                <span className="header__result-title">{c.title || 'Untitled'}</span>
                                                <span className="header__result-meta">
                                                    {TYPE_LABEL[c.type] ?? c.type} ·{' '}
                                                    {wsById[String(c.workspaceId)]?.name ?? 'Workspace'}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="header__actions">
                <div className="header__chip-wrap">
                    <button
                        type="button"
                        className={`header__chip-btn ${panel === 'help' ? 'is-active' : ''}`}
                        aria-label="Help & getting started"
                        onClick={() => toggleChip('help')}
                    >
                        <HelpCircle size={18} strokeWidth={1.6} />
                    </button>
                    {panel === 'help' && (
                        <div className="header__panel header__panel--right">
                            <p className="header__panel-label">Getting started</p>
                            <ol className="header__help-list">
                                {GETTING_STARTED.map((step, index) => (
                                    <li key={step.title} className="header__help-item">
                                        <span className="header__help-num">{index + 1}</span>
                                        <span>
                                            <span className="header__help-title">{step.title}</span>
                                            <span className="header__help-desc">{step.desc}</span>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                </div>

                <div className="header__chip-wrap">
                    <button
                        type="button"
                        className={`header__chip-btn ${panel === 'bell' ? 'is-active' : ''}`}
                        aria-label="Recent activity"
                        onClick={() => {
                            ensureContent();
                            toggleChip('bell');
                        }}
                    >
                        <Bell size={18} strokeWidth={1.6} />
                    </button>
                    {panel === 'bell' && (
                        <div className="header__panel header__panel--right">
                            <p className="header__panel-label">Recent activity</p>
                            {recent.length === 0 ? (
                                <p className="header__panel-empty">
                                    {contentLoaded ? 'No content generated yet.' : 'Loading…'}
                                </p>
                            ) : (
                                <div className="header__panel-group">
                                    {recent.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            className="header__result"
                                            onClick={() => openContent(c)}
                                        >
                                            <span className="header__result-title">{c.title || 'Untitled'}</span>
                                            <span className="header__result-meta">
                                                {TYPE_LABEL[c.type] ?? c.type} ·{' '}
                                                {wsById[String(c.workspaceId)]?.name ?? 'Workspace'} ·{' '}
                                                {formatRelativeTime(c.createdAt)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="header__divider" />

                <div className="header__chip-wrap">
                    <button
                        type="button"
                        className="header__user-chip"
                        aria-label="Account menu"
                        onClick={() => toggleChip('user')}
                    >
                        <span className="header__user-avatar font-heading">{initials}</span>
                        <span className="header__user-name">{displayName}</span>
                    </button>
                    {panel === 'user' && (
                        <div className="header__panel header__panel--right header__user-menu">
                            <div className="header__user-info">
                                <span className="header__user-info-name">{displayName}</span>
                                {user?.email && <span className="header__user-info-email">{user.email}</span>}
                            </div>
                            <button
                                type="button"
                                className="header__menu-item"
                                onClick={() => { setPanel(null); navigate('/profile'); }}
                            >
                                <Settings size={15} strokeWidth={1.7} />
                                Profile &amp; settings
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
