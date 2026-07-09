import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from '../../lib/icons';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import StatusPill from '../../components/ui/StatusPill';
import EmptyState from '../../components/ui/EmptyState';
import { contentService } from '../../services/contentService';
import { workspacePath } from '../../constants/routes';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import './Library.css';

const TYPE_META = {
    seo: { label: 'SEO & AEO', module: 'seo-aeo' },
    ads: { label: 'Ad Campaigns', module: 'ad-campaigns' },
    outreach: { label: 'Outreach', module: 'outreach' },
    social: { label: 'Social Media', module: 'social-media' },
};

const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'seo', label: 'SEO & AEO' },
    { id: 'ads', label: 'Ad Campaigns' },
    { id: 'outreach', label: 'Outreach' },
    { id: 'social', label: 'Social Media' },
];

const Library = ({ workspaceId }) => {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');

    useEffect(() => {
        let mounted = true;
        contentService
            .getAllContent(workspaceId)
            .then((rows) => {
                if (mounted) setItems(rows);
            })
            .catch(() => {
                if (mounted) setItems([]);
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, [workspaceId]);

    const counts = useMemo(() => {
        const c = { all: items.length, seo: 0, ads: 0, outreach: 0, social: 0 };
        items.forEach((i) => {
            if (c[i.type] !== undefined) c[i.type] += 1;
        });
        return c;
    }, [items]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter((i) => {
            if (filter !== 'all' && i.type !== filter) return false;
            if (q && !`${i.title} ${i.targetKeyword}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [items, filter, query]);

    const openItem = (item) => {
        const meta = TYPE_META[item.type];
        navigate(workspacePath(workspaceId, meta?.module ?? 'overview'));
    };

    return (
        <div className="library module-kepler">
            <Panel>
                <PanelHeader
                    title="Content library"
                    meta="Everything you've generated across every module, in one place."
                />

                <div className="library__toolbar">
                    <div className="library__filters">
                        {FILTERS.map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                className={`library__filter ${filter === f.id ? 'is-active' : ''}`}
                                onClick={() => setFilter(f.id)}
                            >
                                {f.label}
                                <span className="library__filter-count">{counts[f.id] ?? 0}</span>
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        className="library__search"
                        placeholder="Search content…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>

                {loading ? (
                    <EmptyState loading message="Loading library…" />
                ) : visible.length === 0 ? (
                    <EmptyState
                        message={
                            items.length === 0
                                ? 'No content yet - generate assets in any module and they’ll collect here.'
                                : 'No items match your filter.'
                        }
                    />
                ) : (
                    <ul className="library__list">
                        {visible.map((item) => {
                            const meta = TYPE_META[item.type] ?? { label: item.type };
                            return (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        className="library__row"
                                        onClick={() => openItem(item)}
                                    >
                                        <span className={`library__type library__type--${item.type}`}>
                                            {meta.label}
                                        </span>
                                        <span className="library__row-main">
                                            <span className="library__row-title">
                                                {item.title || item.targetKeyword || 'Untitled'}
                                            </span>
                                            {item.targetKeyword ? (
                                                <span className="library__row-sub">{item.targetKeyword}</span>
                                            ) : null}
                                        </span>
                                        <StatusPill status={item.status} className="library__status" />
                                        <span className="library__row-time">
                                            {formatRelativeTime(item.createdAt)}
                                        </span>
                                        <ArrowRight
                                            size={15}
                                            strokeWidth={1.6}
                                            className="library__row-go"
                                        />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Panel>
        </div>
    );
};

export default Library;
