import { supabase } from '../lib/supabase';
import { clientState } from '../lib/clientState';
import { isUuid } from '../lib/validation';
import { generateUuid } from '../lib/uuid';
import { mapWorkspaceRow, toBrandProfileInsert, toWorkspaceInsert } from '../lib/mappers';
import { onboardingTrace } from '../lib/onboardingTrace';

const log = (...args) => {
    if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_ONBOARDING === 'true') {
        console.log('[onboarding]', ...args);
    }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeUrl = (url) => {
    if (!url) return '';
    return url
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')
        .toLowerCase();
};

const isDuplicateError = (error) =>
    error?.code === '23505' ||
    /duplicate key|unique constraint/i.test(error?.message ?? '');

const buildStep = (step, ok, data = null, error = null, recoverable = false) => ({
    step,
    ok,
    data,
    error: error
        ? { message: error.message, code: error.code, details: error.details, hint: error.hint }
        : null,
    recoverable,
});

export class OnboardingError extends Error {
    constructor(message, { steps = [], cause = null } = {}) {
        super(message);
        this.name = 'OnboardingError';
        this.steps = steps;
        this.cause = cause;
    }
}

const requireUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) throw new Error('Not authenticated');
    return user;
};

const buildWorkspaceRowFromInsert = (workspaceId, insertPayload) =>
    mapWorkspaceRow({
        id: workspaceId,
        name: insertPayload.name,
        url: insertPayload.url ?? '',
        tagline: insertPayload.tagline ?? '',
        industry: insertPayload.industry ?? 'Consumer Brand',
        logo_color: insertPayload.logo_color ?? '#6666ff',
        brand_colors: insertPayload.brand_colors ?? [],
        last_active_module: 'Brand Intelligence',
        brand_intel_status: 0,
    });

