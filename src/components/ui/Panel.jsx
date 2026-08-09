import React from 'react';
import './Panel.css';

/**
 * The app's content container. Resolves to the shared surface ladder — see
 * styles/surfaces.css for the four container roles and when to use each.
 *
 * `variant`:
 *   'default' — a container on the canvas (one tone step + hairline)
 *   'quiet'   — a group boundary with no chrome; tone and spacing only.
 *               Prefer this for secondary groups on a screen that already has
 *               a dominant canvas, so they stop competing with it.
 *   'flush'   — no padding, for containers whose child owns its own insets
 */
const Panel = ({ children, className = '', variant = 'default', ...props }) => {
    const variantClass = variant === 'default' ? '' : `panel--${variant}`;

    return (
        <section
            className={`kepler-panel panel ${variantClass} ${className}`.replace(/\s+/g, ' ').trim()}
            {...props}
        >
            {children}
        </section>
    );
};

/**
 * The single header pattern.
 *
 * `meta` is for STATE — "Connected · synced 2h ago", "4 queued", "3 blog URLs".
 * It is NOT for explaining what the section is. v3 used it for a sentence of
 * prose on all 41 instances, which is why a screen made you read seven titles
 * and seven explanations before reaching any content; if a section needs a
 * sentence to say what it is, the label or the grouping is wrong.
 *
 * Pass `stacked` only where the meta genuinely needs its own line (long status
 * strings that would otherwise crowd the title).
 */
export const PanelHeader = ({ title, meta, action, stacked = false }) => (
    <header className={`panel-header ${stacked ? 'panel-header--stacked' : ''}`.trim()}>
        <div className="panel-header__text">
            <h3 className="panel-header__title">{title}</h3>
            {meta ? <p className="panel-header__meta">{meta}</p> : null}
        </div>
        {action ? <div className="panel-header__action">{action}</div> : null}
    </header>
);

export default Panel;
