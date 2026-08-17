import React, { useState } from 'react';
import CompetitorSuggestionCard from './CompetitorSuggestionCard';
import BrandFieldSkeleton from './BrandFieldSkeleton';
import { retryLabelForKind, blocksRetry, ADD_SOURCES_LABEL } from '../../lib/sectionGenerate';

const SectionGenerateControl = ({ status = {}, onGenerate, idleLabel = 'Generate', disabled, onAddSources }) => {
    if (!onGenerate) return null;
    const state = status.status ?? 'idle';
    const isRunning = state === 'running';
    const blockRetry = blocksRetry(state, status.errorKind);
    return (
        <span className="brand-section-control">
            {/* The button already says "Generating…" while running. */}
            {state === 'done' && (
                <span className="brand-section-control__status brand-section-control__status--done">Updated</span>
            )}
            {state === 'error' && (
                <span className="brand-section-control__status brand-section-control__status--error" role="alert">
                    {status.error || 'Generation failed'}
                </span>
            )}
            {blockRetry ? (
                onAddSources && (
                    <button type="button" className="btn btn-ghost" onClick={onAddSources}>
                        {ADD_SOURCES_LABEL}
                    </button>
                )
            ) : (
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onGenerate}
                    disabled={disabled || isRunning}
                >
                    {isRunning ? 'Generating…' : state === 'error' ? retryLabelForKind(status.errorKind) : idleLabel}
                </button>
            )}
        </span>
    );
};

