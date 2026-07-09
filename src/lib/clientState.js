/** Non-sensitive UI preferences cached in localStorage. Never store tokens or PII. */

const ACTIVE_WORKSPACE_KEY = 'kepler:activeWorkspaceId';

export const clientState = {
    getActiveWorkspaceId: () => localStorage.getItem(ACTIVE_WORKSPACE_KEY),

    setActiveWorkspaceId: (workspaceId) => {
        if (workspaceId) {
            localStorage.setItem(ACTIVE_WORKSPACE_KEY, String(workspaceId));
        }
    },

    clear: () => {
        localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
        localStorage.removeItem('kepler:demoSession');
        localStorage.removeItem('kepler:demoWorkspaces');
        localStorage.removeItem('kepler:onboardingComplete');
    },
};
