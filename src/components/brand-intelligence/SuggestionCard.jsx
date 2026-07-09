import React from 'react';
import { ORIGIN_LABELS } from '../../lib/brandContracts';
import './SuggestionCard.css';

const SuggestionCard = ({ suggestion, onAccept, onDismiss, accepting }) => {
    const { type, payload, origin } = suggestion;
    const originLabel = ORIGIN_LABELS[origin] ?? 'Suggestion';

    if (type === 'competitor') {
        return (
            <div className="suggestion-card kepler-tile">
                <div className="suggestion-card__header">
                    <span className="suggestion-card__badge">{originLabel}</span>
                    <h4>{payload.name}</h4>
                    {payload.url && <span className="suggestion-card__meta">{payload.url}</span>}
                </div>
                {payload.rationale && (
                    <p className="suggestion-card__rationale">{payload.rationale}</p>
                )}
                <div className="suggestion-card__actions">
                    <button type="button" className="btn btn-primary" onClick={onAccept} disabled={accepting}>
                        Accept
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={onDismiss} disabled={accepting}>
                        Dismiss
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="suggestion-card kepler-tile">
            <div className="suggestion-card__header">
                <span className="suggestion-card__badge">{originLabel}</span>
                <h4>{payload.role}</h4>
            </div>
            {payload.titles?.length > 0 && (
                <p className="suggestion-card__meta">Titles: {payload.titles.join(', ')}</p>
            )}
            {payload.painPoints && (
                <p className="suggestion-card__rationale">{payload.painPoints}</p>
            )}
            {payload.rationale && (
                <p className="suggestion-card__rationale suggestion-card__rationale--muted">
                    {payload.rationale}
                </p>
            )}
            <div className="suggestion-card__actions">
                <button type="button" className="btn btn-primary" onClick={onAccept} disabled={accepting}>
                    Accept as ICP
                </button>
                <button type="button" className="btn btn-secondary" onClick={onDismiss} disabled={accepting}>
                    Dismiss
                </button>
            </div>
        </div>
    );
};

export default SuggestionCard;
