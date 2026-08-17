import React from 'react';
import './BrandPopulationBanner.css';

const STAGE_LABELS = {
    starting: 'Starting…',
    extracting: 'Reading website & project files…',
    'generating-overview': 'Generating business overview…',
    'generating-tagline': 'Generating tagline…',
    'generating-voice': 'Generating tone, values & aesthetic…',
    saving: 'Saving progress…',
};

/**
 * Source keys are machine values - `website:ken42.com`,
 * `file:Ken42-Institutional-Deck-2026.pdf`. Joining them with ' + ' put type
 * prefixes, a domain and file extensions into a sentence. Count them by kind
 * instead: which sources were read is the information, not their internal ids.
 */
const describeSources = (sourcesUsed = []) => {
    let website = 0;
    let files = 0;
    for (const s of sourcesUsed) {
        const kind = String(s).split(':')[0];
        if (kind === 'website') website += 1;
        else if (kind === 'file') files += 1;
    }
    const parts = [];
    if (website > 0) parts.push('your website');
    if (files > 0) parts.push(`${files} project file${files === 1 ? '' : 's'}`);
    if (parts.length === 0) return 'your sources';
    return parts.join(' and ');
};

const BrandPopulationBanner = ({
    status,
    stage = 'idle',
    errors = [],
    sourcesUsed = [],
    fieldsUpdated = 0,
    onRefresh,
    refreshing,
}) => {
    if (status === 'idle' && !onRefresh) return null;

    const isRunning = status === 'running' || refreshing;
    const stageLabel = STAGE_LABELS[stage];

    return (
        <div className={`population-banner population-banner--${status}`}>
            <div className="population-banner__content">
                {isRunning && (
                    <p className="population-banner__message">
                        <span className="population-banner__spinner" aria-hidden="true" />
                        {stageLabel || 'Analyzing website and project files to populate brand intelligence…'}
                    </p>
                )}
                {status === 'success' && !isRunning && (
                    <p className="population-banner__message">
                        Brand populated from {describeSources(sourcesUsed)}.
                        {fieldsUpdated > 0 ? ` ${fieldsUpdated} field${fieldsUpdated === 1 ? '' : 's'} updated.` : ''}
                        {' '}Review and edit values below.
                    </p>
                )}
                {status === 'partial' && !isRunning && (
                    <p className="population-banner__message">
                        Partial population complete. Some sources were unavailable.
                        {errors.length > 0 && ` ${errors[0]}`}
                    </p>
                )}
                {status === 'error' && !isRunning && (
                    <p className="population-banner__message population-banner__message--error">
                        Could not populate brand data.{errors[0] ? ` ${errors[0]}` : ''}
                    </p>
                )}
            </div>
            {onRefresh && (
                <button
                    type="button"
                    className="btn btn-secondary population-banner__action"
                    onClick={onRefresh}
                    disabled={isRunning}
                >
                    {isRunning ? 'Analyzing…' : 'Refresh from sources'}
                </button>
            )}
        </div>
    );
};

export default BrandPopulationBanner;
