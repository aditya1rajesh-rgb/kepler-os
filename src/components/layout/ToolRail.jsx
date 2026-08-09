import { useState } from 'react';
import { ChevronDown } from '../../lib/icons';
import './ToolRail.css';

/**
 * The demoted-tools rail. Holds the utilities that a v3 screen rendered as
 * full-width peer panels competing with the actual work surface — connectors,
 * one-off analyses, exports, technical settings.
 *
 * Two rules:
 *  1. A tool in the rail keeps ALL of its behaviour. This is relocation, not
 *     removal — anything that would lose a capability belongs on the canvas.
 *  2. A rail tool never uses .btn-primary. There is one primary action per
 *     screen and it lives in the screen bar.
 */
const ToolRail = ({ children, note = null }) => (
    <>
        {children}
        {note ? <p className="tool-rail__note">{note}</p> : null}
    </>
);

/**
 * One tool. Collapsed to a single row by default; tools carrying a form or a
 * result list expand in place.
 *
 * `state` is the tool's own status — "Connected", "3 found", "Not connected".
 * It stays visible while collapsed, so the rail doubles as a status summary
 * and you can tell what needs attention without opening anything.
 */
export const ToolCard = ({
    title,
    state = null,
    /** 'ok' tints the state green, 'warn' amber, 'idle' stays muted. */
    tone = 'idle',
    /** Rendered inline on the collapsed row — for one-click tools with no body. */
    action = null,
    /** Expandable body. Omit for tools that are just a row plus an action. */
    children = null,
    defaultOpen = false,
}) => {
    const [open, setOpen] = useState(defaultOpen);
    const collapsible = Boolean(children);

    return (
        <section className={`tool-card ${open && collapsible ? 'tool-card--open' : ''}`.trim()}>
            <div className="tool-card__head">
                {collapsible ? (
                    <button
                        type="button"
                        className="tool-card__toggle"
                        onClick={() => setOpen((o) => !o)}
                        aria-expanded={open}
                    >
                        <ChevronDown size={13} className="tool-card__chevron" />
                        <span className="tool-card__title">{title}</span>
                    </button>
                ) : (
                    <span className="tool-card__title tool-card__title--static">{title}</span>
                )}

                <div className="tool-card__right">
                    {state ? (
                        <span className={`tool-card__state tool-card__state--${tone}`}>{state}</span>
                    ) : null}
                    {action}
                </div>
            </div>

            {collapsible && open ? <div className="tool-card__body">{children}</div> : null}
        </section>
    );
};

/** Section label for grouping tools inside the rail. */
export const ToolGroup = ({ label, children }) => (
    <div className="tool-group">
        <p className="tool-group__label">{label}</p>
        <div className="tool-group__items">{children}</div>
    </div>
);

export default ToolRail;
