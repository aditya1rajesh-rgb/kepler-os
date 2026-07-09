import React from 'react';
import ProvenanceLabel from './ProvenanceLabel';
import BrandFieldSkeleton from './BrandFieldSkeleton';
import {
    EMPTY_BUSINESS_DETAILS,
    BUSINESS_DETAILS_TAB_SCALAR_KEYS,
    BUSINESS_DETAILS_LEGACY_KEYS,
} from '../../lib/brandContracts';
import './BusinessDetailsPanel.css';

const ChipAdder = ({ placeholder, onAdd }) => {
    const [value, setValue] = React.useState('');
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value);
        setValue('');
    };
    return (
        <form className="chip-adder" onSubmit={handleSubmit}>
            <input
                type="text"
                className="intel-input chip-adder__input"
                placeholder={placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary chip-adder__btn">Add</button>
        </form>
    );
};

const SCALAR_LABELS = {
    offersProducts: 'Offers / products',
    offerDescriptions: 'Offer descriptions',
    differentiators: 'Differentiators',
    painPointsSolved: 'Pain points solved',
};

const LEGACY_LABELS = {
    industry: 'Industry',
    productsServices: 'Products & services (legacy)',
    targetMarket: 'Target market',
    valueProposition: 'Value proposition',
    companySize: 'Company size',
    geographicFocus: 'Geographic focus',
};

const highConfidenceProofPoints = (proofPoints = []) =>
    proofPoints.filter((p) => p?.confidence === 'high' && p?.text?.trim());

