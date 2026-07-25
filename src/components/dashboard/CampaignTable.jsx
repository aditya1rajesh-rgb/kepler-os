import { useMemo, useState } from 'react';
import { Filter, ArrowUpRight } from '../../lib/icons';
import EmptyState from '../ui/EmptyState';

const CHANNEL_LABEL = {
    'seo-aeo': 'SEO', 'social-media': 'Social', 'ad-campaigns': 'Ads', outreach: 'Outreach',
    email: 'Email', social: 'Social', seo: 'SEO', ads: 'Ads', paid: 'Paid',
};
const channelLabel = (c) => CHANNEL_LABEL[c] ?? (typeof c === 'string' ? c : '');

const num = (v) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('en', { notation: 'compact' }).format(v));
const money = (v) => (v === null || v === undefined || v === 0 ? '—' : `$${new Intl.NumberFormat('en', { notation: 'compact' }).format(v)}`);

const STATUS_FILTERS = ['all', 'active', 'draft', 'completed'];

// Campaign performance table: id · name · channel chips · sessions · conv · revenue.
// Filters (status) + "View all" → Measurement.
const CampaignTable = ({ rows = [], loading, onViewAll }) => {
    const [statusFilter, setStatusFilter] = useState('all');
    const [filterOpen, setFilterOpen] = useState(false);

    const filtered = useMemo(
        () => (statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter)),
        [rows, statusFilter],
    );

    return (
        <div className="db-card db-table">
            <div className="db-card__head">
                <h3 className="db-card__title">Campaign Performance</h3>
                <div className="db-card__head-right">
                    <div className="db-table__filter">
                        <button type="button" className="btn btn-ghost" onClick={() => setFilterOpen((o) => !o)}>
                            <Filter size={14} strokeWidth={1.8} /> Filters{statusFilter !== 'all' ? ` · ${statusFilter}` : ''}
                        </button>
                        {filterOpen && (
                            <div className="db-table__filter-menu">
                                {STATUS_FILTERS.map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        className={`db-table__filter-opt ${s === statusFilter ? 'is-active' : ''}`}
                                        onClick={() => { setStatusFilter(s); setFilterOpen(false); }}
                                    >
                                        {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={onViewAll}>
                        View all <ArrowUpRight size={14} strokeWidth={1.8} />
                    </button>
                </div>
            </div>

            {loading ? (
                <p className="db-table__loading">Loading…</p>
            ) : filtered.length === 0 ? (
                <EmptyState message={rows.length === 0 ? 'No campaigns yet. Create one to see performance here.' : 'No campaigns match this filter.'} />
            ) : (
                <div className="db-table__scroll">
                    <table className="db-table__table">
                        <thead>
                            <tr>
                                <th className="db-table__check-col"><input type="checkbox" aria-label="Select all" disabled /></th>
                                <th>ID</th>
                                <th>Campaign name</th>
                                <th>Channel</th>
                                <th className="db-table__num">Sessions</th>
                                <th className="db-table__num">Conv</th>
                                <th className="db-table__num">Revenue</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r) => (
                                <tr key={r.id}>
                                    <td className="db-table__check-col"><input type="checkbox" aria-label={`Select ${r.title}`} /></td>
                                    <td className="db-table__id">#{String(r.id).slice(0, 6)}</td>
                                    <td className="db-table__name">{r.title}</td>
                                    <td>
                                        <div className="db-table__chips">
                                            {(r.channelMix.length ? r.channelMix.slice(0, 3) : ['—']).map((c, i) => (
                                                <span key={i} className="db-table__chip">{channelLabel(c) || '—'}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="db-table__num">{num(r.sessions)}</td>
                                    <td className="db-table__num">{num(r.conversions)}</td>
                                    <td className="db-table__num">{money(r.revenue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default CampaignTable;
