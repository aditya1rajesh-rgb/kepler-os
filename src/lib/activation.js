import { workspacePath } from '../constants/routes';

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
                to: `${workspacePath(workspaceId, 'brand-intelligence')}?tab=overview`,
            };
        case 'icp':
            return {
                stepId,
                label: 'Confirm your first ICP',
                description: 'Choose who you sell to - it unlocks SEO, Ads and Outreach.',
                cta: 'Add an ICP',
                to: `${workspacePath(workspaceId, 'brand-intelligence')}?tab=audience`,
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

/**
 * Per-module gate metadata - maps a module to the readiness flag that unlocks it
 * (mirrors deriveReadiness) plus the human-readable "how to unlock" hint used by
 * nav lock cues and SetupRequired. Modules absent here (overview, brand-intelligence)
 * are never locked.
 */
export const MODULE_GATES = {
    'seo-aeo': { key: 'seoReady', unmetLabel: 'Add brand context + an ICP to unlock' },
    'ad-campaigns': { key: 'adsReady', unmetLabel: 'Add brand context + an ICP to unlock' },
    outreach: { key: 'outreachReady', unmetLabel: 'Add an ICP to unlock' },
    'social-media': { key: 'socialReady', unmetLabel: 'Add brand context to unlock' },
};

export const isModuleLocked = (moduleId, readiness = {}) => {
    const gate = MODULE_GATES[moduleId];
    if (!gate) return false;
    return !readiness[gate.key];
};

/** The module a given activation step routes into (for "Start here" nav cues). */
export const NEXT_STEP_MODULE = {
    brand: 'brand-intelligence',
    icp: 'brand-intelligence',
    generate: 'seo-aeo',
};

export const nextStepModuleId = (activation) =>
    activation?.nextAction ? NEXT_STEP_MODULE[activation.nextAction.stepId] ?? null : null;
