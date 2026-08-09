import { Download } from '../../lib/icons';
import BarChart from '../ui/charts/BarChart';
import EmptyState from '../ui/EmptyState';
import SegmentedControl from './SegmentedControl';

const compact = (n) => new Intl.NumberFormat('en', { notation: 'compact' }).format(Number(n) || 0);

// "Lead Conversion" chart card. Bars = leads per period; the tooltip carries both
// leads and conversions. Requires GA4 or Zoho — otherwise an explicit empty state.
const LeadConversionCard = ({ series, granularity, onGranularityChange, connected, onDownload }) => {
    const points = series?.points ?? [];
    const chartData = points.map((p) => ({
        label: p.label,
        value: p.leads,
        tooltip: [{ k: 'Leads', v: compact(p.leads) }, { k: 'Conversions', v: compact(p.conversions) }],
    }));
    const hasAny = points.some((p) => p.leads || p.conversions);

    return (
        <div className="db-card db-chart">
            <div className="db-card__head">
                <h3 className="db-card__title">Lead Conversion</h3>
                <div className="db-card__head-right">
                    <SegmentedControl
                        options={['Weekly', 'Monthly', 'Quarterly']}
                        value={granularity}
                        onChange={onGranularityChange}
                    />
                    {/* Ghost, not primary: this is a per-card utility. The screen's
                        one primary action lives in the ModuleScreen bar. */}
                    <button type="button" className="btn btn-ghost btn-sm db-chart__dl" onClick={onDownload} disabled={!hasAny}>
                        <Download size={14} strokeWidth={1.8} /> Download
                    </button>
                </div>
            </div>

            {!connected ? (
                <EmptyState message="Connect Google Analytics or Zoho to chart leads and conversions over time." />
            ) : (
                <>
                    <BarChart data={chartData} height={260} formatTick={compact} />
                    {!hasAny && (
                        <p className="db-chart__note">History builds daily — check back after a few snapshots accrue.</p>
                    )}
                </>
            )}
        </div>
    );
};

export default LeadConversionCard;
