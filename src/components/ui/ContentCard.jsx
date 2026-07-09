import React from 'react';
import StatusPill from './StatusPill';
import './ContentCard.css';

const ContentCard = ({
    title,
    subtitle,
    type,
    typeVariant,
    status,
    statusVariant,
    actions,
    footer,
    children,
    onClick,
    className = '',
    variant = 'default',
}) => {
    const cardClass = [
        'content-card',
        variant === 'kepler' ? 'content-card--kepler' : '',
        className,
    ].filter(Boolean).join(' ');

    return (
        <div className={cardClass} onClick={onClick}>
            <div className="card-top">
                {type && (
                    <span className={`type-tag ${typeVariant || type.toLowerCase().replace(' ', '-')}`}>
                        {type}
                    </span>
                )}
                {status && (
                    <StatusPill status={status} variant={statusVariant} />
                )}
            </div>

            <div className="card-body">
                {title && <h4 className="card-title">{title}</h4>}
                {subtitle && <p className="card-subtitle">{subtitle}</p>}
                {children}
            </div>

            {footer && <div className="card-footer">{footer}</div>}

            {actions && (
                <div className="card-actions">
                    {actions.map((action, idx) => (
                        <button
                            key={idx}
                            type="button"
                            className={`action-btn ${action.variant || ''}`}
                            onClick={(e) => { e.stopPropagation(); action.onClick(); }}
                        >
                            {action.label && <span>{action.label}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ContentCard;
