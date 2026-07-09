import React from 'react';
import './Panel.css';

/**
 * Dark-acrylic panel - core KEPLER material.
 * Applies .kepler-panel (including ::before sheen from kepler-materials.css).
 */
const Panel = ({ children, className = '', ...props }) => {
    return (
        <section
            className={`kepler-panel panel ${className}`.trim()}
            {...props}
        >
            {children}
        </section>
    );
};

export const PanelHeader = ({ title, meta, action }) => (
    <header className="panel-header">
        <div className="panel-header__text">
            <h3 className="panel-header__title font-heading">{title}</h3>
            {meta ? <p className="panel-header__meta">{meta}</p> : null}
        </div>
        {action ? <div className="panel-header__action">{action}</div> : null}
    </header>
);

export default Panel;