const getMembershipForWorkspace = async (userId, workspaceId) => {
    const { data, error } = await supabase
        .from('workspace_members')
        .select('id, workspace_id, role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data;
};

const getLatestMembershipWorkspaceId = async (userId) => {
    const { data, error } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data?.workspace_id ?? null;
};

const getBrandProfileId = async (workspaceId) => {
    const { data, error } = await supabase
        .from('brand_profiles')
        .select('id')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

    if (error) throw error;
    return data?.id ?? null;
};

const findRecoverableWorkspaceId = async (userId) => {
    const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('active_workspace_id, onboarding_complete')
        .eq('id', userId)
        .maybeSingle();

    if (profileError) throw profileError;

    if (profile?.active_workspace_id && isUuid(profile.active_workspace_id)) {
        const membership = await getMembershipForWorkspace(userId, profile.active_workspace_id);
        if (membership && !profile.onboarding_complete) {
            return profile.active_workspace_id;
        }
    }

    if (!profile?.onboarding_complete) {
        const latestId = await getLatestMembershipWorkspaceId(userId);
        if (latestId) return latestId;
    }

    return null;
};

/**
 * Ensures the user owns a membership row for the workspace.
 * Returns true when membership is confirmed by a successful read OR a write that
 * returned no error (including duplicate-key, which means it already exists).
 * This confirmation is the authoritative success signal for onboarding.
 */
const ensureMembership = async (userId, workspaceId, steps) => {
    try {
        const existing = await getMembershipForWorkspace(userId, workspaceId);
        if (existing) {
            log('ensureMembership: already exists', existing);
            steps.push(buildStep('ensureMembership', true, existing, null, true));
            return true;
        }
    } catch (readErr) {
        // A failed read must not block the write attempt below.
        log('ensureMembership: pre-read failed (non-fatal)', readErr);
    }

    const { error } = await supabase.from('workspace_members').insert({
        workspace_id: workspaceId,
        user_id: userId,
        role: 'owner',
    });

    log('ensureMembership: insert', { workspaceId, userId, error });

    if (error && !isDuplicateError(error)) {
        steps.push(buildStep('ensureMembership', false, null, error));
        throw error;
    }

    steps.push(buildStep('ensureMembership', true, { workspaceId }));
    return true;
};

const ensureBrandProfile = async (workspaceId, brandData, steps) => {
    const existingId = await getBrandProfileId(workspaceId);
    if (existingId) {
        log('ensureBrandProfile: already exists', existingId);
        steps.push(buildStep('ensureBrandProfile', true, { id: existingId }, null, true));
        return;
    }

    const { error } = await supabase
        .from('brand_profiles')
        .insert(toBrandProfileInsert(workspaceId, brandData));

    log('ensureBrandProfile: insert', { workspaceId, error });

    if (error && !isDuplicateError(error)) {
        steps.push(buildStep('ensureBrandProfile', false, null, error, true));
        return;
    }

    steps.push(buildStep('ensureBrandProfile', true, { workspaceId }));
};

const isProfileErrorRecoverable = (error) =>
    error?.code === '42501' ||
    /row-level security|permission denied|42501/i.test(error?.message ?? '');

const ensureUserProfile = async (userId, workspaceId, steps) => {
    const profilePatch = {
        active_workspace_id: workspaceId,
        onboarding_complete: true,
    };

    onboardingTrace('ensureUserProfile:start', { userId, workspaceId });

    const { error: updateError } = await supabase
        .from('user_profiles')
        .update(profilePatch)
        .eq('id', userId);

    log('ensureUserProfile: update', { userId, workspaceId, updateError });

    if (updateError && !isProfileErrorRecoverable(updateError)) {
        steps.push(buildStep('ensureUserProfile', false, null, updateError));
        throw updateError;
    }

    if (updateError) {
        steps.push(buildStep('ensureUserProfileUpdate', false, null, updateError, true));
    }

    const { data: profile, error: readError } = await supabase
        .from('user_profiles')
        .select('id, active_workspace_id, onboarding_complete')
        .eq('id', userId)
        .maybeSingle();

    log('ensureUserProfile: read', { profile, readError });

    if (readError && !isProfileErrorRecoverable(readError)) {
        steps.push(buildStep('ensureUserProfileRead', false, null, readError));
        throw readError;
    }

    if (readError) {
        steps.push(buildStep('ensureUserProfileRead', false, null, readError, true));
        onboardingTrace('ensureUserProfile:end', { skipped: true, reason: 'read-error-recoverable' });
        return;
    }

    if (!profile) {
        const { error: insertError } = await supabase.from('user_profiles').insert({
            id: userId,
            ...profilePatch,
        });

        log('ensureUserProfile: insert', { insertError });

        if (insertError && !isDuplicateError(insertError) && !isProfileErrorRecoverable(insertError)) {
            steps.push(buildStep('ensureUserProfileInsert', false, null, insertError));
            throw insertError;
        }

        if (insertError && isDuplicateError(insertError)) {
            const { error: retryUpdateError } = await supabase
                .from('user_profiles')
                .update(profilePatch)
                .eq('id', userId);

            if (retryUpdateError && !isProfileErrorRecoverable(retryUpdateError)) {
                steps.push(buildStep('ensureUserProfileRetryUpdate', false, null, retryUpdateError));
                throw retryUpdateError;
            }
        }

        if (insertError && isProfileErrorRecoverable(insertError)) {
            steps.push(buildStep('ensureUserProfileInsert', false, null, insertError, true));
            onboardingTrace('ensureUserProfile:end', { skipped: true, reason: 'insert-rls-recoverable' });
            return;
        }
    } else if (
        String(profile.active_workspace_id) !== String(workspaceId) ||
        !profile.onboarding_complete
    ) {
        const { error: patchError } = await supabase
            .from('user_profiles')
            .update(profilePatch)
            .eq('id', userId);

        if (patchError && !isProfileErrorRecoverable(patchError)) {
            steps.push(buildStep('ensureUserProfilePatch', false, null, patchError));
            throw patchError;
        }

        if (patchError) {
            steps.push(buildStep('ensureUserProfilePatch', false, null, patchError, true));
            onboardingTrace('ensureUserProfile:end', { skipped: true, reason: 'patch-rls-recoverable' });
            return;
        }
    }

    steps.push(buildStep('ensureUserProfile', true, { workspaceId }));
    onboardingTrace('ensureUserProfile:end', { ok: true });
};

/**
 * Best-effort confirmation read. Never throws and never fails onboarding on its
 * own - membership was already confirmed by the write in ensureMembership. This
 * only retries the read to warm read-after-write visibility for the redirect.
 */
const verifyAccessibleState = async (userId, workspaceId, steps, maxAttempts = 3) => {
    onboardingTrace('verifyAccessibleState:start', { userId, workspaceId });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const membership = await getMembershipForWorkspace(userId, workspaceId);
            if (membership) {
                steps.push(buildStep('verifyAccessibleState', true, { attempt }));
                onboardingTrace('verifyAccessibleState:end', { ok: true, attempt });
                return true;
            }
        } catch (err) {
            log('verifyAccessibleState: read failed (non-fatal)', err);
        }

        if (attempt < maxAttempts) {
            await sleep(150 * attempt);
        }
    }

    // Read never confirmed, but the membership write already succeeded upstream.
    steps.push(buildStep('verifyAccessibleState', true, { confirmedByWrite: true }, null, true));
    onboardingTrace('verifyAccessibleState:end', { ok: true, confirmedByWrite: true });
    return true;
};

