import React from 'react';
import { X, Type } from '../../lib/icons';
import './TagChip.css';

const TagChip = ({ label, variant = 'default', onRemove, icon: Icon }) => {
    return (
        <span className={`intel-chip ${variant}`}>
            {Icon && <Icon size={12} />}
            {label}
            {onRemove && <X size={12} className="remove-chip" onClick={onRemove} />}
        </span>
    );
};

export default TagChip;
