import './StatusPill.css';

// Stored statuses are machine values, and several read wrong on screen: an item
// in the queue was labelled "queue", a stopped enrolment "stopped_reply". The
// class still comes from the raw value; only the visible text is mapped, and
// anything unmapped passes through untouched so callers that already supply
// prose ("Meeting booked") are unaffected.
const STATUS_LABELS = {
    queue: 'Queued',
    queued: 'Queued',
    generating: 'Generating',
    completed: 'Completed',
    active: 'Active',
    paused: 'Paused',
    draft: 'Draft',
    approved: 'Approved',
    saved: 'Saved',
    sent: 'Sent',
    bounced: 'Bounced',
    meeting: 'Meeting booked',
    stopped_reply: 'Stopped, replied',
    stopped_unsub: 'Stopped, unsubscribed',
};

const StatusPill = ({ status, variant, className = '' }) => {
    const statusClass = variant || status?.toLowerCase().replace(/[\s-]/g, '');
    const label = STATUS_LABELS[String(status ?? '').toLowerCase()] ?? status;

    return (
        <span className={`status-pill ${statusClass} ${className}`}>
            {label}
        </span>
    );
};

export default StatusPill;
