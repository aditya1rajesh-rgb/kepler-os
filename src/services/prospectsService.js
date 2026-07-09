import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

const mapRow = (r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    firstName: r.first_name ?? '',
    lastName: r.last_name ?? '',
    title: r.title ?? '',
    company: r.company ?? '',
    email: r.email ?? '',
    linkedinUrl: r.linkedin_url ?? '',
    location: r.location ?? '',
    source: r.source ?? 'apollo',
    externalId: r.external_id ?? '',
    status: r.status ?? 'saved',
    pushedTo: r.pushed_to ?? '',
    createdAt: r.created_at ?? null,
});

const toInsert = (workspaceId, p) => ({
    workspace_id: workspaceId,
    first_name: (p.firstName ?? '').slice(0, 200),
    last_name: (p.lastName ?? '').slice(0, 200),
    title: (p.title ?? '').slice(0, 300),
    company: (p.company ?? '').slice(0, 300),
    email: (p.email ?? '').slice(0, 320),
    linkedin_url: (p.linkedinUrl ?? '').slice(0, 500),
    location: (p.location ?? '').slice(0, 300),
    source: p.source ?? 'apollo',
    external_id: (p.externalId ?? '').slice(0, 200),
});

/**
 * In-app prospect list (top-of-funnel). Rows are workspace-scoped (RLS); the
 * client reads/writes directly. Apollo search + Zoho push go through the edge
 * functions - see [[connector-architecture]].
 */
export const prospectsService = {
    list: async (workspaceId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('prospects')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapRow);
    },

    /** Insert new prospects, skipping ones already saved (dedupe by external_id). */
    save: async (workspaceId, items = []) => {
        assertWorkspaceId(workspaceId);
        if (!items.length) return [];
        const { data: existing, error: exErr } = await supabase
            .from('prospects')
            .select('external_id')
            .eq('workspace_id', workspaceId);
        if (exErr) throw exErr;
        const seen = new Set((existing ?? []).map((r) => r.external_id).filter(Boolean));
        const fresh = items.filter((p) => !p.externalId || !seen.has(p.externalId));
        if (!fresh.length) return [];
        const { data, error } = await supabase
            .from('prospects')
            .insert(fresh.map((p) => toInsert(workspaceId, p)))
            .select('*');
        if (error) throw error;
        return (data ?? []).map(mapRow);
    },

    remove: async (workspaceId, id) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('prospects')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('id', id);
        if (error) throw error;
    },

    /** Mark prospects as pushed to a CRM after a successful push. */
    markPushed: async (workspaceId, ids = [], pushedTo = 'zoho') => {
        assertWorkspaceId(workspaceId);
        if (!ids.length) return;
        const { error } = await supabase
            .from('prospects')
            .update({ status: 'pushed', pushed_to: pushedTo })
            .eq('workspace_id', workspaceId)
            .in('id', ids);
        if (error) throw error;
    },
};

export default prospectsService;
