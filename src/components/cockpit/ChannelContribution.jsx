import Panel, { PanelHeader } from '../ui/Panel';

// Zone 5 — channel contribution, keyed `production—source`.
//
// production = what Kepler made (known). source = where the outcome came from
// (reported by GA4). One compound key rather than a toggle between two axes, so
// there is only ever one number per row.
//
// THREE THINGS THIS COMPONENT REFUSES TO DO.
//
// 1. Hide the remainder. `Other—…` rows sit in the same table as Kepler's work,
//    because a contribution table that shows only attributed traffic is claiming
//    the whole business ran on Kepler's output.
// 2. Chart around a missing leg. Until an ad platform is connected, paid is
//    absent from this picture and the card says so in words above the table.
// 3. Compare efficiency across channels. Nothing assigns a production cost to
//    organic, so cost-per-outcome comparisons are not available here at all.

const pct = (share) => (share === null || share === undefined ? '—' : `${(share * 100).toFixed(1)}%`);
const fmt = (n) => new Intl.NumberFormat().format(Math.round(Number(n) || 0));

const ChannelContribution = ({ contribution, caveats = [], goalName = '', onDrill }) => {
    const rows = contribution?.contributions ?? [];
    const attributed = contribution?.attributedShare;

    return (
        <Panel className="module-panel">
            <PanelHeader
                title="Channel contribution"
                meta={goalName ? `Against “${goalName}”` : 'Across the workspace'}
            />

            {rows.length === 0 ? (
                <div className="cockpit-empty">
                    <p className="cockpit-empty__lead">No traffic readings yet.</p>
                    <p className="cockpit-empty__sub">
                        Contribution needs GA4 snapshots. Connect GA4 and tag your links, and this fills in.
                    </p>
                </div>
            ) : (
                <>
                    <p className="cockpit-contrib__summary">
                        Kepler-produced work accounts for{' '}
                        <strong>{pct(attributed)}</strong> of {fmt(contribution.totalSessions)} sessions.
                        {' '}The rest is real traffic Kepler cannot claim, and it is in the table.
                    </p>

                    <div className="cockpit-contrib" role="table">
                        {rows.map((row) => (
                            <div
                                key={row.key}
                                className={`cockpit-contrib__row ${row.production === 'Other' ? 'is-other' : ''}`}
                                role="row"
                            >
                                <span className="cockpit-contrib__key" role="cell">
                                    <span className="cockpit-contrib__production">{row.production}</span>
                                    <span className="cockpit-contrib__source">{row.source}</span>
                                </span>
                                <span className="cockpit-contrib__bar" role="cell">
                                    <span className="cockpit-contrib__fill" style={{ width: `${(row.share ?? 0) * 100}%` }} />
                                </span>
                                <span className="cockpit-contrib__num" role="cell">{fmt(row.sessions)}</span>
                                <span className="cockpit-contrib__share" role="cell">{pct(row.share)}</span>
                                {row.production === 'Other' ? (
                                    <span className="cockpit-contrib__spacer" role="cell" />
                                ) : (
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        role="cell"
                                        onClick={() => onDrill?.(row)}
                                    >
                                        Drill
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {caveats.length > 0 && (
                <ul className="cockpit-contrib__caveats">
                    {caveats.map((c) => <li key={c.id}>{c.text}</li>)}
                </ul>
            )}
        </Panel>
    );
};

export default ChannelContribution;
