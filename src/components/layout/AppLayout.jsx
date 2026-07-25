import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import CommandPalette from '../palette/CommandPalette';
import { ActivationProvider } from '../../context/ActivationContext';
import { clientState } from '../../lib/clientState';
import './AppLayout.css';

const AppLayout = () => {
    const [collapsed, setCollapsed] = useState(() => clientState.getSidebarCollapsed());
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const location = useLocation();

    const toggleCollapsed = () => {
        setCollapsed((c) => {
            const next = !c;
            clientState.setSidebarCollapsed(next);
            return next;
        });
    };

    const openPalette = useCallback(() => setPaletteOpen(true), []);
    const closePalette = useCallback(() => setPaletteOpen(false), []);

    // Global ⌘K / Ctrl-K toggles the command palette.
    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                setPaletteOpen((o) => !o);
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    // Close the mobile nav whenever the route changes.
    useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

    return (
        <ActivationProvider>
            <div className={`layout-container ${mobileNavOpen ? 'layout-container--mobile-open' : ''}`}>
                <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} onOpenPalette={openPalette} />
                {mobileNavOpen && <div className="layout-container__scrim" onClick={() => setMobileNavOpen(false)} />}
                <div className="main-wrapper">
                    <Header onOpenMobileNav={() => setMobileNavOpen(true)} />
                    <main className="content-area">
                        <Outlet />
                    </main>
                </div>
            </div>
            <CommandPalette open={paletteOpen} onClose={closePalette} />
        </ActivationProvider>
    );
};

export default AppLayout;
