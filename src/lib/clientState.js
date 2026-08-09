/** Non-sensitive UI preferences cached in localStorage. Never store tokens or PII. */

const ACTIVE_WORKSPACE_KEY = 'kepler:activeWorkspaceId';
const SIDEBAR_COLLAPSED_KEY = 'kepler:sidebar.collapsed';
const NAV_SECTIONS_KEY = 'kepler:sidebar.sections';

const readJSON = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

export const clientState = {
    getActiveWorkspaceId: () => localStorage.getItem(ACTIVE_WORKSPACE_KEY),

    setActiveWorkspaceId: (workspaceId) => {
        if (workspaceId) {
            localStorage.setItem(ACTIVE_WORKSPACE_KEY, String(workspaceId));
        }
    },

    // Sidebar collapse (icons-only rail) — persisted across sessions.
    getSidebarCollapsed: () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1',
    setSidebarCollapsed: (collapsed) => {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    },

    // Per-section expand/collapse state, keyed by section id ({ main: true, ... }).
    getNavSectionState: () => readJSON(NAV_SECTIONS_KEY, {}),
    setNavSectionState: (state) => {
        try {
            localStorage.setItem(NAV_SECTIONS_KEY, JSON.stringify(state ?? {}));
        } catch {
            /* ignore quota/serialization errors — nav state is non-critical */
        }
    },

    // Tool-rail open state, keyed by module. Each module remembers its own, so a
    // user who lives in the SEO tools keeps them open without forcing the rail
    // open everywhere else. Default (no stored value) is CLOSED — the point of
    // the rail is that the canvas is what you see first.
    getRailOpen: (moduleKey) => localStorage.getItem(`kepler:rail:${moduleKey}`) === '1',
    setRailOpen: (moduleKey, open) => {
        if (moduleKey) localStorage.setItem(`kepler:rail:${moduleKey}`, open ? '1' : '0');
    },

    // Activity-feed read cursor per workspace — drives the header bell's unread dot.
    getEventsReadAt: (workspaceId) => localStorage.getItem(`kepler:eventsReadAt:${workspaceId}`),
    setEventsReadAt: (workspaceId, iso) => {
        if (workspaceId) localStorage.setItem(`kepler:eventsReadAt:${workspaceId}`, iso ?? new Date().toISOString());
    },

    clear: () => {
        localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
        localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
        localStorage.removeItem(NAV_SECTIONS_KEY);
        localStorage.removeItem('kepler:demoSession');
        localStorage.removeItem('kepler:demoWorkspaces');
        localStorage.removeItem('kepler:onboardingComplete');
    },
};
