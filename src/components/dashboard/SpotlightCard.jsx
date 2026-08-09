import { ArrowUpRight } from '../../lib/icons';

// The next-best-action, as a single bar above the dashboard.
//
// v3 rendered this as the fourth tile in the KPI row: a full-height saturated
// gradient slab with a radial sheen, which made a low-stakes nudge ("your brand
// profile is 100% complete") the loudest object on the screen — and gave a call
// to action the same visual weight as a measured metric.
//
// It is now one row: still the first thing you read, still one click, but it
// reads as guidance rather than as data.
const SpotlightCard = ({ icon: Icon, title, body, progress, ctaLabel, onCta }) => (
    <button type="button" className="db-spotlight" onClick={onCta}>
        {Icon && (
            <span className="db-spotlight__icon">
                <Icon size={16} strokeWidth={1.7} />
            </span>
        )}

        <span className="db-spotlight__text">
            <span className="db-spotlight__title">{title}</span>
            {body && <span className="db-spotlight__body">{body}</span>}
        </span>

        {typeof progress === 'number' && (
            <span className="db-spotlight__progress">
                <span
                    className="db-spotlight__progress-fill"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                />
            </span>
        )}

        {ctaLabel && <span className="db-spotlight__cta">{ctaLabel}</span>}
        <ArrowUpRight size={14} strokeWidth={1.8} className="db-spotlight__go" />
    </button>
);

export default SpotlightCard;
