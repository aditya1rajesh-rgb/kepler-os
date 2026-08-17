import React from 'react';
import ProvenanceLabel from './ProvenanceLabel';
import BrandColorsPanel from './BrandColorsPanel';
import BrandFieldSkeleton from './BrandFieldSkeleton';
import { EMPTY_COLOR_IDENTITY } from '../../lib/brandContracts';
import { retryLabelForKind, blocksRetry, ADD_SOURCES_LABEL } from '../../lib/sectionGenerate';
import './BrandOverviewPanel.css';

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

const SectionAction = ({ section, status = {}, onGenerate, disabled, onAddSources }) => {
    if (!onGenerate) return null;
    const state = status.status ?? 'idle';
    const isRunning = state === 'running';
    // Insufficient context cannot be fixed by re-spending a credit on the same
    // request, so there is no retry for it - there is a route to the sources.
    const blockRetry = blocksRetry(state, status.errorKind);
    return (
        // `intel-section-action` anchors this to its field's label row (see
        // BrandIntelligence.css); `is-running` keeps it visible mid-generation
        // even after the pointer leaves the field.
        <div className={`brand-section-action intel-section-action ${state !== 'idle' ? 'is-running' : ''}`.trim()}>
            {/* Nothing while running: the button itself reads "Generating…". */}
            {state === 'done' && (
                <span className="brand-section-action__status brand-section-action__status--done">Updated</span>
            )}
            {state === 'error' && (
                <span className="brand-section-action__status brand-section-action__status--error" role="alert">
                    {status.error || 'Generation failed'}
                </span>
            )}
            {blockRetry ? (
                onAddSources && (
                    <button
                        type="button"
                        className="btn btn-ghost brand-section-action__btn"
                        onClick={onAddSources}
                    >
                        {ADD_SOURCES_LABEL}
                    </button>
                )
            ) : (
                <button
                    type="button"
                    className="btn btn-secondary brand-section-action__btn"
                    onClick={() => onGenerate(section)}
                    disabled={disabled || isRunning}
                >
                    {isRunning ? 'Generating…' : state === 'error' ? retryLabelForKind(status.errorKind) : 'Generate'}
                </button>
            )}
        </div>
    );
};

