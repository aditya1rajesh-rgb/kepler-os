import { supabase } from '../lib/supabase';
import { isUuid, sanitizeText } from '../lib/validation';

// Named prospect lists (reusable audiences). A list groups saved prospects; the
// Sequences builder targets a whole list, and enrollment resolves it to members
// with an email at prepare time. Workspace-scoped (RLS); the client reads/writes
// directly - see [[connector-architecture]]. Mirrors prospectsService's shape.

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

const mapList = (r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name ?? '',
    description: r.description ?? '',
    // PostgREST returns the embedded aggregate as [{ count }].
    memberCount: Array.isArray(r.prospect_list_members) ? (r.prospect_list_members[0]?.count ?? 0) : 0,
    createdAt: r.created_at ?? null,
});

const mapMember = (r) => {
    const p = r.prospect ?? {};
    return {
        memberId: r.id,
        id: p.id,
        firstName: p.first_name ?? '',
        lastName: p.last_name ?? '',
        title: p.title ?? '',
        company: p.company ?? '',
        email: p.email ?? '',
        // phone is added by the enrichment migration (029); until then it's blank.
        phone: p.phone ?? '',
        location: p.location ?? '',
        externalId: p.external_id ?? '',
        status: p.status ?? '',
        linkedinUrl: p.linkedin_url ?? '',
    };
};

export const prospectListsService = {
    /** All lists for the workspace, newest first, each with a member count. */
    listLists: async (workspaceId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('prospect_lists')
            .select('*, prospect_list_members(count)')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapList);
    },

    createList: async (workspaceId, name, description = '') => {
        assertWorkspaceId(workspaceId);
        const clean = sanitizeText(name, 120);
        if (!clean) throw new Error('A list name is required.');
        const { data, error } = await supabase
            .from('prospect_lists')
            .insert({ workspace_id: workspaceId, name: clean, description: sanitizeText(description, 300) })
            .select('*, prospect_list_members(count)')
            .single();
        if (error) throw error;
        return mapList(data);
    },

    /** Add prospects to a list; duplicates (already members) are ignored. */
    addMembers: async (workspaceId, listId, prospectIds = []) => {
        assertWorkspaceId(workspaceId);
        const ids = Array.from(new Set(prospectIds.filter(isUuid)));
        if (!listId || !ids.length) return [];
        const rows = ids.map((prospectId) => ({ workspace_id: workspaceId, list_id: listId, prospect_id: prospectId }));
        const { data, error } = await supabase
            .from('prospect_list_members')
            .upsert(rows, { onConflict: 'list_id,prospect_id', ignoreDuplicates: true })
            .select('id');
        if (error) throw error;
        return data ?? [];
    },

    removeMember: async (workspaceId, listId, prospectId) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('prospect_list_members')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('list_id', listId)
            .eq('prospect_id', prospectId);
        if (error) throw error;
    },

    /** Members of a list, joined to the prospect record (best fit for enrollment). */
    listMembers: async (workspaceId, listId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('prospect_list_members')
            // select * on the prospect so the phone column (migration 029) is picked
            // up automatically once applied, without erroring before it exists.
            .select('id, prospect:prospects(*)')
            .eq('workspace_id', workspaceId)
            .eq('list_id', listId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapMember).filter((m) => m.id);
    },

    deleteList: async (workspaceId, listId) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('prospect_lists')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('id', listId);
        if (error) throw error;
    },
};

export default prospectListsService;
