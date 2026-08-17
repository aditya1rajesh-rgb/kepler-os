import Panel, { PanelHeader } from '../ui/Panel';

// Zone 3 — what would close the gap (E10).
//
// E5 built this zone and deliberately left it empty: it would not rank work it
// had not measured. This is the measurement, and the shape of the card follows
// from where the number comes from.
//
// THE WORKING IS THE FEATURE. "3 more campaigns would close it" is worth exactly
// as much as the sentences under it — your campaigns delivered 300–1,900 each,
// median 800, and these are trailing levels not lifetime totals. Those lines are
// not small print; they are what makes the number arguable, and they are always
// shown rather than hidden behind a disclosure.
//
// Every state has something to say. Ahead of pace, too little evidence, no
// standing yet — each is a real answer, and none of them is an empty box.

const STATUS_TONE = {
    ok: '',
    'no-gap': 'is-good',
    'insufficient-evidence': 'is-thin',
    'no-standing': 'is-thin',
    'not-measured': 'is-thin',
};

const NextWork = ({ recommendation, goalName = '', accepting = false, loading = false, onAccept, onPlanManually }) => {
    // Sizing takes seconds. Announcing "nothing to size" while it is still running
    // states a conclusion the screen has not reached, and then contradicts itself.
    if (loading) {
        return (
            <Panel className="module-panel">
                <PanelHeader title="What would close the gap" meta="Sized from your own campaigns" />
                <div className="cockpit-empty">
                    <p className="cockpit-empty__lead">Sizing this against your campaigns…</p>
                </div>
            </Panel>
        );
    }

    // Two different absences. On the cockpit with no goal there is no gap to size;
    // on a goal's own detail the goal plainly exists, and "set a goal" reads as a
    // bug. Same empty panel, different sentence, because they are different facts.
    if (!recommendation) {
        return (
            <Panel className="module-panel">
                <PanelHeader title="What would close the gap" meta="Sized from your own campaigns" />
                <div className="cockpit-empty">
                    <p className="cockpit-empty__lead">
                        {goalName ? 'Nothing to size against this goal yet.' : 'Set a goal and this fills in.'}
                    </p>
                    <p className="cockpit-empty__sub">
                        {goalName
                            ? 'A recommendation is a gap plus what your campaigns have actually delivered. This one has no measured campaigns to size it from.'
                            : 'A recommendation is a gap plus what your campaigns have actually delivered. Without a goal there is no gap to size.'}
                    </p>
                </div>
            </Panel>
        );
    }

    const { status, headline, workings = [], channelHint, basedOn = [], scope, tooLate } = recommendation;
    const canAct = status === 'ok' || status === 'insufficient-evidence';

    return (
        <Panel className="module-panel">
            <PanelHeader
                title="What would close the gap"
                meta={status === 'ok'
                    ? `From ${basedOn.length} measured campaign${basedOn.length === 1 ? '' : 's'}${scope === 'workspace' ? ' across the workspace' : ''}`
                    : 'Sized from your own campaigns'}
            />

            <div className={`cockpit-next ${STATUS_TONE[status] ?? ''}`}>
                <p className="cockpit-next__lead">{headline}</p>

                {workings.length > 0 && (
                    <ul className="cockpit-next__workings">
                        {workings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                )}

                {/* A hint, never an instruction — and absent entirely when the
                    evidence does not clearly separate one wing from another. */}
                {channelHint && (
                    <p className="cockpit-next__hint">{channelHint.evidence}</p>
                )}

                {canAct && (
                    <div className="cockpit-next__actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={onAccept} disabled={accepting}>
                            {accepting ? 'Planning…' : 'Plan a campaign against it'}
                        </button>
                        {onPlanManually && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={onPlanManually}>
                                Start one myself
                            </button>
                        )}
                    </div>
                )}

                {canAct && (
                    <p className="cockpit-next__fineprint">
                        {tooLate
                            ? `It will be created under “${goalName}”, briefed against the shortfall. On your own history, it is unlikely to land in time.`
                            : `It will be created under “${goalName}” and briefed against the shortfall.`}
                    </p>
                )}
            </div>
        </Panel>
    );
};

export default NextWork;
