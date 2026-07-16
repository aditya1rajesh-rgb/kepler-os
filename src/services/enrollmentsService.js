import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';

// Enrollments: one prospect × one sequence — the scheduler's work queue.
// Client-side checks here (email present, not suppressed, no duplicates) are a
// COURTESY for the pre-launch summary; the send-scheduler re-enforces the law
// at send time (§9.5).

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

const mapRow = (r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    sequenceId: r.sequence_id,
    prospectId: r.prospect_id,
    status: r.status ?? 'active',
    currentStep: r.current_step ?? 0,
    nextSendAt: r.next_send_at ?? null,
    stopReason: r.stop_reason ?? '',
    meetingAt: r.meeting_at ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    prospect: r.prospect
        ? {
            id: r.prospect.id,
            firstName: r.prospect.first_name ?? '',
            lastName: r.prospect.last_name ?? '',
            company: r.prospect.company ?? '',
            email: r.prospect.email ?? '',
        }
        : null,
    sequenceName: r.sequence?.name ?? '',
});

export const enrollmentsService = {
    /**
     * Enroll prospects into a sequence. Returns the pre-launch summary shape:
     * { enrolled, skipped: { missingEmail, suppressed, alreadyEnrolled } }.
     */
    enroll: async (workspaceId, sequenceId, prospects = [], { startAt = null } = {}) => {
        assertWorkspaceId(workspaceId);
        if (!isUuid(sequenceId)) throw new Error('Invalid sequence id');
        const skipped = { missingEmail: 0, suppressed: 0, alreadyEnrolled: 0 };

        const withEmail = [];
        for (const p of prospects) {
            if (String(p.email ?? '').trim()) withEmail.push(p);
            else skipped.missingEmail += 1;
        }
        if (!withEmail.length) return { enrolled: 0, skipped };

        // Enroll-time suppression courtesy check (send time is the law — D9).
        const { data: supRows, error: supErr } = await supabase
            .from('suppression_list')
            .select('email')
            .eq('workspace_id', workspaceId);
        if (supErr) throw supErr;
        const suppressed = new Set((supRows ?? []).map((r) => r.email));
        const clean = [];
        for (const p of withEmail) {
            if (suppressed.has(p.email.trim().toLowerCase())) skipped.suppressed += 1;
            else clean.push(p);
        }
        if (!clean.length) return { enrolled: 0, skipped };

        const { data: existing, error: exErr } = await supabase
            .from('enrollments')
            .select('prospect_id')
            .eq('sequence_id', sequenceId);
        if (exErr) throw exErr;
        const already = new Set((existing ?? []).map((r) => r.prospect_id));
        const fresh = clean.filter((p) => {
            if (already.has(p.id)) { skipped.alreadyEnrolled += 1; return false; }
            return true;
        });
        if (!fresh.length) return { enrolled: 0, skipped };

        const nextSendAt = startAt ? new Date(startAt).toISOString() : new Date().toISOString();
        const { data, error } = await supabase
            .from('enrollments')
            .insert(fresh.map((p) => ({
                workspace_id: workspaceId,
                sequence_id: sequenceId,
                prospect_id: p.id,
                status: 'active',
                current_step: 0,
                next_send_at: nextSendAt,
            })))
            .select('id');
        if (error) throw error;
        return { enrolled: (data ?? []).length, skipped };
    },

    list: async (workspaceId, { sequenceId = null } = {}) => {
        assertWorkspaceId(workspaceId);
        let query = supabase
            .from('enrollments')
            .select('*, prospect:prospects(id, first_name, last_name, company, email), sequence:sequences(name)')
            .eq('workspace_id', workspaceId)
            .order('updated_at', { ascending: false });
        if (sequenceId) query = query.eq('sequence_id', sequenceId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map(mapRow);
    },

    pause: async (workspaceId, id) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('enrollments')
            .update({ status: 'paused', next_send_at: null })
            .eq('workspace_id', workspaceId)
            .eq('id', id);
        if (error) throw error;
    },

    /** Resume schedules from NOW — no catch-up flood of missed touches (E2.4). */
    resume: async (workspaceId, id) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('enrollments')
            .update({ status: 'active', next_send_at: new Date().toISOString(), stop_reason: '' })
            .eq('workspace_id', workspaceId)
            .eq('id', id);
        if (error) throw error;
    },

    /**
     * "Replied elsewhere" (phone call, LinkedIn…) — E2.2 manual path: records a
     * manual reply and cancels the remaining touches, same as a detected reply.
     */
    markRepliedElsewhere: async (workspaceId, enrollment, note = '') => {
        assertWorkspaceId(workspaceId);
        const { error: rErr } = await supabase.from('replies').insert({
            workspace_id: workspaceId,
            prospect_id: enrollment.prospectId,
            enrollment_id: enrollment.id,
            kind: 'reply',
            source: 'manual',
            raw_snippet: String(note ?? '').slice(0, 500),
        });
        if (rErr) throw rErr;
        const { error } = await supabase
            .from('enrollments')
            .update({ status: 'stopped_reply', stop_reason: 'replied_elsewhere', next_send_at: null })
            .eq('workspace_id', workspaceId)
            .eq('id', enrollment.id);
        if (error) throw error;
    },

    /** Operator tags a meeting booked (the R1 north-star metric). */
    markMeeting: async (workspaceId, id) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('enrollments')
            .update({ status: 'meeting', meeting_at: new Date().toISOString(), next_send_at: null })
            .eq('workspace_id', workspaceId)
            .eq('id', id);
        if (error) throw error;
    },
};

export default enrollmentsService;
