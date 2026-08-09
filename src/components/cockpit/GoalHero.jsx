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
// WHAT MOVED (E7). The detectors land here, attached to the goal rather than in
// a separate activity feed, because movement you cannot act on is filler while
// the same movement against a target is direction.
//
// THE SENTENCE IS THE CAREFUL PART. Kepler observes that three terms climbed and
// traffic rose in the same window. It has NOT established that one caused the
// other, and the copy says "alongside", never "because". Correlation stated as
// correlation is useful; correlation stated as cause is what every analytics
// vendor does and none of them can defend. `aligned` is the only claim made, and
// all it means is that the movements point the same way.

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

/** "7 days earlier" — a change with no window attached cannot be argued with. */
const describeGap = (from, to) => {
    if (!from || !to) return 'before it';
    const days = Math.round((new Date(to) - new Date(from)) / 86400000);
    if (days <= 0) return 'before it';
    return `${days} day${days === 1 ? '' : 's'} earlier`;
};

/** One contributor, in its own units — positions for search, engines for AEO. */
const describeContributor = (e) => {
    if (e.kind === 'search') {
        const where = e.evidence?.enteredPageOne ? ' onto page one' : e.evidence?.leftPageOne ? ' off page one' : '';
        return `“${e.subject}” ${e.direction === 'up' ? 'climbed' : 'slipped'} ${fmt(e.magnitude)} position${e.magnitude === 1 ? '' : 's'}${where}`;
    }
    if (e.kind === 'visibility') {
        const engine = e.evidence?.surface ? ` on ${e.evidence.surface}` : '';
        return `${e.direction === 'up' ? 'newly' : 'no longer'} ${e.evidence?.what ?? 'mentioned'}${engine} for “${e.subject}”`;
    }
    if (e.kind === 'outreach') {
        return `${e.subject.toLowerCase()} ${e.direction === 'up' ? 'up' : 'down'} ${fmt(e.magnitude)}`;
    }
    return `${e.subject} ${e.direction === 'up' ? 'up' : 'down'} ${fmt(e.magnitude)}`;
};

const GoalHero = ({
    goal,
    projection,
    inferred = false,
    /** summariseMovement() output — the detected changes, or null. */
    movement = null,
    /** The funnel stage for this goal's measure, purely for the sparkline. */
    trend = null,
    detecting = false,
    campaignCount = 0,
    onOpenGoal,
    onSetPrimary,
    onAddCampaign,
    onDetect,
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
            <div className="cockpit-hero__moved">
                {movement ? (
                    <div className="cockpit-hero__moved-text">
                        {movement.headline && (
                            <>
                                <span className={`cockpit-hero__moved-delta is-${movement.headline.direction}`}>
                                    {movement.headline.pct === null
                                        ? `${movement.headline.direction === 'up' ? '+' : '−'}${fmt(movement.headline.magnitude)}`
                                        : `${movement.headline.pct > 0 ? '+' : ''}${movement.headline.pct}%`}
                                </span>
                                <span>
                                    {movement.headline.subject} {movement.headline.direction === 'up' ? 'rose' : 'fell'} to{' '}
                                    {fmt(movement.headline.to)}, against the reading{' '}
                                    {describeGap(movement.headline.comparedTo, movement.headline.observedAt)}.
                                </span>
                            </>
                        )}
                        {movement.contributors.length > 0 && (
                            <span className="cockpit-hero__moved-with">
                                {/* "Alongside", not "because". */}
                                {movement.headline ? 'Alongside it: ' : 'Also moved: '}
                                {movement.contributors.map(describeContributor).join('; ')}.
                            </span>
                        )}
                    </div>
                ) : (
                    <div className="cockpit-hero__moved-text">
                        <span>
                            Nothing has moved enough to report since the last check — small wobbles are
                            deliberately not raised.
                        </span>
                        {onDetect && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={onDetect} disabled={detecting}>
                                {detecting ? 'Checking…' : 'Check for changes'}
                            </button>
                        )}
                    </div>
                )}
                {trend?.points?.length > 0 && <Sparkline points={trend.points} className="cockpit-hero__spark" />}
            </div>

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
