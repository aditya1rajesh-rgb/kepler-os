import React from 'react';
import './AmbientBackground.css';

/**
 * Atmospheric branded lighting that sits far behind the app.
 * Mount inside the shell layout (Phase 2) - not wired into AppLayout yet.
 */
const AmbientBackground = () => {
    return (
        <div aria-hidden className="ambient-background">
            <div className="ambient-background__base" />

            <div className="ambient-background__glow ambient-background__glow--violet-primary" />
            <div className="ambient-background__glow ambient-background__glow--violet-secondary" />
            <div className="ambient-background__glow ambient-background__glow--periwinkle" />
            <div className="ambient-background__glow ambient-background__glow--mint" />
            <div className="ambient-background__glow ambient-background__glow--violet-pool" />

            <div className="ambient-background__grain" />
            <div className="ambient-background__vignette" />
        </div>
    );
};

export default AmbientBackground;
