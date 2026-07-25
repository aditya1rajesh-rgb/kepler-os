import { RefreshCw, Sparkles } from '../../lib/icons';

const DashboardHeader = ({ firstName, subtitle, onRefresh, refreshing, onExport }) => (
    <div className="db__head">
        <div className="db__greeting">
            <h1 className="db__hello font-display">Hello, {firstName}</h1>
            <p className="db__sub">{subtitle}</p>
        </div>
        <div className="db__head-actions">
            <button type="button" className="btn btn-ghost" onClick={onRefresh} disabled={refreshing}>
                <RefreshCw size={15} strokeWidth={1.8} /> {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" className="btn btn-primary" onClick={onExport}>
                <Sparkles size={15} strokeWidth={1.8} /> Export
            </button>
        </div>
    </div>
);

export default DashboardHeader;
