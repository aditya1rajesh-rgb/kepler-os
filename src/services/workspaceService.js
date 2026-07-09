import { supabase } from '../lib/supabase';
import { clientState } from '../lib/clientState';
import { isUuid } from '../lib/validation';
import { mapWorkspaceRow } from '../lib/mappers';
import { onboardingService } from './onboardingService';

const normalizeUrl = (url) => {
    if (!url) return '';
    return url
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')
        .toLowerCase();
};

const requireUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) throw new Error('Not authenticated');
    return user;
};

const pickActiveFromList = (workspaces, preferredId) => {
    if (!workspaces?.length) return null;

    if (preferredId && isUuid(preferredId)) {
        const match = workspaces.find((ws) => String(ws.id) === String(preferredId));
        if (match) return String(match.id);
    }

    return String(workspaces[0].id);
};

/**
 * Workspace Service - Supabase only. Membership enforced by RLS + explicit filters.
 */
export const workspaceService = {
    getActiveWorkspaceId: () => clientState.getActiveWorkspaceId(),

    setActiveWorkspaceId: async (workspaceId) => {
        if (!isUuid(workspaceId)) {
            throw new Error('Invalid workspace id');
        }

        clientState.setActiveWorkspaceId(workspaceId);

        const user = await requireUser();
        await supabase
            .from('user_profiles')
            .update({ active_workspace_id: workspaceId })
            .eq('id', user.id);
    },

    isOnboardingComplete: async () => {
        const user = await requireUser();
        const { data, error } = await supabase
            .from('user_profiles')
            .select('onboarding_complete')
            .eq('id', user.id)
            .maybeSingle();

        if (error) throw error;
        return Boolean(data?.onboarding_complete);
    },

    getUserProfile: async () => {
        const user = await requireUser();
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (error) throw error;
        return data;
    },

    /** Update the current user's profile (display name). */
    updateProfile: async ({ displayName }) => {
        const user = await requireUser();
        const patch = {};
        if (displayName !== undefined) patch.display_name = displayName;
        const { data, error } = await supabase
            .from('user_profiles')
            .update(patch)
            .eq('id', user.id)
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    syncActiveWorkspaceFromProfile: async () => {
        const workspaces = await workspaceService.getWorkspaces();
        if (!workspaces.length) {
            const activeId = clientState.getActiveWorkspaceId();
            if (!activeId || !isUuid(activeId)) {
                clientState.clear();
            }
            return activeId && isUuid(activeId) ? activeId : null;
        }

        let preferred = clientState.getActiveWorkspaceId();

        try {
            const profile = await workspaceService.getUserProfile();
            if (profile?.active_workspace_id && isUuid(profile.active_workspace_id)) {
                preferred = String(profile.active_workspace_id);
            }
        } catch {
            // non-fatal during bootstrap
        }

        const resolved = pickActiveFromList(workspaces, preferred);
        if (resolved) {
            clientState.setActiveWorkspaceId(resolved);
        }
        return resolved;
    },

    resolveActiveWorkspaceId: async (workspaces = null) => {
        const list = workspaces ?? await workspaceService.getWorkspaces();
        if (!list.length) return null;

        let preferred = clientState.getActiveWorkspaceId();
        try {
            const profile = await workspaceService.getUserProfile();
            if (profile?.active_workspace_id) {
                preferred = String(profile.active_workspace_id);
            }
        } catch {
            // ignore
        }

        const resolved = pickActiveFromList(list, preferred);
        if (resolved) {
            clientState.setActiveWorkspaceId(resolved);
        }
        return resolved;
    },

    getWorkspaces: async () => {
        const user = await requireUser();
        const { data, error } = await supabase
            .from('workspaces')
            .select('*, workspace_members!inner(user_id)')
            .eq('workspace_members.user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data ?? []).map(mapWorkspaceRow);
    },

    getWorkspace: async (workspaceId) => {
        if (!isUuid(workspaceId)) return null;

        const user = await requireUser();
        const { data, error } = await supabase
            .from('workspaces')
            .select('*, workspace_members!inner(user_id)')
            .eq('id', workspaceId)
            .eq('workspace_members.user_id', user.id)
            .maybeSingle();

        if (error) throw error;
        return data ? mapWorkspaceRow(data) : null;
    },

    assertMembership: async (workspaceId) => {
        const workspace = await workspaceService.getWorkspace(workspaceId);
        return Boolean(workspace);
    },

    createWorkspace: async (workspaceData) => {
        const result = await onboardingService.completeOnboarding(workspaceData, { forceNew: true });
        return result.workspace;
    },

    updateWorkspace: async (id, updates) => {
        if (!isUuid(id)) throw new Error('Invalid workspace id');

        const dbUpdates = {};
        if (updates.name != null) dbUpdates.name = updates.name;
        if (updates.url != null) dbUpdates.url = normalizeUrl(updates.url);
        if (updates.tagline != null) dbUpdates.tagline = updates.tagline;
        if (updates.industry != null) dbUpdates.industry = updates.industry;
        if (updates.logoColor != null) dbUpdates.logo_color = updates.logoColor;
        if (updates.brandColors != null) dbUpdates.brand_colors = updates.brandColors;
        if (updates.lastActiveModule != null) dbUpdates.last_active_module = updates.lastActiveModule;
        if (updates.brandIntelStatus != null) dbUpdates.brand_intel_status = updates.brandIntelStatus;

        const { error } = await supabase
            .from('workspaces')
            .update(dbUpdates)
            .eq('id', id);

        if (error) throw error;

        return workspaceService.getWorkspace(id);
    },

    deleteWorkspace: async (id) => {
        if (!isUuid(id)) throw new Error('Invalid workspace id');

        const { error } = await supabase.from('workspaces').delete().eq('id', id);
        if (error) throw error;
        return true;
    },
};
