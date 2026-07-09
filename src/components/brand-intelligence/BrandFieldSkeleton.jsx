import React from 'react';
import './BrandFieldSkeleton.css';

const BrandFieldSkeleton = ({ lines = 1, tall = false }) => (
    <div className="brand-field-skeleton" aria-hidden="true">
        <div className="brand-field-skeleton__label" />
        {Array.from({ length: lines }).map((_, i) => (
            <div
                key={i}
                className={`brand-field-skeleton__input${tall ? ' brand-field-skeleton__input--tall' : ''}`}
            />
        ))}
    </div>
);

export default BrandFieldSkeleton;
