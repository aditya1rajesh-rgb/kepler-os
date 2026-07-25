import { VALID_TOP_IDS, LEGACY_TOP_LEVEL, DEFAULT_MODULE_ID } from './moduleRegistry';

export { DEFAULT_MODULE_ID };

// Kept for back-compat with callers that validate a raw :moduleId segment.
export const MODULE_IDS = [...VALID_TOP_IDS];

export const isValidModuleId = (moduleId) => VALID_TOP_IDS.has(moduleId);

/**
 * Build a workspace URL. Canonicalizes legacy top-level ids to their new parent/child
 * home (e.g. workspacePath(ws, 'seo-aeo') → /workspace/ws/studio/seo-aeo). This single
 * point keeps ~15 call sites and DB-persisted campaign step.module links correct with
 * zero edits — callers pass the stable id, the URL comes out canonical.
 */
export const workspacePath = (workspaceId, moduleId = DEFAULT_MODULE_ID, subModuleId) => {
    let mod = moduleId;
    let sub = subModuleId;
    if (sub == null && LEGACY_TOP_LEVEL[moduleId]) {
        [mod, sub] = LEGACY_TOP_LEVEL[moduleId];
    }
    return sub
        ? `/workspace/${workspaceId}/${mod}/${sub}`
        : `/workspace/${workspaceId}/${mod}`;
};
