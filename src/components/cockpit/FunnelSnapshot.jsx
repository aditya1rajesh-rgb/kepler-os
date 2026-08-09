import Panel, { PanelHeader } from '../ui/Panel';
import Sparkline from './Sparkline';

// Zone 4 — sessions → conversions → CRM records → meetings → revenue.
//
// Each stage carries a sparkline rather than a bare number, because a number
// alone is state and the screen's admission filter rejects state.
//
// A stage with no source says what would unlock it instead of showing a dash.
// That is the cold-start requirement: a new workspace should read as "here is
// what connecting GA4 would give you", not as five empty boxes.

const fmt = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat().format(Math.round(n)));

const FunnelSnapshot = ({ stages = [], onConnect }) => (
    <Panel className="module-panel">
        <PanelHeader
            title="Funnel"
            /* Naming the reading, not the window: these are trailing levels, and
               calling them "this week" would imply an increment. */
            meta="Latest reading at each stage, against the one before it"
        />
        <div className="cockpit-funnel">
            {stages.map((stage) => (
                <div key={stage.id} className={`cockpit-funnel__stage ${stage.hasData ? '' : 'is-empty'}`}>
                    <span className="cockpit-funnel__label">{stage.label}</span>
                    {stage.hasData ? (
                        <>
                            <span className="cockpit-funnel__value">{fmt(stage.value)}</span>
                            <div className="cockpit-funnel__trend">
                                <Sparkline points={stage.points} width={92} height={26} />
                                {stage.delta?.pct !== null && stage.delta?.pct !== undefined && (
                                    <span className={`cockpit-funnel__delta is-${stage.delta.direction}`}>
                                        {stage.delta.pct > 0 ? '+' : ''}{stage.delta.pct}%
                                    </span>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <span className="cockpit-funnel__value cockpit-funnel__value--muted">—</span>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm cockpit-funnel__unlock"
                                onClick={() => onConnect?.(stage)}
                            >
                                Connect {stage.unlockedBy}
                            </button>
                        </>
                    )}
                </div>
            ))}
        </div>
    </Panel>
);

export default FunnelSnapshot;
