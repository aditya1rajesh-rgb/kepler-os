import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from '../../lib/icons';
import { useActiveWorkspaceId } from '../../hooks/useActiveWorkspaceId';
import { usePaletteCommands } from './usePaletteCommands';
import './CommandPalette.css';

// Global command palette (⌘K / Ctrl-K). Dependency-free portal: navigation from the
// module registry, workspace switching, lazy content search, and quick actions.
const CommandPalette = ({ open, onClose }) => {
    const workspaceId = useActiveWorkspaceId();
    const { navCommands, actionCommands, workspaceCommands, contentCommands, ensureContent } = usePaletteCommands(workspaceId);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        if (open) {
            ensureContent();
            setQuery('');
            setActiveIndex(0);
            // Focus after the portal paints.
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open, ensureContent]);

    const q = query.trim().toLowerCase();

    // Build the visible, ordered result groups. With no query we lead with navigation
    // + actions; a query filters every group (and surfaces content matches).
    const { groups, flat } = useMemo(() => {
        const match = (c) => !q || `${c.title} ${c.keywords ?? ''} ${c.subtitle ?? ''}`.toLowerCase().includes(q);
        const nav = navCommands.filter(match);
        const actions = actionCommands.filter(match);
        const ws = workspaceCommands.filter(match).slice(0, q ? 8 : 4);
        const cnt = q ? contentCommands.filter(match).slice(0, 6) : [];

        const ordered = [];
        const pushGroup = (label, cmds) => { if (cmds.length) ordered.push({ label, cmds }); };
        pushGroup('Navigate', nav.slice(0, q ? 20 : 8));
        pushGroup('Actions', actions);
        pushGroup('Workspaces', ws);
        pushGroup('Content', cnt);

        const flatList = ordered.flatMap((g) => g.cmds);
        return { groups: ordered, flat: flatList };
    }, [q, navCommands, actionCommands, workspaceCommands, contentCommands]);

    useEffect(() => { setActiveIndex(0); }, [q]);

    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    if (!open) return null;

    const run = (cmd) => {
        if (!cmd) return;
        onClose();
        cmd.run();
    };

    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            run(flat[activeIndex]);
        }
    };

    let runningIndex = -1;

    return createPortal(
        <div className="cmdk__overlay" onMouseDown={onClose}>
            <div
                className="cmdk"
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={onKeyDown}
            >
                <div className="cmdk__input-row">
                    <Search size={17} strokeWidth={1.7} className="cmdk__input-icon" />
                    <input
                        ref={inputRef}
                        className="cmdk__input"
                        placeholder="Search or jump to…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd className="cmdk__esc">Esc</kbd>
                </div>

                <div className="cmdk__list" ref={listRef}>
                    {flat.length === 0 ? (
                        <p className="cmdk__empty">No matches for “{query}”.</p>
                    ) : (
                        groups.map((group) => (
                            <div key={group.label} className="cmdk__group">
                                <p className="cmdk__group-label">{group.label}</p>
                                {group.cmds.map((cmd) => {
                                    runningIndex += 1;
                                    const index = runningIndex;
                                    const Icon = cmd.icon;
                                    return (
                                        <button
                                            key={cmd.id}
                                            type="button"
                                            data-index={index}
                                            className={`cmdk__item ${index === activeIndex ? 'cmdk__item--active' : ''}`}
                                            onMouseMove={() => setActiveIndex(index)}
                                            onClick={() => run(cmd)}
                                        >
                                            {Icon && <Icon size={16} strokeWidth={1.7} className="cmdk__item-icon" />}
                                            <span className="cmdk__item-title">{cmd.title}</span>
                                            {cmd.subtitle && <span className="cmdk__item-sub">{cmd.subtitle}</span>}
                                            {index === activeIndex && <span className="cmdk__item-enter" aria-hidden="true">↵</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default CommandPalette;
