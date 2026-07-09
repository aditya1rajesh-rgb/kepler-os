import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { ActivationProvider } from '../../context/ActivationContext';
import './AppLayout.css';

const AppLayout = () => {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <ActivationProvider>
            <div className={`layout-container${collapsed ? ' layout-container--sidebar-collapsed' : ''}`}>
                <Sidebar
                    collapsed={collapsed}
                    onToggle={() => setCollapsed((c) => !c)}
                />
                <div className="main-wrapper">
                    <Header />
                    <main className="content-area">
                        <Outlet />
                    </main>
                </div>
            </div>
        </ActivationProvider>
    );
};

export default AppLayout;