const BusinessDetailsPanel = ({
    source,
    businessDetails,
    provenance = {},
    editing,
    loading = false,
    onScalarChange,
    onOverviewScalarChange,
    onAddListItem,
    onRemoveListItem,
    onProofPointAdd,
    onProofPointRemove,
    renderChips,
}) => {
    const details = businessDetails ?? EMPTY_BUSINESS_DETAILS;
    const hasLegacyData = BUSINESS_DETAILS_LEGACY_KEYS.some((key) => {
        const val = details[key];
        return Array.isArray(val) ? val.length > 0 : Boolean(val?.trim?.());
    });

    if (loading) {
        return (
            <div className="business-details-panel business-details-panel--loading">
                {Array.from({ length: 8 }).map((_, i) => (
                    <BrandFieldSkeleton key={i} lines={1} tall={i === 1 || i === 3} />
                ))}
            </div>
        );
    }

    return (
        <div className="business-details-panel">
            <div className="data-section">
                <label className="data-label">Tagline</label>
                {editing ? (
                    <input
                        className="intel-input"
                        value={source.tagline ?? ''}
                        onChange={(e) => onOverviewScalarChange('tagline', e.target.value)}
                    />
                ) : (
                    <p className="intel-readonly-value">{source.tagline || 'Not set'}</p>
                )}
                <ProvenanceLabel entry={provenance.tagline} />
            </div>

            <div className="data-section">
                <label className="data-label">Business overview</label>
                {editing ? (
                    <textarea
                        className="intel-textarea"
                        value={source.overview ?? ''}
                        onChange={(e) => onOverviewScalarChange('overview', e.target.value)}
                    />
                ) : (
                    <p className="intel-readonly-value intel-readonly-value--block">
                        {source.overview || 'Not set'}
                    </p>
                )}
                <ProvenanceLabel entry={provenance.overview} />
            </div>

            {BUSINESS_DETAILS_TAB_SCALAR_KEYS.map((key) => (
                <div key={key} className="data-section">
                    <label className="data-label">{SCALAR_LABELS[key]}</label>
                    {editing ? (
                        key === 'offerDescriptions' ? (
                            <textarea
                                className="intel-textarea"
                                value={details[key] ?? ''}
                                onChange={(e) => onScalarChange(key, e.target.value)}
                            />
                        ) : (
                            <input
                                className="intel-input"
                                value={details[key] ?? ''}
                                onChange={(e) => onScalarChange(key, e.target.value)}
                            />
                        )
                    ) : (
                        <p className={`intel-readonly-value${key === 'offerDescriptions' ? ' intel-readonly-value--block' : ''}`}>
                            {details[key] || 'Not set'}
                        </p>
                    )}
                    <ProvenanceLabel entry={provenance[`businessDetails.${key}`]} />
                </div>
            ))}

            <div className="data-section">
                <label className="data-label">Proof points / approved stats</label>
                {editing ? (
                    <>
                        <div className="chip-container">
                            {(details.proofPoints ?? []).length === 0 ? (
                                <p className="brand-intel-module__empty">None</p>
                            ) : (details.proofPoints ?? []).map((point, i) => (
                                <span key={`${point.text}-${i}`} className="intel-chip">
                                    {point.text}
                                    {point.confidence !== 'high' && (
                                        <span className="proof-point-chip__flag"> unverified</span>
                                    )}
                                    <button
                                        type="button"
                                        className="intel-chip__remove"
                                        onClick={() => onProofPointRemove(i)}
                                        aria-label={`Remove ${point.text}`}
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                        <ChipAdder
                            placeholder="Add proof point (exact stat from source)"
                            onAdd={onProofPointAdd}
                        />
                    </>
                ) : (
                    <div className="chip-container">
                        {highConfidenceProofPoints(details.proofPoints).length === 0 ? (
                            <p className="brand-intel-module__empty">
                                No verified proof points yet. Stats must be explicitly sourced.
                            </p>
                        ) : highConfidenceProofPoints(details.proofPoints).map((point, i) => (
                            <span key={`${point.text}-${i}`} className="intel-chip">{point.text}</span>
                        ))}
                    </div>
                )}
                <ProvenanceLabel entry={provenance['businessDetails.proofPoints']} />
            </div>

            <div className="data-section">
                <label className="data-label">Brand values</label>
                <div className="chip-container">
                    {(source.values ?? []).length === 0 ? (
                        <p className="brand-intel-module__empty">No values yet.</p>
                    ) : renderChips(
                        source.values,
                        editing ? (i) => onRemoveListItem('values', i) : null
                    )}
                </div>
                <ProvenanceLabel entry={provenance.values} />
                {editing && (
                    <ChipAdder placeholder="Add value" onAdd={(v) => onAddListItem('values', v)} />
                )}
            </div>

            <div className="data-section">
                <label className="data-label">Voice / tone</label>
                <div className="chip-container">
                    {(source.tone ?? []).length === 0 ? (
                        <p className="brand-intel-module__empty">No tone defined yet.</p>
                    ) : renderChips(
                        source.tone,
                        editing ? (i) => onRemoveListItem('tone', i) : null
                    )}
                </div>
                <ProvenanceLabel entry={provenance.tone} />
                {editing && (
                    <ChipAdder placeholder="Add tone" onAdd={(v) => onAddListItem('tone', v)} />
                )}
            </div>

            <div className="data-section">
                <label className="data-label">Aesthetic / creative tags</label>
                <div className="chip-container">
                    {(source.aesthetic ?? []).length === 0 ? (
                        <p className="brand-intel-module__empty">No aesthetic tags yet.</p>
                    ) : renderChips(
                        source.aesthetic,
                        editing ? (i) => onRemoveListItem('aesthetic', i) : null
                    )}
                </div>
                <ProvenanceLabel entry={provenance.aesthetic} />
                {editing && (
                    <ChipAdder placeholder="Add aesthetic tag" onAdd={(v) => onAddListItem('aesthetic', v)} />
                )}
            </div>

            {hasLegacyData && (
                <div className="business-details-panel__legacy">
                    <span className="brand-intel-module__source-label">Additional context</span>
                    {BUSINESS_DETAILS_LEGACY_KEYS.map((key) => {
                        const val = details[key];
                        const hasVal = Array.isArray(val) ? val.length > 0 : Boolean(val?.trim?.());
                        if (!hasVal) return null;
                        return (
                            <div key={key} className="data-section">
                                <label className="data-label">{LEGACY_LABELS[key] ?? key}</label>
                                {Array.isArray(val) ? (
                                    <div className="chip-container">
                                        {val.map((m, i) => <span key={i} className="intel-chip">{m}</span>)}
                                    </div>
                                ) : (
                                    <p className="intel-readonly-value">{val}</p>
                                )}
                                <ProvenanceLabel entry={provenance[`businessDetails.${key}`]} />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default BusinessDetailsPanel;
