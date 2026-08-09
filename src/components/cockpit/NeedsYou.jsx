import Panel, { PanelHeader } from '../ui/Panel';

// Zone 2 — the demand queue. Grouped, counted, every row actionable.
//
// The empty state is a real state and it HANDS OFF: "nothing needs you — here's
// what would move the goal". A queue that empties into blankness teaches the
// user that an empty queue means the screen is done with them.

const NeedsYou = ({ rows = [], onGo, onNextBest, hasGoal = true }) => (
    <Panel className="module-panel">
        <PanelHeader
            title="Needs you"
            meta={rows.length ? `${rows.reduce((s, r) => s + r.count, 0)} waiting, most urgent first` : 'The queue, when there is one'}
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

export default NeedsYou;
