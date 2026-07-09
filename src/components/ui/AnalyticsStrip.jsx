import React from 'react';
import './AnalyticsStrip.css';

const AnalyticsStrip = ({ stats, variant = 'default', className = '' }) => {
    const stripClass = [
        'analytics-strip-kepler',
        variant === 'kepler' ? 'analytics-strip-kepler--tiles' : '',
        className,
    ].filter(Boolean).join(' ');

    return (
        <div className={stripClass}>
            {stats.map((stat, index) => (
                <div key={index} className="stat-item-kepler">
                    <span className="stat-value">{stat.value}</span>
                    <span className="stat-label-kepler">{stat.label}</span>
                </div>
            ))}
        </div>
    );
};

export default AnalyticsStrip;
