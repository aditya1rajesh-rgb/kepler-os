import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';

// Replies inbox (E3.1 surface) + suppression list (D9 — append-only for
// clients; rows are permanent by design, there is no remove()).

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

const mapReply = (r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    prospectId: r.prospect_id,
    enrollmentId: r.enrollment_id ?? null,
    messageId: r.message_id ?? null,
    kind: r.kind,
    source: r.source ?? 'zoho_poll',
    snippet: r.raw_snippet ?? '',
    receivedAt: r.received_at ?? null,
    prospect: r.prospect
        ? {
            firstName: r.prospect.first_name ?? '',
            lastName: r.prospect.last_name ?? '',
            company: r.prospect.company ?? '',
            email: r.prospect.email ?? '',
        }
        : null,
});

export const repliesService = {
    list: async (workspaceId, { limit = 100 } = {}) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('replies')
            .select('*, prospect:prospects(first_name, last_name, company, email)')
            .eq('workspace_id', workspaceId)
            .order('received_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data ?? []).map(mapReply);
    },

    /** Sends / replies / meetings counters for the activity strip (leading slice of E5). */
    activityCounts: async (workspaceId) => {
        assertWorkspaceId(workspaceId);
        const [sends, replies, meetings] = await Promise.all([
            supabase.from('messages').select('id', { count: 'exact', head: true })
                .eq('workspace_id', workspaceId).eq('status', 'sent'),
            supabase.from('replies').select('id', { count: 'exact', head: true })
                .eq('workspace_id', workspaceId).eq('kind', 'reply'),
            supabase.from('enrollments').select('id', { count: 'exact', head: true })
                .eq('workspace_id', workspaceId).eq('status', 'meeting'),
        ]);
        for (const r of [sends, replies, meetings]) if (r.error) throw r.error;
        return { sends: sends.count ?? 0, replies: replies.count ?? 0, meetings: meetings.count ?? 0 };
    },
};

export const suppressionService = {
    list: async (workspaceId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('suppression_list')
            .select('id, email, reason, created_at')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },

    /** Manual suppression — permanent, checked at send time by the scheduler. */
    add: async (workspaceId, email) => {
        assertWorkspaceId(workspaceId);
        const normalized = String(email ?? '').trim().toLowerCase();
        if (!normalized) throw new Error('An email address is required.');
        const { error } = await supabase
            .from('suppression_list')
            .insert({ workspace_id: workspaceId, email: normalized, reason: 'manual' });
        if (error && error.code !== '23505') throw error; // already suppressed = fine
    },
};

export default repliesService;
