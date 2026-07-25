import {
    Search, Sparkles, CircleCheck, Target, Send, CalendarClock, Plug, AtSign, TrendingUp, Telescope,
} from '../../lib/icons';
import EmptyState from '../ui/EmptyState';
import SegmentedControl from './SegmentedControl';
import { formatRelativeTime } from '../../lib/formatRelativeTime';

const KIND_ICON = {
    'content.created': Sparkles,
    'content.completed': CircleCheck,
    'campaign.created': Target,
    'campaign.step_done': CircleCheck,
    'campaign.completed': Target,
    'sequence.approved': Send,
    'sequence.enrolled': Send,
    'outreach.reply': Send,
    'outreach.meeting': CalendarClock,
    'connector.connected': Plug,
    'social.published': AtSign,
    'metrics.pulled': TrendingUp,
    'aeo.scanned': Telescope,
};

// Live activity feed powered by workspace_events. Today/Week toggle + text filter.
const LatestUpdates = ({ events, loading, range, onRangeChange, query, onQueryChange }) => (
    <div className="db-card db-updates">
        <div className="db-card__head">
            <h3 className="db-card__title">Latest Updates</h3>
            <SegmentedControl size="sm" options={['Today', 'Week']} value={range} onChange={onRangeChange} />
        </div>

        <div className="db-updates__search">
            <Search size={15} strokeWidth={1.7} />
            <input
                className="db-updates__input"
                placeholder="Search activities"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
            />
        </div>

        <div className="db-updates__divider" />

        {loading ? (
            <p className="db-updates__loading">Loading…</p>
        ) : events.length === 0 ? (
            <EmptyState message={query ? 'No matching activity.' : range === 'today' ? 'Nothing today — switch to Week for more.' : 'Actions across Kepler show up here. Generate content or launch a campaign to get started.'} />
        ) : (
            <ul className="db-updates__list">
                {events.map((ev) => {
                    const Icon = KIND_ICON[ev.kind] ?? Sparkles;
                    return (
                        <li key={ev.id} className="db-updates__row">
                            <span className="db-updates__icon"><Icon size={16} strokeWidth={1.7} /></span>
                            <div className="db-updates__body">
                                <span className="db-updates__title">{ev.title || ev.kind}</span>
                                <span className="db-updates__time">{formatRelativeTime(ev.createdAt)}</span>
                            </div>
                        </li>
                    );
                })}
            </ul>
        )}
    </div>
);

export default LatestUpdates;
