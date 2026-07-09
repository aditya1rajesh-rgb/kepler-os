import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { mapContentItemRow } from '../lib/mappers';

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

/**
 * Content Service - unified marketing content pipeline (content_items table).
 * Items move Queue → Generating → Completed across modules (seo/social/ads/outreach).
 */
export const contentService = {
    /** Fetch all items for a workspace + type, newest first. */
    getContentItems: async (workspaceId, type = 'seo') => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('content_items')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('type', type)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapContentItemRow);
    },

    /** Recent items across ALL content types for a workspace, newest first. */
    getRecentContent: async (workspaceId, { limit = 8 } = {}) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('content_items')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data ?? []).map(mapContentItemRow);
    },

    /**
     * Aggregate counts across every content type for a workspace.
     * Returns { total, byType: { seo, ads, outreach, social }, byStatus: { queue, generating, completed } }.
     * One lightweight query (type/status only), aggregated client-side.
     */
    getContentSummary: async (workspaceId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('content_items')
            .select('type,status')
            .eq('workspace_id', workspaceId);
        if (error) throw error;
        const rows = data ?? [];
        const byType = { seo: 0, ads: 0, outreach: 0, social: 0 };
        const byStatus = { queue: 0, generating: 0, completed: 0 };
        for (const row of rows) {
            if (byType[row.type] !== undefined) byType[row.type] += 1;
            if (byStatus[row.status] !== undefined) byStatus[row.status] += 1;
        }
        return { total: rows.length, byType, byStatus };
    },

    /**
     * All of the current user's content across every workspace they belong to,
     * newest first. RLS scopes rows to the user's memberships, so no workspace
     * filter is needed. Powers the Home dashboard (cross-workspace activity + counts).
     */
    getUserContent: async ({ limit = 200 } = {}) => {
        const { data, error } = await supabase
            .from('content_items')
            .select('id,type,status,title,workspace_id,created_at')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data ?? []).map((row) => ({
            id: row.id,
            type: row.type ?? 'seo',
            status: row.status ?? 'queue',
            title: row.title ?? '',
            workspaceId: row.workspace_id,
            createdAt: row.created_at ?? null,
        }));
    },

    /** Every content item for a workspace across all types, newest first (Content Library). */
    getAllContent: async (workspaceId, { limit = 500 } = {}) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('content_items')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data ?? []).map(mapContentItemRow);
    },

    /** Create one item. */
    createContentItem: async (workspaceId, type, item) => {
        assertWorkspaceId(workspaceId);
        const insertPayload = {
            workspace_id: workspaceId,
            type,
            status: item.status ?? 'queue',
            title: item.title ?? '',
            target_keyword: item.targetKeyword ?? '',
            intent: item.intent ?? '',
            payload: item.payload ?? {},
            source: item.source ?? 'manual',
            ...(item.campaignId ? { campaign_id: item.campaignId } : {}),
            ...(item.campaignStepId ? { campaign_step_id: item.campaignStepId } : {}),
        };
        const { data, error } = await supabase
            .from('content_items')
            .insert(insertPayload)
            .select()
            .maybeSingle();
        if (error) throw error;
        return mapContentItemRow(data ?? insertPayload);
    },

    /** Bulk create (e.g. seed the queue from a keyword research run). */
    createContentItems: async (workspaceId, type, items) => {
        assertWorkspaceId(workspaceId);
        if (!items?.length) return [];
        const rows = items.map((item) => ({
            workspace_id: workspaceId,
            type,
            status: item.status ?? 'queue',
            title: item.title ?? '',
            target_keyword: item.targetKeyword ?? '',
            intent: item.intent ?? '',
            payload: item.payload ?? {},
            source: item.source ?? 'manual',
            ...(item.campaignId ? { campaign_id: item.campaignId } : {}),
            ...(item.campaignStepId ? { campaign_step_id: item.campaignStepId } : {}),
        }));
        const { data, error } = await supabase
            .from('content_items')
            .insert(rows)
            .select();
        if (error) throw error;
        return (data ?? rows).map(mapContentItemRow);
    },

    /** Update fields on an item (status transitions, payload writes, edits). */
    updateContentItem: async (workspaceId, id, updates) => {
        assertWorkspaceId(workspaceId);
        const patch = {};
        if (updates.status !== undefined) patch.status = updates.status;
        if (updates.title !== undefined) patch.title = updates.title;
        if (updates.targetKeyword !== undefined) patch.target_keyword = updates.targetKeyword;
        if (updates.intent !== undefined) patch.intent = updates.intent;
        if (updates.payload !== undefined) patch.payload = updates.payload;
        if (updates.source !== undefined) patch.source = updates.source;
        if (updates.campaignId !== undefined) patch.campaign_id = updates.campaignId;
        if (updates.campaignStepId !== undefined) patch.campaign_step_id = updates.campaignStepId;

        const { data, error } = await supabase
            .from('content_items')
            .update(patch)
            .eq('id', id)
            .eq('workspace_id', workspaceId)
            .select()
            .maybeSingle();
        if (error) throw error;
        return data ? mapContentItemRow(data) : null;
    },

    /** Delete an item. */
    deleteContentItem: async (workspaceId, id) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('content_items')
            .delete()
            .eq('id', id)
            .eq('workspace_id', workspaceId);
        if (error) throw error;
        return true;
    },
};

export default contentService;
