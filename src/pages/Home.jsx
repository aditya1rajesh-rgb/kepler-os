import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Sparkles,
    CircleCheck,
    LayoutGrid,
    ArrowRight,
    Trash2,
    Search,
    TrendingUp,
} from '../lib/icons';
import Modal from '../components/ui/Modal';
import CountUp from '../components/ui/CountUp';
import MiniBarChart from '../components/ui/MiniBarChart';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { workspacePath } from '../constants/routes';
import { workspaceService } from '../services/workspaceService';
import { contentService } from '../services/contentService';
import { brandService } from '../services/brandService';
import { formatRelativeTime } from '../lib/formatRelativeTime';
import './Home.css';

const MAX_WORKSPACES = 10;

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

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

const Home = () => {
    const navigate = useNavigate();
    const { workspaces, loading, error: workspaceError, refreshWorkspaces } = useWorkspace();
    const { displayName } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [userContent, setUserContent] = useState([]);
    const [wsLogos, setWsLogos] = useState({});
    const [pendingDelete, setPendingDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    useEffect(() => {
        let mounted = true;
        contentService
            .getUserContent({ limit: 200 })
            .then((items) => {
                if (mounted) setUserContent(items);
            })
            .catch((err) => {
                console.error('Failed to load content overview:', err);
                if (mounted) setUserContent([]);
            });
        return () => {
            mounted = false;
        };
    }, [workspaces.length]);

    useEffect(() => {
        let mounted = true;
        brandService
            .getWorkspaceLogos()
            .then((map) => {
                if (mounted) setWsLogos(map);
            })
            .catch(() => {});
        return () => {
            mounted = false;
        };
    }, [workspaces.length]);

    const workspaceById = useMemo(() => {
        const map = {};
        workspaces.forEach((ws) => {
            map[String(ws.id)] = ws;
        });
        return map;
    }, [workspaces]);

    const countByWorkspace = useMemo(() => {
        const map = {};
        userContent.forEach((item) => {
            const id = String(item.workspaceId);
            map[id] = (map[id] ?? 0) + 1;
        });
        return map;
    }, [userContent]);

    const completedCount = useMemo(
        () => userContent.filter((i) => i.status === 'completed').length,
        [userContent]
    );

    const monthly = useMemo(() => {
        const now = new Date();
        const buckets = [];
        const index = {};
        for (let i = 6; i >= 0; i -= 1) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            index[key] = buckets.length;
            buckets.push({ key, label: d.toLocaleString(undefined, { month: 'short' }), value: 0 });
        }
        userContent.forEach((item) => {
            if (!item.createdAt) return;
            const d = new Date(item.createdAt);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (index[key] !== undefined) buckets[index[key]].value += 1;
        });
        return buckets;
    }, [userContent]);

    const chartTotal = useMemo(() => monthly.reduce((s, b) => s + b.value, 0), [monthly]);
    const chartHighlight = useMemo(() => {
        let mi = -1;
        let mv = 0;
        monthly.forEach((b, i) => {
            if (b.value > mv) {
                mv = b.value;
                mi = i;
            }
        });
        return mi;
    }, [monthly]);

    const activity = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return userContent
            .filter((item) => {
                if (!q) return true;
                const ws = workspaceById[String(item.workspaceId)];
                return `${item.title} ${TYPE_LABEL[item.type] ?? item.type} ${ws?.name ?? ''}`
                    .toLowerCase()
                    .includes(q);
            })
            .slice(0, 12);
    }, [userContent, searchQuery, workspaceById]);

    const slotsLeft = MAX_WORKSPACES - workspaces.length;
    const isLimitReached = workspaces.length >= MAX_WORKSPACES;

    const primaryWorkspaceId = useMemo(() => {
        if (workspaces.length === 0) return null;
        const stored = workspaceService.getActiveWorkspaceId();
        const match = stored && workspaces.find((w) => String(w.id) === String(stored));
        return String((match || workspaces[0]).id);
    }, [workspaces]);

    const openWorkspace = async (id) => {
        await workspaceService.setActiveWorkspaceId(id);
        navigate(workspacePath(id));
    };

    const resumeWorkspace = () => {
        if (primaryWorkspaceId) navigate(workspacePath(primaryWorkspaceId));
    };

    const openActivity = (item) =>
        navigate(workspacePath(String(item.workspaceId), TYPE_MODULE[item.type] ?? 'overview'));

    const requestDelete = (e, ws) => {
        e.stopPropagation();
        setDeleteError('');
        setPendingDelete(ws);
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        setDeleteError('');
        try {
            await workspaceService.deleteWorkspace(pendingDelete.id);
            await refreshWorkspaces();
            setPendingDelete(null);
        } catch (err) {
            console.error('Delete workspace failed:', err);
            setDeleteError('Could not delete the workspace. Please try again.');
        } finally {
            setDeleting(false);
        }
    };

    const kpis = [
        {
            key: 'assets',
            hero: true,
            icon: Sparkles,
            label: 'Assets created',
            value: userContent.length,
            sub: 'across all your brands',
            footLabel: 'Resume workspace',
            onFoot: resumeWorkspace,
        },
        {
            key: 'completed',
            icon: CircleCheck,
            label: 'Completed',
            value: completedCount,
            sub: 'ready to use',
            footLabel: 'View library',
            onFoot: () => (primaryWorkspaceId ? navigate(workspacePath(primaryWorkspaceId, 'library')) : null),
        },
        {
            key: 'workspaces',
            icon: LayoutGrid,
            label: 'Workspaces',
            value: workspaces.length,
            sub: `${slotsLeft} slot${slotsLeft === 1 ? '' : 's'} left`,
            footLabel: 'New workspace',
            onFoot: () => (isLimitReached ? null : navigate('/onboarding?new=1')),
        },
    ];

    return (
        <div className="dash">
            <div className="dash__inner">
                <header className="home-hero">
                    <div className="home-hero__text">
                        <p className="home-hero__eyebrow">KEPLER OS Dashboard</p>
                        <h1 className="home-hero__title font-display">
                            {getGreeting()}, {displayName}
                        </h1>
                        <p className="home-hero__subtitle">
                            {loading
                                ? 'Loading workspaces…'
                                : workspaceError
                                    ? 'Could not load workspaces. Try refreshing the page.'
                                    : workspaces.length === 0
                                        ? 'No workspaces yet. Create one to begin brand intelligence.'
                                        : `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} · ${userContent.length} asset${userContent.length === 1 ? '' : 's'} created.`}
                        </p>
                    </div>
                    <div className="home-hero__actions">
                        {workspaces.length > 0 && (
                            <button type="button" className="btn btn-secondary home-hero__btn" onClick={resumeWorkspace}>
                                <Sparkles size={16} strokeWidth={1.7} />
                                Resume workspace
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn btn-primary home-hero__btn"
                            disabled={isLimitReached}
                            title={isLimitReached ? 'Workspace limit reached' : ''}
                            onClick={() => navigate('/onboarding?new=1')}
                        >
                            <Plus size={16} strokeWidth={2} />
                            New workspace
                        </button>
                    </div>
                </header>

                {!loading && workspaces.length === 0 ? (
                    <p className="home__empty">
                        Create your first workspace to unlock modules and brand intelligence.
                    </p>
                ) : (
                    <>
                        <h2 className="dash-section">Overview</h2>

                        <div className="kpi-row">
                            {kpis.map((kpi, i) => {
                                const Icon = kpi.icon;
                                return (
                                    <article
                                        key={kpi.key}
                                        className={`pcard kpi-card reveal ${kpi.hero ? 'kpi-card--hero' : ''}`}
                                        style={{ '--i': i }}
                                    >
                                        <div className="kpi-card__top">
                                            <span className="kpi-card__icon">
                                                <Icon size={19} strokeWidth={1.7} />
                                            </span>
                                        </div>
                                        <div className="kpi-card__body">
                                            <span className="kpi-card__label">{kpi.label}</span>
                                            <CountUp value={kpi.value} className="kpi-card__value" />
                                            <span className="kpi-card__sub">{kpi.sub}</span>
                                        </div>
                                        {kpi.footLabel && (
                                            <button type="button" className="kpi-card__foot" onClick={kpi.onFoot}>
                                                <span>{kpi.footLabel}</span>
                                                <ArrowRight size={15} strokeWidth={1.8} />
                                            </button>
                                        )}
                                    </article>
                                );
                            })}
                        </div>

                        <div className="dash-grid">
                            <section className="pcard dash-panel reveal" style={{ '--i': 3 }}>
                                <div className="dash-panel__head">
                                    <div>
                                        <p className="dash-panel__title">Workspaces</p>
                                        <p className="dash-panel__meta">
                                            {workspaces.length} of {MAX_WORKSPACES} · your brands
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="dash-chip-btn"
                                        onClick={() => navigate('/onboarding?new=1')}
                                        disabled={isLimitReached}
                                    >
                                        <Plus size={15} strokeWidth={2} />
                                        New
                                    </button>
                                </div>
                                <ul className="ws-list">
                                    {workspaces.map((ws) => {
                                        const assets = countByWorkspace[String(ws.id)] ?? 0;
                                        return (
                                            <li key={ws.id}>
                                                <button
                                                    type="button"
                                                    className="ws-row"
                                                    onClick={() => openWorkspace(ws.id)}
                                                >
                                                    {wsLogos[String(ws.id)] ? (
                                                        <span className="ws-row__avatar ws-row__avatar--img">
                                                            <img
                                                                src={`data:image/svg+xml;utf8,${encodeURIComponent(wsLogos[String(ws.id)])}`}
                                                                alt={ws.name}
                                                                className="ws-row__avatar-img"
                                                            />
                                                        </span>
                                                    ) : (
                                                        <span
                                                            className="ws-row__avatar"
                                                            style={{ background: ws.logoColor || '#4a6cf7' }}
                                                        >
                                                            {ws.name.charAt(0).toUpperCase()}
                                                        </span>
                                                    )}
                                                    <span className="ws-row__body">
                                                        <span className="ws-row__name">{ws.name}</span>
                                                        <span className="ws-row__meta">
                                                            {ws.url || ws.tagline || 'Workspace'}
                                                        </span>
                                                    </span>
                                                    <span className="ws-row__right">
                                                        <span className="ws-row__count">
                                                            {assets} asset{assets === 1 ? '' : 's'}
                                                        </span>
                                                        <span className="ws-row__bi">
                                                            {ws.brandIntelStatus ?? 0}% brand
                                                        </span>
                                                    </span>
                                                    <span
                                                        className="ws-row__delete"
                                                        role="button"
                                                        tabIndex={0}
                                                        aria-label={`Delete ${ws.name}`}
                                                        onClick={(e) => requestDelete(e, ws)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') requestDelete(e, ws);
                                                        }}
                                                    >
                                                        <Trash2 size={15} strokeWidth={1.7} />
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>

                            <section className="pcard dash-panel reveal" style={{ '--i': 4 }}>
                                <div className="dash-panel__head">
                                    <div>
                                        <p className="dash-panel__title">Content output</p>
                                        <p className="dash-panel__meta">Assets created · last 7 months</p>
                                    </div>
                                    <span className="dash-chip-btn" aria-hidden="true">Monthly</span>
                                </div>
                                <CountUp value={chartTotal} className="chart-total" />
                                <div className="chart-wrap">
                                    <MiniBarChart data={monthly} highlightIndex={chartHighlight} />
                                </div>
                                <p className="chart-note">
                                    <TrendingUp size={13} strokeWidth={1.8} />
                                    Workspace optimization scoring - coming soon
                                </p>
                            </section>
                        </div>

                        <section className="pcard activity-panel reveal" style={{ '--i': 5 }}>
                            <div className="dash-panel__head">
                                <div>
                                    <p className="dash-panel__title">Recent activity</p>
                                    <p className="dash-panel__meta">Latest across every workspace</p>
                                </div>
                                <span className="activity-search-wrap">
                                    <Search className="activity-search-icon" size={15} strokeWidth={1.8} />
                                    <input
                                        type="text"
                                        className="activity-search"
                                        placeholder="Search activity…"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </span>
                            </div>

                            {activity.length === 0 ? (
                                <p className="home__empty" style={{ padding: '18px 4px' }}>
                                    {userContent.length === 0
                                        ? 'No content generated yet - your assets will appear here.'
                                        : 'No activity matches your search.'}
                                </p>
                            ) : (
                                <table className="activity-table">
                                    <thead>
                                        <tr>
                                            <th>Activity</th>
                                            <th>Module</th>
                                            <th>Workspace</th>
                                            <th>When</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activity.map((item) => {
                                            const ws = workspaceById[String(item.workspaceId)];
                                            return (
                                                <tr key={item.id} onClick={() => openActivity(item)}>
                                                    <td>
                                                        <span className="activity-table__title">
                                                            <span
                                                                className="activity-table__dot"
                                                                style={{ background: ws?.logoColor || '#4a6cf7' }}
                                                            />
                                                            <span className="activity-table__name">
                                                                {item.title || 'Untitled'}
                                                            </span>
                                                        </span>
                                                    </td>
                                                    <td className="activity-table__muted">
                                                        {TYPE_LABEL[item.type] ?? item.type}
                                                    </td>
                                                    <td className="activity-table__muted">{ws?.name ?? 'Workspace'}</td>
                                                    <td className="activity-table__muted">
                                                        {formatRelativeTime(item.createdAt)}
                                                    </td>
                                                    <td>
                                                        <span
                                                            className={`activity-status activity-status--${item.status}`}
                                                        >
                                                            {item.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </section>
                    </>
                )}
            </div>

            <Modal
                isOpen={Boolean(pendingDelete)}
                onClose={() => {
                    if (!deleting) setPendingDelete(null);
                }}
                title="Delete workspace?"
                footer={
                    <>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setPendingDelete(null)}
                            disabled={deleting}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn btn-destructive"
                            onClick={confirmDelete}
                            disabled={deleting}
                        >
                            {deleting ? 'Deleting…' : 'Delete permanently'}
                        </button>
                    </>
                }
            >
                <p>
                    This permanently removes <strong>{pendingDelete?.name}</strong> - its brand data,
                    generated content, and files. This cannot be undone.
                </p>
                {deleteError && <p className="home-delete-error">{deleteError}</p>}
            </Modal>
        </div>
    );
};

export default Home;
