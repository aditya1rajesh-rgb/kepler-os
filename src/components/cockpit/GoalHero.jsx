import { MEASURES, describeBasis } from '../../lib/goalFeasibility';
import Sparkline from './Sparkline';

// Zone 1 — the hero. Dominant, above the fold, and the only thing on this screen
// allowed to be large.
//
// It carries progress, the forecast verdict, THE GAP IN REAL UNITS and days
// remaining. "80% there" is a comfort; "2,400 sessions short with 52 days left"
// is a decision. Every number can be null, and null renders as "we cannot say
// yet" rather than zero — a zero forecast is a claim about the business.
//
// WHAT MOVED. The roadmap puts E7's scheduled detectors here, attached to the
// goal rather than in a separate activity feed, because movement you cannot act
// on is filler while the same movement against a target is direction. E7 does
// not exist yet, so this shows the honest half we already have — the change
// between the last two readings of the goal's own measure — and says plainly
// that the reason behind the change is not being computed yet. An empty frame
// promising insight later would be worse than a small true one.

const VERDICT = {
    'on-track': { label: 'On track', tone: 'ok' },
    'at-risk': { label: 'At risk', tone: 'warn' },
    'off-pace': { label: 'Behind', tone: 'bad' },
    unknown: { label: 'Not enough data', tone: 'muted' },
};

const fmt = (n, unit) => {
    if (n === null || n === undefined) return '—';
    const s = new Intl.NumberFormat().format(Math.round(n));
    return unit === '%' ? `${s}%` : s;
};

const GoalHero = ({
    goal,
    projection,
    inferred = false,
    movement = null,
    campaignCount = 0,
    onOpenGoal,
    onSetPrimary,
    onAddCampaign,
}) => {
    if (!goal) return null;

    const measure = MEASURES[goal.measure];
    const unit = measure?.unit ?? '';
    const p = projection ?? {};
    const verdict = VERDICT[p.verdict ?? 'unknown'];
    const pct = p.progress === null || p.progress === undefined ? null : Math.round(p.progress * 100);
    const directional = goal.kind !== 'measured';

    return (
        <section className="cockpit-hero" aria-label="Primary goal">
            <header className="cockpit-hero__head">
                <div>
                    <p className="cockpit-hero__eyebrow">
                        {inferred ? 'Leading with your soonest goal' : 'Primary goal'}
                        {measure && ` · ${measure.label}`}
                    </p>
                    <h2 className="cockpit-hero__name">
                        <button type="button" className="cockpit-hero__link" onClick={() => onOpenGoal?.(goal)}>
                            {goal.name}
                        </button>
                    </h2>
                </div>
                <span className={`cockpit-hero__verdict cockpit-hero__verdict--${verdict.tone}`}>
                    {directional ? 'Directional' : verdict.label}
                </span>
            </header>

            {/* The inference is stated, not hidden — otherwise "primary" quietly
                means "whatever Kepler picked" and the user never sets one. */}
            {inferred && (
                <p className="cockpit-hero__inferred">
                    No primary goal is set, so this is the one ending soonest.
                    {onSetPrimary && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSetPrimary(goal)}>
                            Make this the primary goal
                        </button>
                    )}
                </p>
            )}

            {directional ? (
                <p className="cockpit-hero__directional">
                    A directional goal has no forecast — progress is the checkpoints you set against it.
                    {campaignCount === 0 && ' Nothing is laddered to it yet.'}
                </p>
            ) : (
                <>
                    <div className="cockpit-hero__figure">
                        <span className="cockpit-hero__pct">{pct === null ? '—' : `${pct}%`}</span>
                        <span className="cockpit-hero__of">
                            {fmt(p.achieved, unit)} of {fmt(goal.target, unit)} {measure?.unit === '%' ? '' : (measure?.unit ?? '')}
                        </span>
                    </div>
                    <div className="cockpit-hero__track" role="presentation">
                        <span className="cockpit-hero__fill" style={{ width: `${pct ?? 0}%` }} />
                    </div>

                    <dl className="cockpit-hero__facts">
                        <div>
                            <dt>Forecast at this pace</dt>
                            <dd>{fmt(p.forecast, unit)}</dd>
                        </div>
                        <div>
                            {/* The gap in real units. An unknown gap is neither short
                                nor ahead, and claiming either is the false precision
                                the goals engine exists to prevent. */}
                            <dt>{p.gap === null || p.gap === undefined ? 'Gap' : p.gap > 0 ? 'Short by' : 'Ahead by'}</dt>
                            <dd>{p.gap === null || p.gap === undefined ? '—' : `${fmt(Math.abs(p.gap), unit)} ${unit === '%' ? '' : (measure?.unit ?? '')}`}</dd>
                        </div>
                        <div>
                            <dt>Days remaining</dt>
                            <dd>{p.daysRemaining ?? '—'}</dd>
                        </div>
                        <div>
                            <dt>Needed per day</dt>
                            <dd>{p.requiredPerDay === null || p.requiredPerDay === undefined ? '—' : fmt(p.requiredPerDay, unit)}</dd>
                        </div>
                    </dl>

                    <p className="cockpit-hero__basis">{describeBasis(p.runRate)}</p>
                </>
            )}

            {/* What moved — attached to the goal, never a standalone feed. */}
            {movement?.hasData && (
                <div className="cockpit-hero__moved">
                    <div className="cockpit-hero__moved-text">
                        <span className={`cockpit-hero__moved-delta is-${movement.delta?.direction ?? 'flat'}`}>
                            {movement.delta?.pct === null || movement.delta?.pct === undefined
                                ? 'New reading'
                                : `${movement.delta.pct > 0 ? '+' : ''}${movement.delta.pct}%`}
                        </span>
                        <span>
                            {measure?.label ?? 'This measure'} is at {fmt(movement.value, unit)} — against the previous reading.
                            {' '}Kepler is not yet computing what caused the change.
                        </span>
                    </div>
                    <Sparkline points={movement.points} className="cockpit-hero__spark" />
                </div>
            )}

            <div className="cockpit-hero__actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenGoal?.(goal)}>
                    Open goal
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAddCampaign?.(goal)}>
                    {campaignCount === 0 ? 'Add the work under it' : `${campaignCount} campaign${campaignCount === 1 ? '' : 's'} under it`}
                </button>
            </div>
        </section>
    );
};

export default GoalHero;