const CompetitorIntelligencePanel = ({
    competitorSuggestions = [],
    competitors = [],
    selectedComp,
    onSelectComp,
    loading = false,
    newCompName,
    newCompUrl,
    onNewCompNameChange,
    onNewCompUrlChange,
    onAddCompetitor,
    onRemoveCompetitor,
    onAcceptSuggestion,
    onDismissSuggestion,
    onEditSuggestion,
    onUpdateCompetitor,
    acceptingId,
    editingSuggestionId,
    discoveryStatus = {},
    onGenerateCompetitors,
    enrichmentStatus = {},
    onEnrichCompetitor,
}) => {
    const [editingComp, setEditingComp] = useState(false);
    const [compDraft, setCompDraft] = useState({ name: '', url: '', notes: '' });
    const [savingComp, setSavingComp] = useState(false);

    const startEditComp = () => {
        if (!selectedComp) return;
        setCompDraft({
            name: selectedComp.name ?? '',
            url: selectedComp.url ?? '',
            notes: selectedComp.notes ?? '',
        });
        setEditingComp(true);
    };

    const handleSaveComp = async () => {
        if (!selectedComp || !compDraft.name.trim()) return;
        setSavingComp(true);
        try {
            await onUpdateCompetitor(selectedComp.id, {
                name: compDraft.name.trim(),
                url: compDraft.url.trim(),
                notes: compDraft.notes.trim(),
                confirmed: true,
            });
            setEditingComp(false);
        } finally {
            setSavingComp(false);
        }
    };

    if (loading) {
        return (
            <div className="intel-view-root competitor-panel--loading">
                <BrandFieldSkeleton />
                <BrandFieldSkeleton />
            </div>
        );
    }

    const hasSuggestions = competitorSuggestions.length > 0;
    const hasConfirmed = competitors.length > 0;
    const showEmpty = !hasSuggestions && !hasConfirmed;

    return (
        <div className="intel-view-root">
            <div className="intel-section-header">
                <span className="brand-intel-module__source-label">Competitor discovery</span>
                <SectionGenerateControl
                    status={discoveryStatus}
                    onGenerate={onGenerateCompetitors}
                    idleLabel="Generate competitors"
                />
            </div>

            {showEmpty && (
                <p className="brand-intel-module__empty brand-intel-module__empty--banner">
                    No competitor suggestions yet. Use “Generate competitors” above after adding a website URL
                    or project files, or add a competitor manually below.
                </p>
            )}

            {hasSuggestions && (
                <section className="competitor-panel__section">
                    <p className="suggestion-list__heading">Suggested competitors</p>
                    <div className="suggestion-list">
                        {competitorSuggestions.map((s) => (
                            <CompetitorSuggestionCard
                                key={s.id}
                                suggestion={s}
                                accepting={acceptingId === s.id}
                                saving={editingSuggestionId === s.id}
                                onAccept={() => onAcceptSuggestion(s)}
                                onDismiss={() => onDismissSuggestion(s.id)}
                                onSaveEdit={(payload) => onEditSuggestion(s.id, payload)}
                            />
                        ))}
                    </div>
                </section>
            )}

            <div className="competitor-split">
                <div className="comp-list-panel">
                    <label className="data-label">Confirmed competitors</label>
                    {!hasConfirmed && (
                        <p className="brand-intel-module__empty">No confirmed competitors yet.</p>
                    )}
                    {competitors.map((c) => (
                        <div
                            key={c.id}
                            className={`comp-row kepler-tile ${selectedComp?.id === c.id ? 'kepler-nav-active selected' : ''}`}
                            onClick={() => {
                                setEditingComp(false);
                                onSelectComp(c);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && onSelectComp(c)}
                            role="button"
                            tabIndex={0}
                        >
                            <div className="comp-info-small">
                                <h4>{c.name}</h4>
                                <span>{c.url || 'No URL'}</span>
                            </div>
                            <button
                                type="button"
                                className="btn-destructive"
                                onClick={(e) => { e.stopPropagation(); onRemoveCompetitor(c.id); }}
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                    <div className="data-section comp-list-panel__footer">
                        <label className="data-label">Add manually</label>
                        <div className="comp-add-row">
                            <input
                                type="text"
                                className="intel-input"
                                placeholder="Competitor name"
                                value={newCompName}
                                onChange={(e) => onNewCompNameChange(e.target.value)}
                            />
                            <input
                                type="text"
                                className="intel-input"
                                placeholder="competitor.com"
                                value={newCompUrl}
                                onChange={(e) => onNewCompUrlChange(e.target.value)}
                            />
                            <button type="button" className="btn btn-secondary" onClick={onAddCompetitor}>
                                Add
                            </button>
                        </div>
                    </div>
                </div>

                <div className="comp-detail-panel">
                    {selectedComp ? (
                        <>
                            <div className="intel-section-header">
                                <span className="brand-intel-module__source-label">Competitor details</span>
                                {!editingComp ? (
                                    <button type="button" className="btn btn-secondary" onClick={startEditComp}>
                                        Edit
                                    </button>
                                ) : (
                                    <div className="intel-action-row">
                                        <button type="button" className="btn btn-secondary" onClick={() => setEditingComp(false)} disabled={savingComp}>
                                            Cancel
                                        </button>
                                        <button type="button" className="btn btn-primary" onClick={handleSaveComp} disabled={savingComp}>
                                            {savingComp ? 'Saving…' : 'Save'}
                                        </button>
                                    </div>
                                )}
                            </div>
                            {editingComp ? (
                                <div className="form-stack">
                                    <input
                                        className="intel-input"
                                        value={compDraft.name}
                                        onChange={(e) => setCompDraft({ ...compDraft, name: e.target.value })}
                                    />
                                    <input
                                        className="intel-input"
                                        placeholder="URL"
                                        value={compDraft.url}
                                        onChange={(e) => setCompDraft({ ...compDraft, url: e.target.value })}
                                    />
                                    <textarea
                                        className="intel-textarea"
                                        placeholder="Notes"
                                        value={compDraft.notes}
                                        onChange={(e) => setCompDraft({ ...compDraft, notes: e.target.value })}
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className="data-section">
                                        <label className="data-label">Name</label>
                                        <p className="intel-readonly-value">{selectedComp.name}</p>
                                    </div>
                                    <div className="data-section">
                                        <label className="data-label">URL</label>
                                        <p className="intel-readonly-value">{selectedComp.url || 'Not set'}</p>
                                    </div>
                                    <div className="data-section">
                                        <label className="data-label">Reason / messaging notes</label>
                                        <p className="intel-readonly-value">{selectedComp.notes || 'No notes saved.'}</p>
                                    </div>
                                    <div className="data-section">
                                        <label className="data-label">Messaging summary</label>
                                        <SectionGenerateControl
                                            status={enrichmentStatus}
                                            onGenerate={() => onEnrichCompetitor?.(selectedComp)}
                                            idleLabel="Generate messaging summary"
                                            disabled={!onEnrichCompetitor}
                                        />
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <p className="brand-intel-module__empty">
                            Accept a suggestion or add a competitor to view details.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CompetitorIntelligencePanel;
