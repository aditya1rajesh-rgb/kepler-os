import { NavLink, Link } from 'react-router-dom';
import { Lock, ChevronRight } from '../../lib/icons';
import { workspacePath } from '../../constants/routes';
import { isNavNodeLocked, lockHintFor } from '../../constants/moduleRegistry';

// One nav row. Leaves render a NavLink with the active blue pill; parents render a
// label row (navigates to the default child) plus a chevron that expands the
// dotted-connector child tree. Lock + next-step cues resolve through the registry so
// re-parented children keep their gates and the "start here" dot bubbles to the parent.
const SidebarNavItem = ({
    module: mod,
    workspaceId,
    collapsed,
    readiness,
    nextModuleId,
    nextParentId,
    activeModuleId,
    activeSubModuleId,
    expanded,
    onToggleExpand,
}) => {
    const Icon = mod.icon;
    const locked = isNavNodeLocked(mod.id, readiness);
    const lockHint = locked ? lockHintFor(mod.id) : undefined;
    const isNextDot = mod.id === nextModuleId || mod.id === nextParentId;
    const hasChildren = Boolean(mod.children?.length);

    const leafPath = mod.scope === 'global'
        ? mod.path
        : workspacePath(workspaceId, mod.id);

    // ── Leaf (flat module or global link) ────────────────────────────────────
    if (!hasChildren) {
        return (
            <li className="sidebar__item-wrap">
                <NavLink
                    to={leafPath}
                    end={mod.scope === 'global'}
                    className={({ isActive }) =>
                        ['sidebar__item', isActive ? 'sidebar__item--active' : '', collapsed ? 'sidebar__item--collapsed' : '']
                            .filter(Boolean).join(' ')}
                    title={collapsed ? mod.label : lockHint}
                >
                    <Icon className="sidebar__item-icon" size={18} strokeWidth={1.6} />
                    {!collapsed && <span className="sidebar__item-label">{mod.label}</span>}
                    {!collapsed && locked && <Lock className="sidebar__item-lock" size={13} strokeWidth={1.8} />}
                    {!collapsed && !locked && isNextDot && <span className="sidebar__item-dot" aria-hidden="true" />}
                </NavLink>
            </li>
        );
    }

    // ── Parent (has children) ────────────────────────────────────────────────
    const parentActive = activeModuleId === mod.id;
    const parentPath = workspacePath(workspaceId, mod.id, mod.defaultChild);

    if (collapsed) {
        // Icon-only rail: parent navigates straight to its default child; the icon
        // lights when any of its screens is active.
        return (
            <li className="sidebar__item-wrap">
                <Link
                    to={parentPath}
                    className={`sidebar__item sidebar__item--collapsed ${parentActive ? 'sidebar__item--active' : ''}`}
                    title={locked ? lockHint : mod.label}
                >
                    <Icon className="sidebar__item-icon" size={18} strokeWidth={1.6} />
                </Link>
            </li>
        );
    }

    return (
        <li className="sidebar__item-wrap">
            <div className={`sidebar__parent ${parentActive ? 'sidebar__parent--current' : ''}`}>
                <Link to={parentPath} className="sidebar__item sidebar__item--parent" title={lockHint}>
                    <Icon className="sidebar__item-icon" size={18} strokeWidth={1.6} />
                    <span className="sidebar__item-label">{mod.label}</span>
                    {locked && <Lock className="sidebar__item-lock" size={13} strokeWidth={1.8} />}
                    {!locked && isNextDot && <span className="sidebar__item-dot" aria-hidden="true" />}
                </Link>
                <button
                    type="button"
                    className={`sidebar__caret ${expanded ? 'sidebar__caret--open' : ''}`}
                    onClick={() => onToggleExpand(mod.id)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${mod.label}`}
                >
                    <ChevronRight size={14} strokeWidth={2} />
                </button>
            </div>

            {expanded && (
                <ul className="sidebar__children">
                    {mod.children.map((child) => {
                        const childLocked = isNavNodeLocked(child.id, readiness);
                        const childActive = parentActive && activeSubModuleId === child.id;
                        return (
                            <li key={child.id} className="sidebar__child-wrap">
                                <NavLink
                                    to={workspacePath(workspaceId, mod.id, child.id)}
                                    className={`sidebar__child ${childActive ? 'sidebar__child--active' : ''}`}
                                    title={childLocked ? lockHintFor(child.id) : undefined}
                                >
                                    <span className="sidebar__child-label">{child.label}</span>
                                    {childLocked && <Lock className="sidebar__item-lock" size={12} strokeWidth={1.8} />}
                                </NavLink>
                            </li>
                        );
                    })}
                </ul>
            )}
        </li>
    );
};

export default SidebarNavItem;
