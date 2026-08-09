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
    // NOTE: inbox-monitor writes `email.subject` here, not the body — so this is
    // a subject line despite the column name. Don't present it as reply content.
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
    // Attached by withContext() — a reply without the sequence it answers is
    // just a name and a timestamp, which is why the old Inbox panel was unusable.
    enrollment: null,
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

    /**
     * Replies with the enrollment and sequence they answer (E16).
     *
     * Deliberately two queries joined here rather than a nested embed
     * (`enrollment:enrollments(...,sequence:sequences(...))`). Two levels of
     * embedding is the sort of thing that works against PostgREST and quietly
     * returns nulls against the demo shim, and a screen whose context silently
     * vanishes in the demo is worse than one extra round trip.
     */
    listWithContext: async (workspaceId, { limit = 100 } = {}) => {
        assertWorkspaceId(workspaceId);
        const [replies, { data: enrollmentRows, error: enrErr }] = await Promise.all([
            repliesService.list(workspaceId, { limit }),
            supabase
                .from('enrollments')
                .select('id, status, current_step, sequence_id, sequence:sequences(id, name)')
                .eq('workspace_id', workspaceId),
        ]);
        if (enrErr) throw enrErr;

        const byId = new Map();
        for (const e of enrollmentRows ?? []) {
            byId.set(e.id, {
                id: e.id,
                status: e.status ?? '',
                currentStep: e.current_step ?? 0,
                sequenceId: e.sequence?.id ?? e.sequence_id ?? null,
                sequenceName: e.sequence?.name ?? '',
            });
        }
        // enrollment_id is nullable, and ON DELETE SET NULL means an archived
        // sequence leaves its replies orphaned. Those still belong on the screen
        // — the prospect replied to you either way — just without context.
        return replies.map((r) => ({ ...r, enrollment: r.enrollmentId ? byId.get(r.enrollmentId) ?? null : null }));
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
