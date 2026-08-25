import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { eventService } from './eventService';
import {
    MEASURES,
    deriveRunRate,
    projectGoal,
    proposeTarget,
} from '../lib/goalFeasibility';

// Goals (E2, roadmap S1) — the rung above campaigns.
//
// A goal is the thing every asset ladders to. Progress is DERIVED from
// campaign_metrics, never entered: the roadmap is explicit that campaign_metrics
// is unchanged by E2, because a number a user can type is a number a user can
// flatter themselves with.
//
// The measured/directional split is the standing principle made concrete —
// structure is universal, math is conditional. Both kinds take campaigns; only
// measured goals get a forecast, and the UI says which is which.

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

const mapGoal = (r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name ?? '',
    description: r.description ?? '',
    kind: r.kind ?? 'directional',
    measure: r.measure ?? null,
    target: r.target === null || r.target === undefined ? null : Number(r.target),
    baseline: r.baseline ?? {},
    feasibilityBasis: r.feasibility_basis ?? {},
    startDate: r.start_date ?? null,
    endDate: r.end_date ?? null,
    isPrimary: Boolean(r.is_primary),
    status: r.status ?? 'active',
    createdBy: r.created_by ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
});

const mapCheckpoint = (r) => ({
    id: r.id,
    goalId: r.goal_id,
    label: r.label ?? '',
    position: r.position ?? 0,
    doneAt: r.done_at ?? null,
    doneBy: r.done_by ?? null,
});