const BrandOverviewPanel = ({
    source,
    provenance = {},
    editing,
    loading = false,
    lowConfidence = false,
    sectionStatus = {},
    onGenerateSection,
    onAddSources,
    onTaglineChange,
    onOverviewChange,
    onColorIdentityChange,
    renderChips,
    onAddListItem,
    onRemoveListItem,
}) => {
    const colorIdentity = source.colorIdentity ?? EMPTY_COLOR_IDENTITY;
    // Per-section generate/retry controls are shown when not in manual edit mode.
    const showSectionActions = !editing && Boolean(onGenerateSection);

    if (loading) {
        return (
            <div className="brand-overview-panel brand-overview-panel--loading">
                <div className="two-col-layout">
                    <div className="col-60 form-stack">
                        <BrandFieldSkeleton />
                        <BrandFieldSkeleton />
                        <BrandFieldSkeleton />
                        <BrandFieldSkeleton lines={1} tall />
                    </div>
                    <div className="col-40 form-stack">
                        <BrandFieldSkeleton />
                        <BrandFieldSkeleton />
                        <BrandFieldSkeleton />
                    </div>
                </div>
                <BrandColorsPanel loading />
            </div>
        );
    }

    return (
        <div className="brand-overview-panel">
            <div className="two-col-layout">
                <div className="col-60 form-stack">
                    <div className="data-section">
                        <label className="data-label">Brand Name</label>
                        <input type="text" className="intel-input" value={source.name} readOnly />
                        <ProvenanceLabel entry={{ origin: 'workspace' }} />
                    </div>
                    <div className="data-section">
                        <label className="data-label">Website URL</label>
                        <input type="text" className="intel-input" value={source.url} readOnly />
                        <ProvenanceLabel entry={{ origin: 'workspace' }} />
                    </div>
                    <div className="data-section">
                        <label className="data-label">Tagline</label>
                        <input
                            type="text"
                            className="intel-input"
                            value={source.tagline}
                            readOnly={!editing}
                            placeholder={editing ? 'Add a tagline' : 'Not set'}
                            onChange={(e) => onTaglineChange(e.target.value)}
                        />
                        <ProvenanceLabel entry={provenance.tagline} />
                        {showSectionActions && (
                            <SectionAction section="tagline" status={sectionStatus.tagline} onGenerate={onGenerateSection} onAddSources={onAddSources} />
                        )}
                    </div>
                    <div className="data-section">
                        <label className="data-label">Business Overview</label>
                        <textarea
                            className="intel-textarea"
                            value={source.overview}
                            readOnly={!editing}
                            placeholder={editing ? 'Describe what this business does' : 'Not set'}
                            onChange={(e) => onOverviewChange(e.target.value)}
                        />
                        <ProvenanceLabel entry={provenance.overview} />
                        {showSectionActions && (
                            <SectionAction section="overview" status={sectionStatus.overview} onGenerate={onGenerateSection} onAddSources={onAddSources} />
                        )}
                    </div>
                </div>

                <div className="col-40 form-stack">
                    <div className="data-section">
                        <label className="data-label">Brand Values</label>
                        <div className="chip-container">
                            {source.values.length === 0 ? (
                                <p className="brand-intel-module__empty">No values yet.</p>
                            ) : renderChips(source.values, editing ? (i) => onRemoveListItem('values', i) : null)}
                        </div>
                        <ProvenanceLabel entry={provenance.values} />
                        {editing && (
                            <ChipAdder placeholder="Add value" onAdd={(v) => onAddListItem('values', v)} />
                        )}
                        {showSectionActions && (
                            <SectionAction section="style" status={sectionStatus.style} onGenerate={onGenerateSection} onAddSources={onAddSources} />
                        )}
                    </div>
                    <div className="data-section">
                        <label className="data-label">Aesthetic</label>
                        <div className="chip-container">
                            {source.aesthetic.length === 0 ? (
                                <p className="brand-intel-module__empty">No aesthetic tags yet.</p>
                            ) : renderChips(source.aesthetic, editing ? (i) => onRemoveListItem('aesthetic', i) : null)}
                        </div>
                        <ProvenanceLabel entry={provenance.aesthetic} />
                        {editing && (
                            <ChipAdder placeholder="Add aesthetic tag" onAdd={(v) => onAddListItem('aesthetic', v)} />
                        )}
                    </div>
                    <div className="data-section">
                        <label className="data-label">Brand Voice / Tone</label>
                        <div className="chip-container">
                            {source.tone.length === 0 ? (
                                <p className="brand-intel-module__empty">No tone defined yet.</p>
                            ) : renderChips(source.tone, editing ? (i) => onRemoveListItem('tone', i) : null)}
                        </div>
                        <ProvenanceLabel entry={provenance.tone} />
                        {editing && (
                            <ChipAdder placeholder="Add tone" onAdd={(v) => onAddListItem('tone', v)} />
                        )}
                        {showSectionActions && (
                            <SectionAction section="tone" status={sectionStatus.tone} onGenerate={onGenerateSection} onAddSources={onAddSources} />
                        )}
                    </div>
                </div>
            </div>

            {showSectionActions && (
                <div className="brand-section-action brand-section-action--colors">
                    <SectionAction section="colors" status={sectionStatus.colors} onGenerate={onGenerateSection} onAddSources={onAddSources} />
                </div>
            )}

            <BrandColorsPanel
                colorIdentity={colorIdentity}
                fieldProvenance={provenance}
                editing={editing}
                onChange={onColorIdentityChange}
                lowConfidence={lowConfidence}
            />
        </div>
    );
};

export default BrandOverviewPanel;
