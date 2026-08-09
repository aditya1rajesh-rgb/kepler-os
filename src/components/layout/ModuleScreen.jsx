import { useCallback, useEffect, useState } from 'react';
import { Sliders, X } from '../../lib/icons';
import { clientState } from '../../lib/clientState';
import './ModuleScreen.css';

/**
 * The frame every workspace module renders into.
 *
 * WHY THIS EXISTS
 * v3 modules were a flat stack of peer panels — SEO & AEO rendered eight
 * sibling containers, each with its own title, its own explanatory sentence and
 * its own button, spread over 4.9 screens. Six of those buttons were styled as
 * primary. Nothing on the screen said "this is the thing you came here to do",
 * so testers could not tell what a screen was for.
 *
 * THE MODEL
 * Every screen has exactly ONE canvas — the work surface you came for — and at
 * most ONE primary action. Everything else (connectors, one-off utilities,
 * configuration, exports) is real functionality that still belongs on the
 * screen but must not compete with the canvas, so it moves into a tool rail
 * that is closed by default and remembers its state per module.
 *
 * Nothing is removed by this component. Things are ranked.
 *
 * The screen title is NOT rendered here: the app header already renders it from
 * the module registry, and v3 screens re-rendered their own <h1> underneath it.
 */
const ModuleScreen = ({
    /** Stable key for remembering rail state — usually the module/sub-module id. */
    moduleKey,
    /** Screen-level state: counts, sync status, connection health. Not prose. */
    status = null,
    /** THE action for this screen. Exactly one, or none. */
    primary = null,
    /** Secondary screen-level actions, rendered quieter and to the left of primary. */
    actions = null,
    /** Demoted tools — pass a <ToolRail>. Omit for screens that have no tools. */
    rail = null,
    /** Label for the rail toggle; name what is inside it. */
    railLabel = 'Tools',
    /** Full-bleed banners that must sit above everything (campaign context, errors). */
    banner = null,
    children,
    className = '',
}) => {
    const [railOpen, setRailOpen] = useState(() =>
        moduleKey ? clientState.getRailOpen(moduleKey) : false
    );

    // Sibling screens each own their rail state. Reset during render rather than
    // in an effect — switching sub-modules usually remounts this component, but
    // when it doesn't, an effect would render the previous module's rail state
    // for one frame first. React's documented pattern for a prop-derived reset.
    const [lastModuleKey, setLastModuleKey] = useState(moduleKey);
    if (moduleKey !== lastModuleKey) {
        setLastModuleKey(moduleKey);
        setRailOpen(moduleKey ? clientState.getRailOpen(moduleKey) : false);
    }

    const toggleRail = useCallback(() => {
        setRailOpen((open) => {
            const next = !open;
            if (moduleKey) clientState.setRailOpen(moduleKey, next);
            return next;
        });
    }, [moduleKey]);

    // Escape closes the rail — it is a parallel panel, not a modal, so it does
    // not trap focus, but it should still be dismissable from the keyboard.
    useEffect(() => {
        if (!railOpen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') toggleRail(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [railOpen, toggleRail]);

    const hasBar = Boolean(status || primary || actions || rail);

    return (
        <div className={`mscreen ${railOpen ? 'mscreen--rail-open' : ''} ${className}`.replace(/\s+/g, ' ').trim()}>
            {banner ? <div className="mscreen__banner">{banner}</div> : null}

            {/* One bar per screen carrying state on the left and intent on the
                right, so the answer to "what do I do here" is always in the same
                place. v3 scattered these across every panel header. */}
            {hasBar && (
                <div className="mscreen__bar">
                    <div className="mscreen__status">{status}</div>
                    <div className="mscreen__intent">
                        {actions}
                        {rail && (
                            <button
                                type="button"
                                className={`mscreen__rail-toggle ${railOpen ? 'is-active' : ''}`}
                                onClick={toggleRail}
                                aria-expanded={railOpen}
                                aria-controls={`rail-${moduleKey || 'default'}`}
                            >
                                {railOpen ? <X size={15} /> : <Sliders size={15} />}
                                <span>{railLabel}</span>
                            </button>
                        )}
                        {primary}
                    </div>
                </div>
            )}

            <div className="mscreen__body">
                <div className="mscreen__canvas">{children}</div>

                {rail && (
                    <aside
                        id={`rail-${moduleKey || 'default'}`}
                        className="mscreen__rail"
                        aria-label={railLabel}
                        aria-hidden={!railOpen}
                        // Fully removed from the tab order when closed; a
                        // width-collapsed panel whose contents are still
                        // focusable is a keyboard trap.
                        inert={!railOpen}
                    >
                        <div className="mscreen__rail-inner">{rail}</div>
                    </aside>
                )}
            </div>
        </div>
    );
};

export default ModuleScreen;
