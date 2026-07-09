import './EmptyState.css';

/**
 * Shared empty / loading state - standardizes the ad-hoc `.module-empty-state`
 * text scattered across modules. Pass `loading` for a spinner + message.
 *
 * @param {string} message
 * @param {boolean} [loading]
 * @param {React.ReactNode} [action] optional CTA under the message
 * @param {string} [className]
 */
const EmptyState = ({ message, loading = false, action = null, className = '' }) => (
    <div className={`empty-state ${loading ? 'empty-state--loading' : ''} ${className}`.trim()}>
        {loading && <span className="empty-state__spinner" aria-hidden="true" />}
        <p className="empty-state__message">{message}</p>
        {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
);

export default EmptyState;
