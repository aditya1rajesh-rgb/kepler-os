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
                        Brand populated from {sourcesUsed.join(' + ') || 'sources'}.
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
