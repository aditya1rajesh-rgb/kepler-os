import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    Search,
    ChevronDown,
    PanelLeftClose,
    PanelLeft,
} from '../../lib/icons';
import {
    NAV_SECTIONS,
    MODULES,
    parseWorkspaceLocation,
    getParentOf,
} from '../../constants/moduleRegistry';
import { useActiveWorkspaceId } from '../../hooks/useActiveWorkspaceId';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useActivation } from '../../context/ActivationContext';
import { nextStepModuleId } from '../../lib/activation';
import { clientState } from '../../lib/clientState';
import SidebarNavItem from './SidebarNavItem';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import './Sidebar.css';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const Sidebar = ({ collapsed, onToggle, onOpenPalette }) => {
    const location = useLocation();
    const workspaceId = useActiveWorkspaceId();
    const { workspaces, getWorkspaceById } = useWorkspace();
    const { readiness, activation } = useActivation();

    const effectiveWorkspaceId = workspaceId ?? (workspaces[0]?.id ? String(workspaces[0].id) : null);
    const currentWorkspace = effectiveWorkspaceId ? getWorkspaceById(effectiveWorkspaceId) : null;

    const nextModuleId = nextStepModuleId(activation);
    const nextParentId = nextModuleId ? getParentOf(nextModuleId)?.id : null;

    // Active node from the URL (the sidebar sits outside the routed element).
    const loc = parseWorkspaceLocation(location.pathname);
    const activeModuleId = loc?.moduleId ?? null;
    const activeSubModuleId = loc?.subModuleId ?? null;

    // Per-section collapse (persisted). Default: all expanded.
    const [sectionState, setSectionState] = useState(() => clientState.getNavSectionState());
    const toggleSection = (id) => {
        setSectionState((prev) => {
            const next = { ...prev, [id]: prev[id] === false ? true : false };
            clientState.setNavSectionState(next);
            return next;
        });
    };
    const isSectionOpen = (id) => sectionState[id] !== false;

    // Per-parent expand. Auto-expand the parent that contains the active route.
    const activeParentId = activeModuleId && getParentOf(activeSubModuleId)?.id === activeModuleId
        ? activeModuleId
        : (MODULES.find((m) => m.id === activeModuleId && m.children)?.id ?? null);
    const [expandedParents, setExpandedParents] = useState(() => new Set(activeParentId ? [activeParentId] : []));

    useEffect(() => {
        if (activeParentId) {
            setExpandedParents((prev) => (prev.has(activeParentId) ? prev : new Set(prev).add(activeParentId)));
        }
    }, [activeParentId]);

    const toggleExpand = (id) => {
        setExpandedParents((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const sections = useMemo(
        () => NAV_SECTIONS.map((section) => ({
            ...section,
            modules: MODULES.filter((m) => m.section === section.id),
        })),
        []
    );

    return (
        <aside className={`sidebar kepler-shell ${collapsed ? 'sidebar--collapsed' : ''}`}>
            <div className={`sidebar__brand ${collapsed ? 'sidebar__brand--collapsed' : ''}`}>
                <Link to="/" className="sidebar__brand-cluster" title="Dashboard">
                    <span className="sidebar__brand-badge">
                        <img src="/kepler-logo.png" alt="KEPLER" className="sidebar__brand-badge-mark" />
                    </span>
                    {!collapsed && <span className="sidebar__wordmark font-heading">KEPLER</span>}
                </Link>
                <button
                    type="button"
                    className="sidebar__collapse-btn"
                    onClick={onToggle}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed ? <PanelLeft size={16} strokeWidth={1.6} /> : <PanelLeftClose size={16} strokeWidth={1.6} />}
                </button>
            </div>

            <div className="sidebar__search-wrap">
                <button
                    type="button"
                    className={`sidebar__search ${collapsed ? 'sidebar__search--collapsed' : ''}`}
                    onClick={() => onOpenPalette?.()}
                    title={collapsed ? 'Search' : undefined}
                >
                    <Search size={16} strokeWidth={1.7} className="sidebar__search-icon" />
                    {!collapsed && (
                        <>
                            <span className="sidebar__search-text">Search…</span>
                            <kbd className="sidebar__search-kbd">{isMac ? '⌘' : 'Ctrl'} K</kbd>
                        </>
                    )}
                </button>
            </div>

            <nav className="sidebar__nav">
                {sections.map((section) => {
                    const open = isSectionOpen(section.id);
                    return (
                        <div key={section.id} className="sidebar__section">
                            {!collapsed ? (
                                <button
                                    type="button"
                                    className="sidebar__section-header"
                                    onClick={() => toggleSection(section.id)}
                                    aria-expanded={open}
                                >
                                    <span className="sidebar__section-label">{section.label}</span>
                                    <ChevronDown
                                        className={`sidebar__section-chevron ${open ? '' : 'sidebar__section-chevron--closed'}`}
                                        size={13}
                                        strokeWidth={2}
                                    />
                                </button>
                            ) : (
                                <div className="sidebar__section-divider" aria-hidden="true" />
                            )}

                            {(open || collapsed) && (
                                <ul className="sidebar__section-items">
                                    {section.modules.map((mod) => (
                                        <SidebarNavItem
                                            key={mod.id}
                                            module={mod}
                                            workspaceId={effectiveWorkspaceId}
                                            collapsed={collapsed}
                                            readiness={readiness}
                                            nextModuleId={nextModuleId}
                                            nextParentId={nextParentId}
                                            activeModuleId={activeModuleId}
                                            activeSubModuleId={activeSubModuleId}
                                            expanded={expandedParents.has(mod.id)}
                                            onToggleExpand={toggleExpand}
                                        />
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </nav>

            <div className="sidebar__footer">
                <WorkspaceSwitcher
                    workspaces={workspaces}
                    currentWorkspace={currentWorkspace}
                    collapsed={collapsed}
                />
            </div>
        </aside>
    );
};

export default Sidebar;
