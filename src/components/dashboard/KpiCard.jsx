import TrendPill from './TrendPill';

// One KPI: label, value, trend. An `empty` state swaps the value for a connect
// CTA rather than showing a fake number.
//
// v3 gave each of these a 132px-min card with a 34px value, so three numbers
// consumed the entire first screen. The KPI strip is context for the work
// below it, not the work itself, so it is now a compact row.
const KpiCard = ({ label, icon: Icon, value, delta, state = 'ready', empty }) => (
    <div className="kpi">
        <div className="kpi__head">
            {Icon && <Icon size={14} strokeWidth={1.7} className="kpi__icon" />}
            <span className="kpi__label">{label}</span>
        </div>

        {state === 'empty' && empty ? (
            <div className="kpi__empty">
                <button type="button" className="btn btn-secondary btn-sm" onClick={empty.onCta}>
                    {empty.ctaLabel}
                </button>
                {empty.message && <p className="kpi__empty-msg">{empty.message}</p>}
            </div>
        ) : (
            <div className="kpi__foot">
                <span className="kpi__value">{value}</span>
                {/* "vs last month" only earns its place when there is something to
                    compare to. TrendPill renders nothing without a comparable prior
                    period (it never fabricates a trend), which used to leave the
                    phrase dangling — "3 vs last month" with no delta between them. */}
                {delta?.pct != null && (
                    <>
                        <TrendPill delta={delta} />
                        <span className="kpi__vs">vs last month</span>
                    </>
                )}
            </div>
        )}
    </div>
);

export default KpiCard;
