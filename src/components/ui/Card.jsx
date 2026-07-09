import React from 'react';
import './Card.css';

const Card = ({ children, className = '', ...props }) => {
    return (
        <div
            className={`ai-card ${className}`}
            {...props}
        >
            {children}
        </div>
    );
};

export const CardHeader = ({ title, subtitle, action }) => (
    <div className="ai-card-header">
        <div>
            {title && <h3 className="ai-card-title">{title}</h3>}
            {subtitle && <p className="ai-card-subtitle">{subtitle}</p>}
        </div>
        {action && <div className="ai-card-action">{action}</div>}
    </div>
);

export const CardContent = ({ children, noPadding = false }) => (
    <div className={`ai-card-content ${noPadding ? 'no-padding' : ''}`}>
        {children}
    </div>
);

export default Card;
