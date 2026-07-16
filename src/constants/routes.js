export const DEFAULT_MODULE_ID = 'overview';

export const MODULE_IDS = [
    'overview',
    'measurement',
    'brand-intelligence',
    'campaigns',
    'seo-aeo',
    'ad-campaigns',
    'outreach',
    'prospecting',
    'social-media',
    'library',
];

export const isValidModuleId = (moduleId) => MODULE_IDS.includes(moduleId);

export const workspacePath = (workspaceId, moduleId = DEFAULT_MODULE_ID, subModuleId) =>
    subModuleId
        ? `/workspace/${workspaceId}/${moduleId}/${subModuleId}`
        : `/workspace/${workspaceId}/${moduleId}`;
