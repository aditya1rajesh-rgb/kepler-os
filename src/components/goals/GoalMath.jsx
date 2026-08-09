import { MEASURES, describeBasis } from '../../lib/goalFeasibility';

// The right rail of a goal (E2, roadmap S1).
//
// "Live math, not metadata. This is the departure from the issue tracker, whose
// rail is inert." Kepler's most valuable real estate carries the forecast, the
// gap in real units, and the basis it was judged against — metadata drops below.
//
// Every number here can be null. That is the point: on a cold-start account the
// honest answer is "we cannot say yet", and a zero would be a claim.

const VERDICT = {
    'on-track': { label: 'On track', tone: 'ok' },
    'at-risk': { label: 'At risk', tone: 'warn' },
    'off-pace': { label: 'Off pace', tone: 'bad' },
    unknown: { label: 'Not enough data', tone: 'muted' },
};

const fmt = (n, unit) => {
    if (n === null || n === undefined) return '—';
    const rounded = Math.round(n);
    const s = new Intl.NumberFormat().format(rounded);
    return unit === '%' ? `${s}%` : s;
};

const GoalMath = ({ goal, projection }) => {
    // Directional goals get checkpoints, not a forecast. Showing an empty
    // forecast frame would imply the number is missing rather than inapplicable.
    if (goal.kind !== 'measured') {
        return (
            <div className="goal-math goal-math--directional">
                <p className="goal-math__kind">Directional goal</p>
                <p className="goal-math__note">
                    Not bound to a measure, so there is no forecast. Progress is the checkpoints
                    you define and mark off. Attach a measure later and it becomes measured,
                    keeping its campaigns and history.
                </p>
            </div>
        );
    }

    const measure = MEASURES[goal.measure];
    const unit = measure?.unit ?? '';
    const p = projection ?? {};
    const verdict = VERDICT[p.verdict ?? 'unknown'];
    const pct = p.progress === null || p.progress === undefined ? null : Math.round(p.progress * 100);

    return (
        <div className="goal-math">
            <div className="goal-math__head">
                <span className={`goal-math__verdict goal-math__verdict--${verdict.tone}`}>{verdict.label}</span>
                <span className="goal-math__measure">{measure?.label ?? goal.measure}</span>
            </div>

            {/* Progress large — it is the one number the screen exists to show. */}
            <div className="goal-math__progress">
                <span className="goal-math__pct">{pct === null ? '—' : `${pct}%`}</span>
                <span className="goal-math__of">
                    {fmt(p.achieved, unit)} of {fmt(goal.target, unit)}
                </span>
            </div>
            <div className="goal-math__track">
                <span className="goal-math__fill" style={{ width: `${pct ?? 0}%` }} />
            </div>

            <dl className="goal-math__facts">
                <div>
                    <dt>Forecast at current pace</dt>
                    <dd>{fmt(p.forecast, unit)}</dd>
                </div>
                <div>
                    {/* The gap in REAL units — "2,400 sessions short", not "80% there".
                        An unknown gap is neither short nor ahead; claiming either
                        would be the false precision this whole epic guards against. */}
                    <dt>{p.gap === null || p.gap === undefined ? 'Gap' : p.gap > 0 ? 'Short by' : 'Ahead by'}</dt>
                    <dd>{p.gap === null || p.gap === undefined ? '—' : fmt(Math.abs(p.gap), unit)}</dd>
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

            {/* The basis it was judged against — a forecast you cannot argue with
                is a forecast you cannot trust. */}
            <p className="goal-math__basis">{describeBasis(p.runRate)}</p>
            {p.basis === 'trailing-level' && (
                <p className="goal-math__basis goal-math__basis--fine">
                    Estimated from trailing readings, not per-day totals.
                </p>
            )}

            <dl className="goal-math__meta">
                <div><dt>Window</dt><dd>{goal.startDate} → {goal.endDate}</dd></div>
                <div><dt>Status</dt><dd>{goal.status}</dd></div>
            </dl>
        </div>
    );
};

export default GoalMath;
