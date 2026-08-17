import Panel, { PanelHeader } from '../ui/Panel';
import EmptyState from '../ui/EmptyState';

// L1 — one channel, drilled from the cockpit (E5, roadmap S2).
//
// The drill path is L0 contribution (cockpit) → L1 channel (here) → L2 campaign
// → L3 asset. L2 and L3 already existed; this is the level that was missing, and
// the roadmap puts it in Measurement deliberately: the cockpit summarises,
// Measurement is where you drill. That is what gives this screen its job.
//
// CHANNEL-SHAPED, NOT A GENERIC TABLE. Every channel shares one spine —
// contribution to the goal — and then shows what it is actually made of. A
// single table with columns for impressions, replies and spend would be mostly
// blank for every channel, which reads as missing data rather than as a
// different kind of thing.

const fmt = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat().format(Math.round(n)));
const pctOf = (n) => (n === null || n === undefined ? '—' : `${(n * 100).toFixed(1)}%`);

const Stat = ({ label, value }) => (
    <div className="cockpit__intel-fact">
        <span className="cockpit__intel-value">{value}</span>
        <span className="cockpit__intel-label">{label}</span>
    </div>
);

const ChannelDetail = ({ detail, goalName = '', onBack, onOpenCampaign }) => {
    if (!detail?.row) {
        return (
            <Panel className="module-panel">
                <PanelHeader title="Channel" meta="Drilled from the cockpit" />
                <EmptyState message="That channel has no readings in the current scope. It may have been produced before the last pull, or belong to another goal." />
                <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>Back to performance</button>
            </Panel>
        );
    }

    const { row, channel, campaigns = [] } = detail;

    return (
        <>
            <Panel className="module-panel">
                <PanelHeader
                    title={`${row.production} · ${row.source}`}
                    /* The goal travels with the drill; without it this would
                       quietly become a workspace-wide view one click in. */
                    meta={goalName ? `Contribution to “${goalName}”` : 'Contribution across the workspace'}
                />

                {/* The spine — the same measure for every channel. */}
                <div className="cockpit__intel-facts">
                    <Stat label="Sessions" value={fmt(row.sessions)} />
                    <Stat label="Conversions" value={fmt(row.conversions)} />
                    <Stat label="Share of all traffic" value={pctOf(row.share)} />
                    <Stat label="Campaigns behind it" value={fmt(campaigns.length)} />
                </div>

                {/* The channel-shaped half. */}
                {channel?.kind === 'seo' && (
                    channel.missing ? (
                        <p className="brand-intel-module__source-label">{channel.missing}</p>
                    ) : (
                        <>
                            <div className="cockpit__intel-facts">
                                <Stat label="Impressions" value={fmt(channel.impressions)} />
                                <Stat label="Clicks" value={fmt(channel.clicks)} />
                                <Stat label="CTR" value={pctOf(channel.ctr)} />
                                <Stat label="Avg position" value={channel.position ?? '—'} />
                            </div>
                            <p className="brand-intel-module__source-label">
                                Search Console reports at property level, so these describe the whole site rather than
                                only these campaigns.
                            </p>
                        </>
                    )
                )}

                {channel?.kind === 'outreach' && (
                    <div className="cockpit__intel-facts">
                        <Stat label="Enrolled" value={fmt(channel.enrolled)} />
                        <Stat label="Sent" value={fmt(channel.sent)} />
                        <Stat label="Replied" value={fmt(channel.replied)} />
                        <Stat label="Meetings" value={fmt(channel.meetings)} />
                    </div>
                )}

                {(channel?.kind === 'paid' || channel?.kind === 'social') && (
                    <p className="brand-intel-module__source-label">{channel.missing}</p>
                )}
            </Panel>

            <Panel className="module-panel">
                <PanelHeader title="Campaigns" meta="The work behind this channel" />
                {campaigns.length === 0 ? (
                    <EmptyState message="No Kepler campaign produced this traffic. It arrived untagged." />
                ) : (
                    <div className="engine-table" role="table">
                        {campaigns.map((c) => (
                            <div key={c.id} className="engine-row" role="row">
                                <div className="engine-row__main">
                                    <span className="engine-row__title">{c.title || 'Untitled campaign'}</span>
                                    <span className="label-text">{c.status}</span>
                                </div>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenCampaign?.(c)}>
                                    Open
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </Panel>
        </>
    );
};

export default ChannelDetail;