/**
 * Orchestrates onboarding writes and recovery.
 * Success = user has membership + active workspace (client state set).
 * Does not depend on joined workspace reads returning rows.
 */
export const onboardingService = {
    completeOnboarding: async (workspaceData, { forceNew = false } = {}) => {
        const steps = [];
        onboardingTrace('completeOnboarding:start', { forceNew, workspaceData });

        try {
            const user = await requireUser();
            const normalizedData = {
                ...workspaceData,
                url: normalizeUrl(workspaceData.url),
            };
            const insertPayloadBase = toWorkspaceInsert(normalizedData);

            let workspaceId = null;
            let resumed = false;

            if (!forceNew) {
                const recoverableId = await findRecoverableWorkspaceId(user.id);
                if (recoverableId) {
                    workspaceId = recoverableId;
                    resumed = true;
                    log('recoverWorkspace', { workspaceId });

                    const { error: updateError } = await supabase
                        .from('workspaces')
                        .update(insertPayloadBase)
                        .eq('id', workspaceId);

                    if (updateError) {
                        log('recoverWorkspace: metadata update failed (non-fatal)', updateError);
                    }

                    steps.push(buildStep('recoverWorkspace', true, { workspaceId }));
                }
            }

            if (!workspaceId) {
                workspaceId = generateUuid();
                const insertPayload = { id: workspaceId, ...insertPayloadBase };

                const { error: workspaceError } = await supabase
                    .from('workspaces')
                    .insert(insertPayload);

                log('createWorkspace', { insertPayload, workspaceError });

                if (workspaceError) {
                    steps.push(buildStep('createWorkspace', false, null, workspaceError));
                    throw new OnboardingError(workspaceError.message, {
                        steps,
                        cause: workspaceError,
                    });
                }

                steps.push(buildStep('createWorkspace', true, { workspaceId }));
            }

            const brandPayload = {
                name: insertPayloadBase.name,
                url: insertPayloadBase.url ?? '',
                tagline: insertPayloadBase.tagline ?? '',
                colors: insertPayloadBase.brand_colors ?? [
                    '#6666ff',
                    '#b9b8ff',
                    '#b9f0d7',
                    '#ffffff',
                ],
            };

            // Membership is the authoritative success signal. If this throws, the
            // workspace genuinely could not be made accessible and we surface it.
            await ensureMembership(user.id, workspaceId, steps);

            // Everything below is best-effort and must never fail onboarding.
            try {
                await ensureBrandProfile(workspaceId, brandPayload, steps);
            } catch (brandErr) {
                log('ensureBrandProfile failed (non-fatal)', brandErr);
                steps.push(buildStep('ensureBrandProfile', false, null, brandErr, true));
            }

            try {
                await ensureUserProfile(user.id, workspaceId, steps);
            } catch (profileErr) {
                log('ensureUserProfile failed (non-fatal)', profileErr);
                steps.push(buildStep('ensureUserProfile', false, null, profileErr, true));
            }

            await verifyAccessibleState(user.id, workspaceId, steps);

            clientState.setActiveWorkspaceId(workspaceId);
            const workspace = buildWorkspaceRowFromInsert(workspaceId, insertPayloadBase);

            steps.push(buildStep('complete', true, { workspaceId, resumed }));
            log('completeOnboarding: success', { workspaceId, resumed, steps });
            onboardingTrace('completeOnboarding:end', { ok: true, workspaceId, resumed });

            return { ok: true, workspace, resumed, steps };
        } catch (err) {
            log('completeOnboarding: failed', err, steps);
            onboardingTrace('completeOnboarding:end', {
                ok: false,
                error: err?.message,
                cause: err?.cause?.message,
                steps,
            });
            if (err instanceof OnboardingError) {
                throw err;
            }
            throw new OnboardingError(err?.message ?? 'Onboarding failed', { steps, cause: err });
        }
    },
};
