import { TrendUp, TrendDown } from '../../lib/icons';

// Delta chip: ↗/↘ + signed %, green/red. Renders nothing when there's no comparable
// prior period (delta.pct == null) — trends are never fabricated.
const TrendPill = ({ delta }) => {
    if (!delta || delta.pct == null) return null;
    const up = delta.direction === 'up';
    const down = delta.direction === 'down';
    const Icon = up ? TrendUp : down ? TrendDown : null;
    return (
        <span className={`trend-pill ${up ? 'trend-pill--up' : ''} ${down ? 'trend-pill--down' : ''}`}>
            {Icon && <Icon size={12} strokeWidth={2.2} />}
            {delta.pct > 0 ? '+' : ''}{delta.pct}%
        </span>
    );
};

export default TrendPill;