export const goalsService = {
    list: async (workspaceId, { includeArchived = false } = {}) => {
        assertWorkspaceId(workspaceId);
        let q = supabase
            .from('goals')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('is_primary', { ascending: false })
            .order('end_date', { ascending: true });
        if (!includeArchived) q = q.neq('status', 'archived');
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map(mapGoal);
    },

    get: async (workspaceId, goalId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('goals').select('*')
            .eq('workspace_id', workspaceId).eq('id', goalId).maybeSingle();
        if (error) throw error;
        return data ? mapGoal(data) : null;
    },

    create: async (workspaceId, {
        name, description = '', kind = 'directional', measure = null, target = null,
        startDate = null, endDate, baseline = {}, feasibilityBasis = {}, isPrimary = false,
    }) => {
        assertWorkspaceId(workspaceId);
        if (!String(name ?? '').trim()) throw new Error('A goal needs a name.');
        if (!endDate) throw new Error('A goal needs an end date — goals resolve.');
        // The DB enforces this too; failing here gives a sentence instead of a
        // constraint violation.
        if (kind === 'measured' && (!measure || target === null)) {
            throw new Error('A measured goal needs a measure and a target.');
        }

        const { data, error } = await supabase
            .from('goals')
            .insert({
                workspace_id: workspaceId,
                name: String(name).trim().slice(0, 200),
                description: String(description ?? '').slice(0, 2000),
                kind,
                measure: kind === 'measured' ? measure : null,
                target: kind === 'measured' ? target : null,
                baseline,
                feasibility_basis: feasibilityBasis,
                start_date: startDate ?? new Date().toISOString().slice(0, 10),
                end_date: endDate,
                is_primary: isPrimary,
            })
            .select('*')
            .single();
        if (error) throw error;
        const goal = mapGoal(data);
        eventService.log(workspaceId, 'goal.created', {
            title: `Goal set: ${goal.name}`, entityType: 'goal', entityId: goal.id,
            meta: { kind: goal.kind, measure: goal.measure },
        }).catch(() => {});
        return goal;
    },

    update: async (workspaceId, goalId, updates = {}) => {
        assertWorkspaceId(workspaceId);
        const patch = {};
        if (updates.name !== undefined) patch.name = String(updates.name).trim().slice(0, 200);
        if (updates.description !== undefined) patch.description = String(updates.description).slice(0, 2000);
        if (updates.measure !== undefined) patch.measure = updates.measure;
        // The migration-032 trigger records every target change — a moved
        // goalpost stays visible without the client having to remember.
        if (updates.target !== undefined) patch.target = updates.target;
        if (updates.kind !== undefined) patch.kind = updates.kind;
        if (updates.endDate !== undefined) patch.end_date = updates.endDate;
        if (updates.status !== undefined) patch.status = updates.status;
        if (updates.baseline !== undefined) patch.baseline = updates.baseline;
        if (updates.feasibilityBasis !== undefined) patch.feasibility_basis = updates.feasibilityBasis;

        const { data, error } = await supabase
            .from('goals').update(patch)
            .eq('workspace_id', workspaceId).eq('id', goalId)
            .select('*').single();
        if (error) throw error;
        return mapGoal(data);
    },

    /**
     * Exactly one primary per workspace (a partial unique index enforces it), so
     * demote the incumbent first rather than letting the insert fail.
     */
    setPrimary: async (workspaceId, goalId) => {
        assertWorkspaceId(workspaceId);
        const { error: clearErr } = await supabase
            .from('goals').update({ is_primary: false })
            .eq('workspace_id', workspaceId).eq('is_primary', true);
        if (clearErr) throw clearErr;
        const { error } = await supabase
            .from('goals').update({ is_primary: true })
            .eq('workspace_id', workspaceId).eq('id', goalId);
        if (error) throw error;
    },

    archive: async (workspaceId, goalId) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('goals').update({ status: 'archived', is_primary: false })
            .eq('workspace_id', workspaceId).eq('id', goalId);
        if (error) throw error;
    },

    /**
     * Hard delete. Unlike `archive`, this is not recoverable.
     *
     * The schema decides what goes with it (migration 032):
     *   goal_checkpoints, goal_target_history, goal_links → ON DELETE CASCADE,
     *     so the goal's progress record and its every target change go too.
     *   campaigns.goal_id → ON DELETE SET NULL, so campaigns SURVIVE and simply
     *     stop laddering to a goal. Deleting a goal never deletes work.
     * The confirmation says both, because "delete" alone does not distinguish
     * them and the difference is the whole risk.
     */
    remove: async (workspaceId, goalId) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('goals').delete()
            .eq('workspace_id', workspaceId).eq('id', goalId);
        if (error) throw error;
    },

    // ── The ladder ───────────────────────────────────────────────────────────

    /** Campaigns whose ONE parent is this goal. */
    campaignsFor: async (workspaceId, goalId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('campaigns')
            .select('id, title, status, plan, goal_id, created_at')
            .eq('workspace_id', workspaceId).eq('goal_id', goalId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },

    /** Set (or clear) a campaign's one parent goal. */
    setCampaignGoal: async (workspaceId, campaignId, goalId) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('campaigns').update({ goal_id: goalId })
            .eq('workspace_id', workspaceId).eq('id', campaignId);
        if (error) throw error;
    },

    // ── Directional goals: checkpoints instead of math ───────────────────────

    checkpoints: async (workspaceId, goalId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('goal_checkpoints').select('*')
            .eq('workspace_id', workspaceId).eq('goal_id', goalId)
            .order('position', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(mapCheckpoint);
    },

    addCheckpoint: async (workspaceId, goalId, label, position = 0) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('goal_checkpoints')
            .insert({ workspace_id: workspaceId, goal_id: goalId, label: String(label).trim().slice(0, 300), position })
            .select('*').single();
        if (error) throw error;
        return mapCheckpoint(data);
    },

    toggleCheckpoint: async (workspaceId, checkpointId, done) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('goal_checkpoints')
            .update({ done_at: done ? new Date().toISOString() : null })
            .eq('workspace_id', workspaceId).eq('id', checkpointId);
        if (error) throw error;
    },

    // ── The math ─────────────────────────────────────────────────────────────

    /**
     * Snapshots for the campaigns beneath ONE goal.
     *
     * Deliberately not the whole workspace: a goal's progress is what the work
     * under it produced. Counting workspace-wide traffic would credit the goal
     * with everything that happened while it existed, which is the "influenced"
     * inflation the roadmap explicitly refuses.
     */
    snapshotsFor: async (workspaceId, goalId) => {
        assertWorkspaceId(workspaceId);
        const campaigns = await goalsService.campaignsFor(workspaceId, goalId);
        if (!campaigns.length) return [];
        const { data, error } = await supabase
            .from('campaign_metrics')
            .select('campaign_id, provider, metrics, captured_at')
            .eq('workspace_id', workspaceId)
            .in('campaign_id', campaigns.map((c) => c.id))
            .order('captured_at', { ascending: true });
        if (error) throw error;

        // Merge providers per capture instant so one reading carries GA4 and CRM
        // metrics together, matching how measurementService composes snapshots.
        const byInstant = new Map();
        for (const row of data ?? []) {
            const key = row.captured_at;
            if (!byInstant.has(key)) byInstant.set(key, { capturedAt: key, metrics: {} });
            const entry = byInstant.get(key);
            for (const [k, v] of Object.entries(row.metrics ?? {})) {
                entry.metrics[k] = (Number(entry.metrics[k]) || 0) + (Number(v) || 0);
            }
        }
        return [...byInstant.values()];
    },

    /** Everything the right rail renders for one goal. */
    projectionFor: async (workspaceId, goal, { now = new Date() } = {}) => {
        if (!goal || goal.kind !== 'measured') return null;
        const snapshots = await goalsService.snapshotsFor(workspaceId, goal.id);
        const runRate = deriveRunRate(snapshots, goal.measure, { now });
        return {
            runRate,
            measure: MEASURES[goal.measure] ?? null,
            ...projectGoal({
                runRate,
                baseline: goal.baseline?.value ?? 0,
                target: goal.target,
                startDate: goal.startDate,
                endDate: goal.endDate,
                now,
            }),
        };
    },

    /**
     * What to suggest when someone is SETTING a goal, before it has campaigns.
     * Uses the workspace's whole history — there is no goal yet to scope to, and
     * the roadmap's point is to open with a proposal rather than a blank field.
     */
    proposeFor: async (workspaceId, measure, { startDate, endDate, now = new Date() } = {}) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('campaign_metrics')
            .select('metrics, captured_at')
            .eq('workspace_id', workspaceId)
            .order('captured_at', { ascending: true });
        if (error) throw error;
        const snapshots = (data ?? []).map((r) => ({ capturedAt: r.captured_at, metrics: r.metrics ?? {} }));
        const runRate = deriveRunRate(snapshots, measure, { now });
        return { runRate, proposal: proposeTarget(runRate, { startDate, endDate }) };
    },
};

export default goalsService;
