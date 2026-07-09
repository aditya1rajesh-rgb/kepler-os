import { useState } from 'react';

// 5-star rating with a learning loop. Ratings of 3+ submit immediately; ratings
// under 3 reveal a required improvement box whose note is stored and fed into the
// next generation (see feedbackService). onSubmit(rating, improvement) should
// persist the feedback and resolve.

const STAR = { fontSize: 20, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' };

const RatingControl = ({ onSubmit, label = 'Rate this output' }) => {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [improvement, setImprovement] = useState('');
    const [busy, setBusy] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [err, setErr] = useState('');

    const needsNote = rating > 0 && rating < 3;

    const submit = async (r, note) => {
        setBusy(true);
        setErr('');
        try {
            await onSubmit(r, note);
            setSubmitted(true);
        } catch {
            setErr('Could not save feedback.');
        } finally {
            setBusy(false);
        }
    };

    const pick = (r) => {
        setRating(r);
        if (r >= 3) submit(r, ''); // 3+ submits immediately; <3 waits for the note
    };

    if (submitted) return <span className="label-text">Thanks - feedback saved ✓</span>;

    return (
        <div className="rating-control" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="label-text">{label}</span>
                <div onMouseLeave={() => setHover(0)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                        <button
                            key={n}
                            type="button"
                            style={{ ...STAR, color: n <= (hover || rating) ? '#f5b301' : 'rgba(160,160,180,0.45)' }}
                            onMouseEnter={() => setHover(n)}
                            onClick={() => pick(n)}
                            disabled={busy}
                            aria-label={`${n} star${n > 1 ? 's' : ''}`}
                        >
                            ★
                        </button>
                    ))}
                </div>
            </div>
            {needsNote && (
                <div className="rating-improve" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <textarea
                        className="intel-textarea"
                        placeholder="What should improve next time? (required - this is fed into future generations)"
                        value={improvement}
                        onChange={(e) => setImprovement(e.target.value)}
                    />
                    <button type="button" className="btn btn-secondary" disabled={busy || !improvement.trim()} onClick={() => submit(rating, improvement.trim())}>
                        {busy ? 'Saving…' : 'Submit feedback'}
                    </button>
                </div>
            )}
            {err && <span className="brand-intel-module__error">{err}</span>}
        </div>
    );
};

export default RatingControl;
