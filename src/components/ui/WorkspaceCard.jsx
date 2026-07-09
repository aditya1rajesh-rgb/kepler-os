import React from 'react';
import './WorkspaceCard.css';

const WorkspaceCard = ({ workspace, onClick, variant = 'default' }) => {
    const cardClass = [
        'workspace-card',
        variant === 'kepler' ? 'workspace-card--kepler' : '',
    ].filter(Boolean).join(' ');

    return (
        <button type="button" className={cardClass} onClick={onClick}>
            <div className="card-top">
                <h3 className="workspace-name">{workspace.name}</h3>
                <span className="workspace-url">{workspace.url}</span>
            </div>

            <p className="workspace-tagline">{workspace.tagline}</p>

            <div className="brand-palette">
                {workspace.brandColors?.slice(0, 4).map((color, i) => (
                    <div
                        key={i}
                        className="color-circle"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                    />
                ))}
            </div>

            <div className="card-divider" />

            <div className="card-metadata">
                <span className="label-text">{workspace.lastActiveModule || 'No Activity'}</span>
                <span className="label-text">{workspace.brandIntelStatus}%</span>
            </div>

            <span className="workspace-card__cta btn btn-secondary full-width-btn">
                Open Workspace
            </span>
        </button>
    );
};

export default WorkspaceCard;
