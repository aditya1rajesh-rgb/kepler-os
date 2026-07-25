import TrendPill from './TrendPill';

// One KPI stat card: label + small icon, big value, trend pill + "vs last month".
// An `empty` state swaps the value for a mini connect-CTA (no fake numbers).
const KpiCard = ({ label, icon: Icon, value, delta, state = 'ready', empty }) => (
    <div className="db-card kpi">
        <div className="kpi__head">
            <span className="kpi__label">{label}</span>
            {Icon && <Icon size={16} strokeWidth={1.7} className="kpi__icon" />}
        </div>

        {state === 'empty' && empty ? (
            <div className="kpi__empty">
                <button type="button" className="btn btn-secondary kpi__empty-cta" onClick={empty.onCta}>
                    {empty.ctaLabel}
                </button>
                {empty.message && <p className="kpi__empty-msg">{empty.message}</p>}
            </div>
        ) : (
            <>
                <div className="kpi__value">{value}</div>
                <div className="kpi__foot">
                    <TrendPill delta={delta} />
                    <span className="kpi__vs">vs last month</span>
                </div>
            </>
        )}
    </div>
);

export default KpiCard;
