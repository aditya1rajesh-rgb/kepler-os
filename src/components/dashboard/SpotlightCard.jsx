import { ArrowUpRight } from '../../lib/icons';

// The gradient spotlight card (reference's "Unlock Premium" slot), repurposed as a
// dynamic next-best-action. Content comes from pickSpotlight(); the corner button and
// full-card click both fire the action.
const SpotlightCard = ({ icon: Icon, title, body, progress, ctaLabel, onCta }) => (
    <div className="db-card db-spotlight" role="button" tabIndex={0} onClick={onCta}
        onKeyDown={(e) => { if (e.key === 'Enter') onCta?.(); }}>
        <button type="button" className="db-spotlight__corner" onClick={(e) => { e.stopPropagation(); onCta?.(); }} aria-label={ctaLabel}>
            <ArrowUpRight size={16} strokeWidth={1.8} />
        </button>

        <div className="db-spotlight__icon">{Icon && <Icon size={22} strokeWidth={1.7} />}</div>
        <h3 className="db-spotlight__title">{title}</h3>
        {body && <p className="db-spotlight__body">{body}</p>}

        {typeof progress === 'number' && (
            <div className="db-spotlight__progress">
                <span className="db-spotlight__progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
        )}

        {ctaLabel && <span className="db-spotlight__cta">{ctaLabel}</span>}
    </div>
);

export default SpotlightCard;
