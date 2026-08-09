import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { eventService } from './eventService';

// Executable sequences (R1a — the bridge from generation to execution, §9.4).
// A generated sequence is PROMOTED into `sequences` as a draft; the Approve
// flow is the only path to sendable status. The DB enforces the identity gate:
// editing steps on an approved sequence resets it to draft (migration 022
// trigger), and the send-scheduler refuses anything not approved/active.

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

// Tokens the scheduler can resolve from prospect fields at send time (must
// mirror TOKEN_FIELDS in supabase/functions/send-scheduler/core.ts). Anything
// else ({{signal}}, {{observation}}, {{proofPoint}}…) must be edited out
// before approval — the scheduler blocks rather than send a literal token.
export const RESOLVABLE_TOKENS = ['firstname', 'lastname', 'fullname', 'company', 'title', 'email'];

export const findUnresolvableTokens = (steps = []) => {
    const bad = new Set();
    for (const step of steps) {
        const text = `${step.subject ?? ''} ${step.body ?? ''}`;
        for (const m of text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
            if (!RESOLVABLE_TOKENS.includes(m[1].toLowerCase())) bad.add(`{{${m[1]}}}`);
        }
    }
    return Array.from(bad);
};

/** Browser-default business-hours send window (O6). */
export const defaultSendWindow = () => ({
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    days: [1, 2, 3, 4, 5],
    startHour: 9,
    endHour: 17,
});

// Generated steps → executable steps. R1a executes email only; LinkedIn/SMS
// touches stay manual (copy from the timeline) until R3 manual-assist.
export const toExecutableSteps = (generatedSteps = []) =>
    generatedSteps
        .filter((s) => (s.channel ?? 'email') === 'email')
        .map((s, i) => {
            const body = String(s.body ?? '').trim();
            const cta = String(s.cta ?? '').trim();
            return {
                idx: i,
                dayOffset: typeof s.dayOffset === 'number' ? s.dayOffset : i * 2,
                subject: String(s.subject ?? '').trim() || `Follow-up ${i + 1}`,
                // Keep the CTA in the sent copy unless it's already inline.
                body: cta && !body.includes(cta) ? `${body}\n\n${cta}` : body,
            };
        });

const mapRow = (r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    campaignId: r.campaign_id ?? null,
    contentItemId: r.content_item_id ?? null,
    name: r.name ?? '',
    channel: r.channel ?? 'email',
    mode: r.mode ?? 'warm',
    status: r.status ?? 'draft',
    steps: Array.isArray(r.steps) ? r.steps : [],
    sendWindow: r.send_window ?? {},
    approvedBy: r.approved_by ?? null,
    approvedAt: r.approved_at ?? null,
    // E1: set by the migration-030 trigger when an edit demoted this sequence
    // out of a sendable status. Empty means a genuine never-approved draft.
    heldFromStatus: r.held_from_status ?? '',
    heldAt: r.held_at ?? null,
    heldBy: r.held_by ?? null,
    sendingDomainId: r.sending_domain_id ?? null,
    targetListId: r.target_list_id ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
});

export const sequencesService = {
    list: async (workspaceId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('sequences')
            .select('*')
            .eq('workspace_id', workspaceId)
            .neq('status', 'archived')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapRow);
    },

    /** Promote a generated sequence into an executable draft (E1.2 entry point). */
    promote: async (workspaceId, { name, steps, mode = 'warm', campaignId = null, contentItemId = null, targetListId = null }) => {
        assertWorkspaceId(workspaceId);
        const executable = toExecutableSteps(steps);
        if (!executable.length) throw new Error('This sequence has no email steps to execute.');
        const { data, error } = await supabase
            .from('sequences')
            .insert({
                workspace_id: workspaceId,
                campaign_id: campaignId,
                content_item_id: contentItemId,
                target_list_id: targetListId,
                name: String(name ?? 'Sequence').slice(0, 200),
                mode,
                status: 'draft',
                steps: executable,
                send_window: defaultSendWindow(),
            })
            .select('*')
            .single();
        if (error) throw error;
        return mapRow(data);
    },

    /** Edit step content. On an approved sequence the DB trigger drops it back to draft. */
    updateSteps: async (workspaceId, id, steps) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('sequences')
            .update({ steps })
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .select('*')
            .single();
        if (error) throw error;
        return mapRow(data);
    },

    /**
     * Approve & schedule (E1.2). Client-side pre-check: every token must be
     * resolvable from prospect fields — the scheduler re-enforces this at send
     * time, but blocking here gives the operator an actionable error.
     */
    approve: async (workspaceId, id, { sendWindow } = {}) => {
        assertWorkspaceId(workspaceId);
        const { data: row, error: readErr } = await supabase
            .from('sequences')
            .select('steps')
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .single();
        if (readErr) throw readErr;
        const bad = findUnresolvableTokens(row.steps ?? []);
        if (bad.length) {
            throw new Error(`Fill in these tokens before approving (they can't be auto-resolved): ${bad.join(', ')}`);
        }
        const { data, error } = await supabase
            .from('sequences')
            .update({ status: 'approved', send_window: sendWindow ?? defaultSendWindow() })
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .select('*')
            .single();
        if (error) throw error;
        const mapped = mapRow(data);
        eventService.log(workspaceId, 'sequence.approved', { title: `${mapped.name || 'Sequence'} approved for sending`, entityType: 'sequence', entityId: mapped.id }).catch(() => {});
        return mapped;
    },

    /** Pause stops all future sends for every enrollment on this sequence. */
    pause: async (workspaceId, id) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('sequences')
            .update({ status: 'paused' })
            .eq('workspace_id', workspaceId)
            .eq('id', id);
        if (error) throw error;
    },

    /** Resume re-enters the sendable set; enrollments recompute from now (E2.4). */
    resume: async (workspaceId, id) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('sequences')
            .update({ status: 'active' })
            .eq('workspace_id', workspaceId)
            .eq('id', id);
        if (error) throw error;
    },

    archive: async (workspaceId, id) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('sequences')
            .update({ status: 'archived' })
            .eq('workspace_id', workspaceId)
            .eq('id', id);
        if (error) throw error;
    },
};

export default sequencesService;
