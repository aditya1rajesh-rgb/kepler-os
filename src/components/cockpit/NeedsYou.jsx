import { useState } from 'react';
import Panel, { PanelHeader } from '../ui/Panel';
import { DESIGN_FORM } from '../../lib/designForm';

// Zone 2 — the demand queue. Grouped, counted, every row actionable.
//
// The empty state is a real state and it HANDS OFF: "nothing needs you — here's
// what would move the goal". A queue that empties into blankness teaches the
// user that an empty queue means the screen is done with them.
//
// ── REFERENCE FORM ────────────────────────────────────────────────────────
// Mapped onto Siphron's Leaderboard row: the count chip takes the rank slot,
// title-over-detail takes the name/email pair, and `Open` sits where the value
// does. DECIDED: cap at 5 rows with a `Show all {n}` handoff — the reference's
// own "See All" affordance — so a bad backlog cannot push the funnel and channel
// zones below the fold. Nothing is hidden; the rest expands in place.

const CAP = 5;

const NeedsYou = ({ rows = [], onGo, onNextBest, hasGoal = true }) => {
    const form = (import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true') ? DESIGN_FORM : null;
    const [expanded, setExpanded] = useState(false);

    const waiting = rows.reduce((s, r) => s + r.count, 0);
    const overCap = Boolean(form) && rows.length > CAP;
    const visible = overCap && !expanded ? rows.slice(0, CAP) : rows;

    return (
        <Panel className="module-panel">
            <PanelHeader
                title="Needs you"
                meta={rows.length ? `${waiting} waiting, most urgent first` : 'The queue, when there is one'}
                action={overCap ? (
                    <button
                        type="button"
                        className="dform-lb__more"
                        onClick={() => setExpanded((v) => !v)}
                        aria-expanded={expanded}
                    >
                        {expanded ? 'Show fewer' : `Show all ${rows.length}`}
                    </button>
                ) : null}
            />
            {rows.length === 0 ? (
                <div className="cockpit-empty">
                    <p className="cockpit-empty__lead">Nothing needs you right now.</p>
                    <p className="cockpit-empty__sub">
                        {hasGoal
                            ? 'The next useful thing is work that moves your goal.'
                            : 'Set a goal and the work below it gets somewhere to ladder to.'}
                    </p>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onNextBest}>
                        {hasGoal ? 'Plan a campaign' : 'Set a goal'}
                    </button>
                </div>
            ) : form ? (
                <div className="dform-lb dform-lb--queue">
                    {visible.map((row) => (
                        <div key={row.id} className={`dform-lb__row is-${row.kind}`} role="row">
                            <span className="dform-lb__count" role="cell">{row.count}</span>
                            <span className="dform-lb__id" role="cell">
                                <span className="dform-lb__name">{row.title}</span>
                                <span className="dform-lb__sub">{row.detail}</span>
                            </span>
                            <button
                                type="button"
                                className="dform-lb__drill"
                                role="cell"
                                onClick={() => onGo?.(row)}
                            >
                                Open
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <ul className="cockpit-queue">
                    {rows.map((row) => (
                        <li key={row.id} className={`cockpit-queue__row cockpit-queue__row--${row.kind}`}>
                            <span className="cockpit-queue__count">{row.count}</span>
                            <span className="cockpit-queue__body">
                                <span className="cockpit-queue__title">{row.title}</span>
                                <span className="cockpit-queue__detail">{row.detail}</span>
                            </span>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onGo?.(row)}>
                                Open
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
};

export default NeedsYou;
