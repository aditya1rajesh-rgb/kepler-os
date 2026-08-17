import { MousePointerClick, Target, Users, CalendarCheck, Banknote, ArrowUp, ArrowDown } from 'lucide-react';
import Panel, { PanelHeader } from '../ui/Panel';
import Sparkline from './Sparkline';
import { DESIGN_FORM } from '../../lib/designForm';

// Zone 4 — sessions → conversions → CRM records → meetings → revenue.
//
// Each stage carries a sparkline rather than a bare number, because a number
// alone is state and the screen's admission filter rejects state.
//
// A stage with no source says what would unlock it instead of showing a dash.
// That is the cold-start requirement: a new workspace should read as "here is
// what connecting GA4 would give you", not as five empty boxes.
//
// ── REFERENCE FORMS ────────────────────────────────────────────────────────
// The same five stages render in a reference's anatomy when a design form is
// active. Both keep the sparkline and both keep the unlock affordance, because
// those are product rules, not styling:
//
//   siphron — pastel icon-chip tile: chip, small label, large value, footer.
//             The reference's own stat tiles carry NO trend, so the sparkline
//             is folded into the footer row rather than dropped. That is the
//             synthesis the mapping needs: the reference's shape, Kepler's
//             admission filter.
//   fin     — KPI plate: white card inset on a recessed plate, uppercase mono
//             label, tabular figure, hairline sparkline, delta in the footer
//             band that the plate exposes below the card.

const fmt = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat().format(Math.round(n)));

/**
 * Siphron's tiles set every figure at one size, and Kepler's funnel spans `3` to
 * `3,332,852` — so revenue overflows. DECIDED: abbreviate past 7 characters
 * (`3,332,852` → `3.33M`) and keep three significant digits.
 *
 * The exact value is NOT hover-only. A `title` covers pointer users but strands
 * touch and assistive tech, so the full reading also goes in the aria-label —
 * an abbreviated figure is a rounded reading, and it must stay recoverable.
 */
const compact = (n) => {
    if (n === null || n === undefined) return '—';
    const exact = fmt(n);
    if (exact.length <= 7) return exact;
    // Some locales render the compact suffix lowercase ("3.33m"); the design
    // calls for "3.33M". Separators still come from the user's locale above.
    return new Intl.NumberFormat(undefined, { notation: 'compact', maximumSignificantDigits: 3 })
        .format(Math.round(n))
        .toUpperCase();
};

const STAGE_ICON = {
    sessions: MousePointerClick,
    conversions: Target,
    crmRecords: Users,
    meetings: CalendarCheck,
    revenue: Banknote,
};

const Delta = ({ delta, withIcon = false }) => {
    if (delta?.pct === null || delta?.pct === undefined) return null;
    const Icon = delta.direction === 'down' ? ArrowDown : ArrowUp;
    return (
        <span className={`dform-delta is-${delta.direction}`}>
            {withIcon && <Icon size={11} strokeWidth={2.4} />}
            {delta.pct > 0 ? '+' : ''}{delta.pct}%
        </span>
    );
};

/* ── Kepler's existing stage (unchanged) ─────────────────────────────────── */
const DefaultStage = ({ stage, onConnect }) => (
    <div className={`cockpit-funnel__stage ${stage.hasData ? '' : 'is-empty'}`}>
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
);

/* ── siphron: pastel icon-chip tile ──────────────────────────────────────── */
const TileStage = ({ stage, index, onConnect }) => {
    const Icon = STAGE_ICON[stage.id] ?? Target;
    return (
        <div className={`dform-tile dform-tile--t${index % 5} ${stage.hasData ? '' : 'is-empty'}`}>
            <div className="dform-tile__head">
                <span className="dform-tile__chip"><Icon size={14} strokeWidth={1.9} /></span>
                <span className="dform-tile__label">{stage.label}</span>
            </div>
            {stage.hasData ? (
                <>
                    <span
                        className="dform-tile__value"
                        title={fmt(stage.value)}
                        aria-label={`${stage.label}: ${fmt(stage.value)}`}
                    >
                        {compact(stage.value)}
                    </span>
                    <div className="dform-tile__foot">
                        <Sparkline points={stage.points} width={72} height={22} />
                        <Delta delta={stage.delta} />
                    </div>
                </>
            ) : (
                <>
                    <span className="dform-tile__value dform-tile__value--muted">—</span>
                    <button type="button" className="dform-tile__unlock" onClick={() => onConnect?.(stage)}>
                        Connect {stage.unlockedBy}
                    </button>
                </>
            )}
        </div>
    );
};

/* ── fin: KPI plate ──────────────────────────────────────────────────────── */
const PlateStage = ({ stage, onConnect }) => (
    <div className={`dform-plate ${stage.hasData ? '' : 'is-empty'}`}>
        <div className="dform-plate__card">
            <div className="dform-plate__text">
                <span className="dform-plate__label">{stage.label}</span>
                <span className="dform-plate__value">{fmt(stage.value)}</span>
            </div>
            {stage.hasData && <Sparkline points={stage.points} width={54} height={28} />}
        </div>
        <div className="dform-plate__foot">
            {stage.hasData ? (
                <Delta delta={stage.delta} withIcon />
            ) : (
                <button type="button" className="dform-plate__unlock" onClick={() => onConnect?.(stage)}>
                    Connect {stage.unlockedBy}
                </button>
            )}
        </div>
    </div>
);

const FunnelSnapshot = ({ stages = [], onConnect }) => {
    /* FORMS_ENABLED (not DESIGN_FORM) is what gates this. It is built from
       `import.meta.env.DEV` and `VITE_DEMO_MODE`, both replaced with literals at
       build time, so in a real production build the whole reference-form path
       folds to DefaultStage and the tile/plate components tree-shake out.
       Testing DESIGN_FORM alone leaves them in — it is a runtime value the
       bundler cannot prove is null. */
    const form = (import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true') ? DESIGN_FORM : null;
    const Stage = form === 'siphron' ? TileStage : form === 'fin' ? PlateStage : DefaultStage;

    return (
        <Panel className="module-panel">
            <PanelHeader
                title="Funnel"
                /* Naming the reading, not the window: these are trailing levels, and
                   calling them "this week" would imply an increment. */
                meta="Latest reading at each stage, against the one before it"
            />
            <div className={form ? `dform-funnel dform-funnel--${form}` : 'cockpit-funnel'}>
                {stages.map((stage, i) => (
                    <Stage key={stage.id} stage={stage} index={i} onConnect={onConnect} />
                ))}
            </div>
        </Panel>
    );
};

export default FunnelSnapshot;
