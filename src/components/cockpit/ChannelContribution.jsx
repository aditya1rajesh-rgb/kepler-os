import { Send, BadgeDollarSign, Hash, Target, Search, FileText } from 'lucide-react';
import Panel, { PanelHeader } from '../ui/Panel';
import { DESIGN_FORM } from '../../lib/designForm';

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

// ── REFERENCE FORM ─────────────────────────────────────────────────────────
// The Siphron reference's Leaderboard is the closest analogue to this table:
// a rank, a two-line identity, and a value on the right. `production—source`
// maps onto its name/email pair exactly, so this is a form change, not a data
// change. Refusals 1–3 above are preserved: `Other` rows still sit in the same
// list, and they still get no Drill.
//
// The reference puts a person's avatar in the rank slot. A channel has no
// avatar, and the first initial is worse than nothing — Ken42's three `Other`
// rows all rendered "O". So the chip carries the WING, and the unattributable
// remainder gets a neutral dot rather than a letter it does not have.
const WING_ICON = {
    Outreach: Send,
    Paid: BadgeDollarSign,
    Social: Hash,
    Campaign: Target,
    SEO: Search,
    Content: FileText,
};

const WingChip = ({ production }) => {
    const Icon = WING_ICON[production];
    return (
        <span className="dform-lb__chip" role="cell" aria-hidden="true">
            {Icon ? <Icon size={14} strokeWidth={1.9} /> : <span className="dform-lb__dot" />}
        </span>
    );
};

const LeaderboardRow = ({ row, rank, onDrill }) => (
    <div className={`dform-lb__row ${row.production === 'Other' ? 'is-other' : ''}`} role="row">
        <span className="dform-lb__rank" role="cell">{rank}</span>
        <WingChip production={row.production} />
        <span className="dform-lb__id" role="cell">
            <span className="dform-lb__name">{row.production}</span>
            <span className="dform-lb__sub">{row.source}</span>
        </span>
        <span className="dform-lb__bar" role="cell">
            <span className="dform-lb__fill" style={{ width: `${(row.share ?? 0) * 100}%` }} />
        </span>
        <span className="dform-lb__num" role="cell">{fmt(row.sessions)}</span>
        <span className="dform-lb__share" role="cell">{pct(row.share)}</span>
        {row.production === 'Other' ? (
            <span className="dform-lb__spacer" role="cell" />
        ) : (
            <button type="button" className="dform-lb__drill" role="cell" onClick={() => onDrill?.(row)}>
                Drill
            </button>
        )}
    </div>
);

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

                    {(import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true') && DESIGN_FORM ? (
                        <div className="dform-lb" role="table">
                            {rows.map((row, i) => (
                                <LeaderboardRow key={row.key} row={row} rank={i + 1} onDrill={onDrill} />
                            ))}
                        </div>
                    ) : (
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
                    )}
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
