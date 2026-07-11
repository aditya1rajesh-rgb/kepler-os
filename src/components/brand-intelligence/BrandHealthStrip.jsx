import { formatRelativeTime } from '../../lib/formatRelativeTime';

// Compact health readout for the living brand model: average field confidence,
// stale/unscored counts, last sync, and whether the source website drifted
// since that sync. Provenance chips stay hidden per the existing product
// decision — this surfaces the aggregate, not per-field labels.
const pct = (x) => `${Math.round((Number(x) || 0) * 100)}%`;

const siteStatus = (freshness) => {
    if (!freshness) return { text: '—', tone: '' };
    if (!freshness.ok) return { text: freshness.reason === 'no-url' ? 'No site URL' : 'Check failed', tone: '' };
    if (!freshness.hasBaseline) return { text: 'Not synced yet', tone: '' };
    if (freshness.changed) return { text: `Changed (~${pct(freshness.deltaRatio)})`, tone: 'warn' };
    return { text: 'In sync', tone: 'ok' };
};

const BrandHealthStrip = ({ health, freshness, onRefresh, refreshing }) => {
    if (!health) return null;
    const site = siteStatus(freshness);
    return (
        <div className="brand-health">
            <div className="cockpit__intel-facts brand-health__facts">
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value font-heading">
                        {health.avgConfidence === null ? '—' : pct(health.avgConfidence)}
                    </span>
                    <span className="cockpit__intel-label">Avg confidence</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value font-heading">{health.staleCount}</span>
                    <span className="cockpit__intel-label">Stale fields (90d+)</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value font-heading">{health.unknownCount}</span>
                    <span className="cockpit__intel-label">Unscored fields</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className="cockpit__intel-value font-heading">
                        {health.lastSyncedAt ? formatRelativeTime(health.lastSyncedAt) : '—'}
                    </span>
                    <span className="cockpit__intel-label">Last synced</span>
                </div>
                <div className="cockpit__intel-fact">
                    <span className={`cockpit__intel-value font-heading brand-health__site--${site.tone}`}>{site.text}</span>
                    <span className="cockpit__intel-label">Source website</span>
                </div>
            </div>
            {freshness?.ok && freshness.changed && (
                <p className="brand-health__drift" role="status">
                    Your website changed since the last sync — refresh to review what's new before it goes stale.
                    <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={refreshing}>
                        {refreshing ? 'Refreshing…' : 'Refresh from sources'}
                    </button>
                </p>
            )}
        </div>
    );
};

export default BrandHealthStrip;
