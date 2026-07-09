import './StatusPill.css';

const StatusPill = ({ status, variant, className = '' }) => {
    const statusClass = variant || status?.toLowerCase().replace(/[\s-]/g, '');

    return (
        <span className={`status-pill ${statusClass} ${className}`}>
            {status}
        </span>
    );
};

export default StatusPill;
