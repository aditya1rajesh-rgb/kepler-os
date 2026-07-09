import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { mapCampaignRow, mapContentItemRow, toCampaignInsert } from '../lib/mappers';

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

/**
 * Campaign Service - the "team spine". A campaign groups a goal + strategy + an
 * ordered plan of steps (plan.steps[], each mapped to a specialist module) and
 * the content_items generated for it (via content_items.campaign_id). Plans are
 * already normalized by their producer (strategyService / campaignIntakeService),
 * so this layer just persists + mutates them.
 */
export const campaignService = {
    /** List campaigns for a workspace, newest first. Optional status filter. */
    listCampaigns: async (workspaceId, { status = null, limit = 100 } = {}) => {
        assertWorkspaceId(workspaceId);
        let query = supabase
            .from('campaigns')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (status) query = query.eq('status', status);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map(mapCampaignRow);
    },

    /** Single campaign by id (detail / manager view). */
    getCampaign: async (workspaceId, campaignId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', campaignId)
            .eq('workspace_id', workspaceId)
            .maybeSingle();
        if (error) throw error;
        return data ? mapCampaignRow(data) : null;
    },

    /** Persist a (normalized) plan. Starts in 'draft' until the user confirms it. */
    createCampaign: async (workspaceId, { title = '', goal = '', campaignType = 'launch', plan = {}, source = 'strategy-engine', status = 'draft' } = {}) => {
        assertWorkspaceId(workspaceId);
        const insert = toCampaignInsert(workspaceId, {
            title: title || goal.slice(0, 80) || 'Untitled campaign',
            goal,
            campaignType,
            plan,
            source,
            status,
        });
        const { data, error } = await supabase
            .from('campaigns')
            .insert(insert)
            .select()
            .maybeSingle();
        if (error) throw error;
        return mapCampaignRow(data ?? insert);
    },

    /** Patch title/goal/status/campaignType/plan on a campaign. */
    updateCampaign: async (workspaceId, campaignId, updates = {}) => {
        assertWorkspaceId(workspaceId);
        const patch = {};
        if (updates.title !== undefined) patch.title = updates.title;
        if (updates.goal !== undefined) patch.goal = updates.goal;
        if (updates.status !== undefined) patch.status = updates.status;
        if (updates.campaignType !== undefined) patch.campaign_type = updates.campaignType;
        if (updates.plan !== undefined) patch.plan = updates.plan;

        const { data, error } = await supabase
            .from('campaigns')
            .update(patch)
            .eq('id', campaignId)
            .eq('workspace_id', workspaceId)
            .select()
            .maybeSingle();
        if (error) throw error;
        return data ? mapCampaignRow(data) : null;
    },

    /**
     * Mutate one step inside plan.steps by id and persist. Auto-promotes an
     * 'active' campaign to 'completed' once every step is done or skipped.
     */
    updateStep: async (workspaceId, campaignId, stepId, stepPatch = {}) => {
        assertWorkspaceId(workspaceId);
        const campaign = await campaignService.getCampaign(workspaceId, campaignId);
        if (!campaign) return null;
        const steps = Array.isArray(campaign.plan?.steps) ? campaign.plan.steps : [];
        const nextSteps = steps.map((s) => (s.id === stepId ? { ...s, ...stepPatch } : s));
        const plan = { ...campaign.plan, steps: nextSteps };

        const allSettled = nextSteps.length > 0
            && nextSteps.every((s) => s.status === 'done' || s.status === 'skipped');
        // Promote an active campaign once every step is settled; demote a completed
        // one back to active if a step is re-opened (e.g. undo-skip).
        let nextStatus;
        if (allSettled && campaign.status === 'active') nextStatus = 'completed';
        else if (!allSettled && campaign.status === 'completed') nextStatus = 'active';

        return campaignService.updateCampaign(workspaceId, campaignId, {
            plan,
            ...(nextStatus ? { status: nextStatus } : {}),
        });
    },

    /** Every content item linked to a campaign (the manager view's "linked assets"). */
    getCampaignAssets: async (workspaceId, campaignId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('content_items')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('campaign_id', campaignId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapContentItemRow);
    },

    /** Delete a campaign (assets orphan back to the Library via ON DELETE SET NULL). */
    deleteCampaign: async (workspaceId, campaignId) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('campaigns')
            .delete()
            .eq('id', campaignId)
            .eq('workspace_id', workspaceId);
        if (error) throw error;
        return true;
    },

    /** Lightweight status counts for the cockpit widget. */
    getCampaignSummary: async (workspaceId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('campaigns')
            .select('status')
            .eq('workspace_id', workspaceId);
        if (error) throw error;
        const rows = data ?? [];
        const counts = { active: 0, draft: 0, completed: 0 };
        for (const row of rows) {
            if (counts[row.status] !== undefined) counts[row.status] += 1;
        }
        return { total: rows.length, ...counts };
    },
};

export default campaignService;
