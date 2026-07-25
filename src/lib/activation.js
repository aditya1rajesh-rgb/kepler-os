import { workspacePath } from '../constants/routes';
import { MODULE_GATES, isNavNodeLocked } from '../constants/moduleRegistry';

// Gates + locking now live in the module registry (single source of truth). Re-exported
// here so existing callers (Sidebar, Workspace, SetupRequired) keep their imports.
export { MODULE_GATES };
export const isModuleLocked = (moduleId, readiness = {}) => isNavNodeLocked(moduleId, readiness);

/**
 * Activation state - the single "where is this workspace on the path to value" model.
 *
 * Pure derivation from readiness (see deriveReadiness in useWorkspaceConfig) plus the
 * total content-item count. The whole orchestration layer (cockpit next-step, nav
 * lock/next cues, actionable SetupRequired) reads from this one model so the shell
 * always agrees on "where you are and what's next".
 *
 * Path: build brand intelligence → confirm first ICP → generate first asset.
 */

const buildNextAction = (stepId, workspaceId) => {
    if (!workspaceId) return null;
    switch (stepId) {
        case 'brand':
            return {
                stepId,
                label: 'Build your brand profile',
                description: 'Add your website or a file to auto-build it - or fill it in manually.',
                cta: 'Open Brand Intelligence',
                to: workspacePath(workspaceId, 'brand-intelligence', 'overview'),
            };
        case 'icp':
            return {
                stepId,
                label: 'Confirm your first ICP',
                description: 'Choose who you sell to - it unlocks SEO, Ads and Outreach.',
                cta: 'Add an ICP',
                to: workspacePath(workspaceId, 'brand-intelligence', 'audience'),
            };
        case 'generate':
            return {
                stepId,
                label: 'Generate your first asset',
                description: 'Your brand is ready - turn it into a content pipeline.',
                cta: 'Open SEO & AEO',
                to: workspacePath(workspaceId, 'seo-aeo'),
            };
        default:
            return null;
    }
};

export const deriveActivation = ({ readiness = {}, contentTotal = 0, workspaceId = null } = {}) => {
    const steps = [
        {
            id: 'brand',
            label: 'Build brand intelligence',
            hint: 'Give KEPLER your website or a file - or fill it in - so every module writes on-brand.',
            done: Boolean(readiness.hasBrandContext),
        },
        {
            id: 'icp',
            label: 'Confirm your first ICP',
            hint: 'Pick who you sell to. It unlocks SEO, Ads and Outreach.',
            done: Boolean(readiness.hasIcps),
        },
        {
            id: 'generate',
            label: 'Generate your first asset',
            hint: 'Turn your brand intelligence into content in any module.',
            done: contentTotal > 0,
        },
    ];

    const currentStepIndex = steps.findIndex((step) => !step.done);
    const isActivated = currentStepIndex === -1;
    const completedCount = steps.filter((step) => step.done).length;
    const progress = Math.round((completedCount / steps.length) * 100);
    const nextAction = isActivated
        ? null
        : buildNextAction(steps[currentStepIndex].id, workspaceId);

    return { steps, currentStepIndex, isActivated, completedCount, progress, nextAction };
};

/** The module a given activation step routes into (for "Start here" nav cues). */
export const NEXT_STEP_MODULE = {
    brand: 'brand-intelligence',
    icp: 'brand-intelligence',
    generate: 'seo-aeo',
};

export const nextStepModuleId = (activation) =>
    activation?.nextAction ? NEXT_STEP_MODULE[activation.nextAction.stepId] ?? null : null;
