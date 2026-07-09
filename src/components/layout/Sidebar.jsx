import { createContext, useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    Home,
    LayoutDashboard,
    TrendingUp,
    Target,
    Telescope,
    Search,
    Megaphone,
    Send,
    UserSearch,
    AtSign,
    FolderOpen,
    Lock,
    PanelLeftClose,
    PanelLeft,
    ChevronsUpDown,
} from '../../lib/icons';
import { workspacePath } from '../../constants/routes';
import { useActiveWorkspaceId } from '../../hooks/useActiveWorkspaceId';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useActivation } from '../../context/ActivationContext';
import { isModuleLocked, MODULE_GATES, nextStepModuleId } from '../../lib/activation';
import { workspaceService } from '../../services/workspaceService';
import './Sidebar.css';

export const SidebarContext = createContext({ collapsed: false });

const Sidebar = ({ collapsed, onToggle }) => {
    const navigate = useNavigate();
    const workspaceId = useActiveWorkspaceId();
    const { workspaces, getWorkspaceById } = useWorkspace();
    const { readiness, activation } = useActivation();
    const effectiveWorkspaceId = workspaceId ?? (workspaces[0]?.id ? String(workspaces[0].id) : null);
    const currentWorkspace = effectiveWorkspaceId ? getWorkspaceById(effectiveWorkspaceId) : null;
    const nextModuleId = nextStepModuleId(activation);

    const navItems = useMemo(
        () => {
            const items = [
                { label: 'Home', path: '/', icon: Home, end: true },
            ];

            if (effectiveWorkspaceId) {
                const mods = [
                    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
                    { id: 'measurement', label: 'Measurement', icon: TrendingUp },
                    { id: 'brand-intelligence', label: 'Brand Intelligence', icon: Telescope },
                    { id: 'campaigns', label: 'Campaigns', icon: Target },
                    { id: 'seo-aeo', label: 'SEO & AEO', icon: Search },
                    { id: 'ad-campaigns', label: 'Ad Campaigns', icon: Megaphone },
                    { id: 'outreach', label: 'Outreach', icon: Send },
                    { id: 'prospecting', label: 'Prospecting', icon: UserSearch },
                    { id: 'social-media', label: 'Social Media', icon: AtSign },
                    { id: 'library', label: 'Library', icon: FolderOpen },
                ];

                mods.forEach((mod) => {
                    const locked = isModuleLocked(mod.id, readiness);
                    items.push({
                        label: mod.label,
                        path: workspacePath(effectiveWorkspaceId, mod.id),
                        icon: mod.icon,
                        locked,
                        isNext: mod.id === nextModuleId,
                        lockHint: locked ? MODULE_GATES[mod.id]?.unmetLabel : undefined,
                    });
                });
            }

            return items;
        },
        [effectiveWorkspaceId, readiness, nextModuleId]
    );

    const handleWorkspaceChange = async (event) => {
        const nextId = event.target.value;
        await workspaceService.setActiveWorkspaceId(nextId);
        navigate(workspacePath(nextId));
    };

    const workspaceInitials = (currentWorkspace?.name ?? 'WS').slice(0, 2).toUpperCase();

    return (
        <aside className={`sidebar kepler-shell ${collapsed ? 'sidebar--collapsed' : ''}`}>
            <div className={`sidebar__brand ${collapsed ? 'sidebar__brand--collapsed' : ''}`}>
                <div className="sidebar__brand-cluster">
                    <div className="sidebar__brand-badge">
                        <img src="/kepler-logo.png" alt="KEPLER" className="sidebar__brand-badge-mark" />
                    </div>
                    {!collapsed && (
                        <div className="sidebar__brand-text">
                            <span className="sidebar__wordmark font-heading">KEPLER</span>
                        </div>
                    )}
                </div>
                {!collapsed && (
                    <button
                        type="button"
                        className="sidebar__collapse-btn"
                        onClick={onToggle}
                        aria-label="Collapse sidebar"
                    >
                        <PanelLeftClose size={16} strokeWidth={1.6} />
                    </button>
                )}
            </div>

            {collapsed && (
                <div className="sidebar__expand">
                    <button
                        type="button"
                        className="sidebar__expand-btn"
                        onClick={onToggle}
                        aria-label="Expand sidebar"
                    >
                        <PanelLeft size={16} strokeWidth={1.6} />
                    </button>
                </div>
            )}

            <nav className="sidebar__nav">
                {!collapsed && (
                    <p className="sidebar__nav-heading">Workspace</p>
                )}
                <ul className="sidebar__nav-list">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <li key={item.path}>
                                <NavLink
                                    to={item.path}
                                    end={item.end}
                                    className={({ isActive }) =>
                                        [
                                            'sidebar__item',
                                            isActive ? 'sidebar__item--active kepler-nav-active' : '',
                                            item.isNext ? 'sidebar__item--next' : '',
                                            collapsed ? 'sidebar__item--collapsed' : '',
                                        ].filter(Boolean).join(' ')
                                    }
                                    title={collapsed ? item.label : (item.lockHint || undefined)}
                                >
                                    <Icon
                                        className="sidebar__item-icon"
                                        size={18}
                                        strokeWidth={1.6}
                                    />
                                    {!collapsed && (
                                        <span className="sidebar__item-label">{item.label}</span>
                                    )}
                                    {!collapsed && item.locked && (
                                        <Lock className="sidebar__item-lock" size={13} strokeWidth={1.8} />
                                    )}
                                    {!collapsed && item.isNext && (
                                        <span className="sidebar__item-next-dot" aria-hidden="true" />
                                    )}
                                </NavLink>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            <div className="sidebar__footer">
                {!collapsed && workspaces.length > 1 ? (
                    <label className="sidebar__workspace-switcher">
                        <div className="sidebar__workspace-avatar">
                            <span className="font-heading">{workspaceInitials}</span>
                        </div>
                        <div className="sidebar__workspace-info">
                            <select
                                className="sidebar__workspace-select"
                                value={effectiveWorkspaceId ?? ''}
                                onChange={handleWorkspaceChange}
                                aria-label="Switch workspace"
                            >
                                {workspaces.map((ws) => (
                                    <option key={ws.id} value={ws.id}>
                                        {ws.name}
                                    </option>
                                ))}
                            </select>
                            <span className="sidebar__ws-plan">Active workspace</span>
                        </div>
                        <ChevronsUpDown className="sidebar__workspace-chevron" size={16} strokeWidth={1.6} />
                    </label>
                ) : (
                    <div className={`sidebar__workspace-switcher ${collapsed ? 'sidebar__workspace-switcher--collapsed' : ''}`}>
                        <div className="sidebar__workspace-avatar">
                            <span className="font-heading">{workspaceInitials}</span>
                        </div>
                        {!collapsed && (
                            <>
                                <div className="sidebar__workspace-info">
                                    <span className="sidebar__ws-name">
                                        {currentWorkspace?.name ?? 'Workspace'}
                                    </span>
                                    <span className="sidebar__ws-plan">Active workspace</span>
                                </div>
                                <ChevronsUpDown className="sidebar__workspace-chevron" size={16} strokeWidth={1.6} />
                            </>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
