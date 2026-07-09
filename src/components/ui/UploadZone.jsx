import React from 'react';
import './UploadZone.css';

const UploadZone = ({ title, subtitle, onBrowse, className = '' }) => {
    return (
        <div className={`upload-zone ${className}`} onClick={onBrowse}>
            <p>{title || 'Drop files or click to upload'}</p>
            {subtitle && <p className="upload-subtitle">{subtitle}</p>}
        </div>
    );
};

export default UploadZone;
