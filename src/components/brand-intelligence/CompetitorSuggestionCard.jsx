import React, { useState } from 'react';
import { ORIGIN_LABELS } from '../../lib/brandContracts';
import { EMPTY_COMPETITOR_SUGGESTION_DRAFT } from '../../lib/competitorContracts';
import './SuggestionCard.css';

const confidenceLabel = (confidence) => {
    if (confidence === 'high') return 'High confidence';
    if (confidence === 'medium') return 'Medium confidence';
    return 'Low confidence';
};

const CompetitorSuggestionCard = ({
    suggestion,
    onAccept,
    onDismiss,
    onSaveEdit,
    accepting,
    saving,
}) => {
    const { payload, origin } = suggestion;
    const sourceOrigin = payload.sourceOrigin ?? origin ?? 'ai';
    const originLabel = ORIGIN_LABELS[sourceOrigin] ?? 'Suggested';
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(EMPTY_COMPETITOR_SUGGESTION_DRAFT);

    const startEdit = () => {
        setDraft({
            name: payload.name ?? '',
            url: payload.url ?? '',
            reasonSuggested: payload.reasonSuggested ?? payload.rationale ?? '',
        });
        setEditing(true);
    };

    const handleSave = async () => {
        if (!draft.name.trim()) return;
        await onSaveEdit({
            name: draft.name.trim(),
            url: draft.url.trim(),
            reasonSuggested: draft.reasonSuggested.trim(),
            rationale: draft.reasonSuggested.trim(),
            userEdited: true,
            sourceOrigin: payload.sourceOrigin ?? origin,
            confidence: payload.confidence ?? 'medium',
            messagingSummary: payload.messagingSummary ?? '',
        });
        setEditing(false);
    };

    if (editing) {
        return (
            <div className="suggestion-card kepler-tile">
                <span className="suggestion-card__badge">Editing suggestion</span>
                <input
                    className="intel-input"
                    placeholder="Competitor name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <input
                    className="intel-input"
                    placeholder="competitor.com"
                    value={draft.url}
                    onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                />
                <textarea
                    className="intel-textarea suggestion-card__edit-notes"
                    placeholder="Why is this a competitor?"
                    value={draft.reasonSuggested}
                    onChange={(e) => setDraft({ ...draft, reasonSuggested: e.target.value })}
                />
                <div className="suggestion-card__actions">
                    <button type="button" className="btn btn-secondary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} disabled={saving}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="suggestion-card kepler-tile">
            <div className="suggestion-card__header">
                <div className="suggestion-card__meta-row">
                    <span className="suggestion-card__badge">{originLabel}</span>
                    {payload.confidence && (
                        <span className="suggestion-card__confidence">
                            {confidenceLabel(payload.confidence)}
                        </span>
                    )}
                </div>
                <h4>{payload.name}</h4>
                {payload.url && <span className="suggestion-card__meta">{payload.url}</span>}
            </div>
            {(payload.reasonSuggested || payload.rationale) && (
                <p className="suggestion-card__rationale">
                    {payload.reasonSuggested || payload.rationale}
                </p>
            )}
            {payload.messagingSummary ? (
                <p className="suggestion-card__rationale suggestion-card__rationale--muted">
                    {payload.messagingSummary}
                </p>
            ) : (
                <p className="suggestion-card__placeholder">Messaging summary: available after enrichment</p>
            )}
            <div className="suggestion-card__actions">
                <button type="button" className="btn btn-secondary" onClick={onAccept} disabled={accepting}>
                    {accepting ? 'Accepting…' : 'Accept'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={startEdit} disabled={accepting}>
                    Edit
                </button>
                <button type="button" className="btn btn-secondary" onClick={onDismiss} disabled={accepting}>
                    Dismiss
                </button>
            </div>
        </div>
    );
};

export default CompetitorSuggestionCard;
