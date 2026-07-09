import React, { useState } from 'react';
import { ORIGIN_LABELS } from '../../lib/brandContracts';
import { icpPayloadToDraft, icpDraftToPayload } from '../../lib/icpContracts';
import './SuggestionCard.css';

const confidenceLabel = (confidence) => {
    if (confidence === 'high') return 'High confidence';
    if (confidence === 'medium') return 'Medium confidence';
    return 'Low confidence';
};

const Field = ({ label, value }) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return null;
    return (
        <div className="icp-suggestion__field">
            <span className="icp-suggestion__field-label">{label}</span>
            {Array.isArray(value) ? (
                <div className="chip-container">
                    {value.map((v, i) => <span key={i} className="intel-chip">{v}</span>)}
                </div>
            ) : (
                <p className="icp-suggestion__field-value">{value}</p>
            )}
        </div>
    );
};

const IcpSuggestionCard = ({ suggestion, onAccept, onDismiss, onSaveEdit, accepting, saving }) => {
    const { payload, origin } = suggestion;
    const sourceOrigin = payload.sourceOrigin ?? origin ?? 'ai';
    const originLabel = ORIGIN_LABELS[sourceOrigin] ?? 'Suggested';
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(() => icpPayloadToDraft(payload));

    const startEdit = () => {
        setDraft(icpPayloadToDraft(payload));
        setEditing(true);
    };

    const handleSave = async () => {
        const normalized = icpDraftToPayload(draft);
        if (!normalized) return;
        await onSaveEdit({ ...normalized, userEdited: true });
        setEditing(false);
    };

    const setField = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

    if (editing) {
        return (
            <div className="suggestion-card icp-suggestion kepler-tile">
                <span className="suggestion-card__badge">Editing suggestion</span>
                <input className="intel-input" placeholder="Segment" value={draft.segment} onChange={setField('segment')} />
                <input className="intel-input" placeholder="Role / title" value={draft.role} onChange={setField('role')} />
                <input className="intel-input" placeholder="Job titles (comma-separated)" value={draft.titles} onChange={setField('titles')} />
                <input className="intel-input" placeholder="Company type" value={draft.companyType} onChange={setField('companyType')} />
                <input className="intel-input" placeholder="Geography" value={draft.geography} onChange={setField('geography')} />
                <textarea className="intel-textarea icp-suggestion__edit" placeholder="Primary pains" value={draft.primaryPains} onChange={setField('primaryPains')} />
                <textarea className="intel-textarea icp-suggestion__edit" placeholder="Triggers" value={draft.triggers} onChange={setField('triggers')} />
                <textarea className="intel-textarea icp-suggestion__edit" placeholder="Blockers / objections" value={draft.blockers} onChange={setField('blockers')} />
                <textarea className="intel-textarea icp-suggestion__edit" placeholder="Buying context" value={draft.buyingContext} onChange={setField('buyingContext')} />
                <input className="intel-input" placeholder="Messaging hooks (comma-separated)" value={draft.messagingHooks} onChange={setField('messagingHooks')} />
                <input className="intel-input" placeholder="Preferred channels (comma-separated)" value={draft.channels} onChange={setField('channels')} />
                <div className="suggestion-card__actions">
                    <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
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
        <div className="suggestion-card icp-suggestion kepler-tile">
            <div className="suggestion-card__header">
                <div className="suggestion-card__meta-row">
                    <span className="suggestion-card__badge">{originLabel}</span>
                    {payload.confidence && (
                        <span className="suggestion-card__confidence">{confidenceLabel(payload.confidence)}</span>
                    )}
                </div>
                <h4>{payload.segment || payload.role}</h4>
                {payload.role && payload.role !== payload.segment && (
                    <span className="suggestion-card__meta">{payload.role}</span>
                )}
            </div>

            <Field label="Job titles" value={payload.titles} />
            <Field label="Company type" value={payload.companyType} />
            <Field label="Geography" value={payload.geography} />
            <Field label="Primary pains" value={payload.primaryPains || payload.painPoints} />
            <Field label="Triggers" value={payload.triggers} />
            <Field label="Blockers" value={payload.blockers} />
            <Field label="Buying context" value={payload.buyingContext} />
            <Field label="Messaging hooks" value={payload.messagingHooks} />
            <Field label="Channels" value={payload.channels} />
            {payload.rationale && (
                <p className="suggestion-card__rationale suggestion-card__rationale--muted">{payload.rationale}</p>
            )}

            <div className="suggestion-card__actions">
                <button type="button" className="btn btn-primary" onClick={onAccept} disabled={accepting}>
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

export default IcpSuggestionCard;
