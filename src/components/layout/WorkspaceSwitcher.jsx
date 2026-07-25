import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, Check, Home, Plus } from '../../lib/icons';
import { workspacePath } from '../../constants/routes';
import { workspaceService } from '../../services/workspaceService';

// Sidebar-footer workspace switcher: an in-sidebar popover (replaces the old native
// <select>). Switching sets the active workspace and lands on its Dashboard;
// "All workspaces" returns to the cross-workspace Home.
const WorkspaceSwitcher = ({ workspaces, currentWorkspace, collapsed }) => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const initials = (currentWorkspace?.name ?? 'WS').slice(0, 2).toUpperCase();

    const switchTo = async (id) => {
        setOpen(false);
        if (String(id) === String(currentWorkspace?.id)) return;
        await workspaceService.setActiveWorkspaceId(id);
        navigate(workspacePath(id));
    };

    return (
        <div className="ws-switcher" ref={rootRef}>
            <button
                type="button"
                className={`ws-switcher__trigger ${collapsed ? 'ws-switcher__trigger--collapsed' : ''}`}
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                title={collapsed ? currentWorkspace?.name : undefined}
            >
                <span className="ws-switcher__avatar"><span className="font-heading">{initials}</span></span>
                {!collapsed && (
                    <>
                        <span className="ws-switcher__info">
                            <span className="ws-switcher__name">{currentWorkspace?.name ?? 'Workspace'}</span>
                            <span className="ws-switcher__meta">Active workspace</span>
                        </span>
                        <ChevronsUpDown className="ws-switcher__chevron" size={16} strokeWidth={1.6} />
                    </>
                )}
            </button>

            {open && (
                <div className="ws-switcher__menu" role="menu">
                    <p className="ws-switcher__menu-label">Workspaces</p>
                    <ul className="ws-switcher__list">
                        {workspaces.map((ws) => {
                            const active = String(ws.id) === String(currentWorkspace?.id);
                            return (
                                <li key={ws.id}>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className={`ws-switcher__item ${active ? 'ws-switcher__item--active' : ''}`}
                                        onClick={() => switchTo(ws.id)}
                                    >
                                        <span className="ws-switcher__item-avatar">{(ws.name ?? 'WS').slice(0, 2).toUpperCase()}</span>
                                        <span className="ws-switcher__item-name">{ws.name}</span>
                                        {active && <Check size={14} strokeWidth={2.2} className="ws-switcher__item-check" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="ws-switcher__divider" />
                    <button
                        type="button"
                        role="menuitem"
                        className="ws-switcher__action"
                        onClick={() => { setOpen(false); navigate('/'); }}
                    >
                        <Home size={15} strokeWidth={1.7} /> All workspaces
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className="ws-switcher__action"
                        onClick={() => { setOpen(false); navigate('/onboarding?new=1'); }}
                    >
                        <Plus size={15} strokeWidth={1.7} /> New workspace
                    </button>
                </div>
            )}
        </div>
    );
};

export default WorkspaceSwitcher;
