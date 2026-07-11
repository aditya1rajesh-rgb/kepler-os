import { LEARNABLE_FIELDS } from '../../services/brandLearningService';

// Reviewable "learned updates": brand-model changes mined from consistently
// high-rated generation feedback. Mirrors the competitor/ICP suggestion flow —
// nothing lands in the brand model without an explicit accept.
const LearnedUpdatesCard = ({ items = [], onAccept, onDismiss, onScan, scanning, busyId, notice }) => (
    <div className="learned-updates">
        <div className="intel-section-header">
            <div>
                <span className="brand-intel-module__source-label">Learned updates</span>
                <p className="learned-updates__hint">
                    When rated outputs keep winning, the pattern is proposed back into the brand model — for your review.
                </p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={onScan} disabled={scanning}>
                {scanning ? 'Scanning…' : 'Scan results for learnings'}
            </button>
        </div>
        {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
        {items.length > 0 && (
            <ul className="learned-updates__list">
                {items.map((s) => {
                    const p = s.payload ?? {};
                    const fieldLabel = LEARNABLE_FIELDS[p.fieldPath]?.label ?? p.fieldPath;
                    const busy = busyId === s.id;
                    return (
                        <li key={s.id} className="learned-updates__row">
                            <div className="learned-updates__main">
                                <span className="learned-updates__field">{fieldLabel} · {p.action === 'revise' ? 'revise' : 'add'}</span>
                                <span className="learned-updates__value">"{p.proposedValue}"</span>
                                {p.rationale && <span className="learned-updates__why">{p.rationale}</span>}
                                {p.evidence?.length > 0 && (
                                    <span className="learned-updates__evidence">Evidence: {p.evidence.join(' · ')}</span>
                                )}
                            </div>
                            <div className="intel-action-row">
                                <button type="button" className="btn btn-ghost" onClick={() => onDismiss(s.id)} disabled={busy}>Dismiss</button>
                                <button type="button" className="btn btn-primary" onClick={() => onAccept(s)} disabled={busy}>
                                    {busy ? 'Applying…' : 'Accept'}
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        )}
    </div>
);

export default LearnedUpdatesCard;
