import { useLocation } from 'react-router-dom';
import { parseWorkspaceLocation, titleFor } from '../constants/moduleRegistry';

// The header renders outside the routed element, so it can't read useParams. Derive the
// { crumb, title } for the current path directly.
export const usePageTitle = () => {
    const { pathname } = useLocation();
    if (pathname === '/') return { crumb: null, title: 'Dashboard' };
    if (pathname.startsWith('/workspaces')) return { crumb: null, title: 'All Workspaces' };
    if (pathname.startsWith('/profile')) return { crumb: null, title: 'Settings' };
    if (pathname.startsWith('/help')) return { crumb: null, title: 'Help Center' };
    const loc = parseWorkspaceLocation(pathname);
    if (loc) return titleFor(loc.moduleId, loc.subModuleId);
    return { crumb: null, title: 'Kepler' };
};
