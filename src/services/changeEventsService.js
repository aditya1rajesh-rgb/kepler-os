import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import {
    detectGoalDrift,
    detectMetricMoves,
    detectOutreachMoves,
    detectSearchMoves,
    detectVisibilityMoves,
    searchWindows,
} from '../lib/detectors';
import { readingSeries } from '../lib/funnelSnapshot';
import { MEASURES, deriveRunRate, projectGoal } from '../lib/goalFeasibility';
import { capabilityService } from './capabilityService';
import { campaignService } from './campaignService';
import { goalsService } from './goalsService';
import { integrationService } from './integrationService';
import { visibilityService } from './visibilityService';

// change_events — reading and, when asked, producing them (E7).
//
// TWO CALLERS, ONE SET OF RULES. `detector-run` (pg_cron, 06:00 UTC) is the
// scheduled path; this service is the manual one. That is deliberate rather than
// redundant: the scheduled function cannot be deployed until CI's Supabase token
// is rotated, and a feature that only works after an ops task is a feature
// nobody sees. seoOperator has the same shape — manual now, scheduled later —
// and the roadmap describes E7 partly as putting the existing manual jobs on a
// schedule.
//
// Both paths write through the same dedupe key, so a manual run racing the cron
// produces one row, not two. Which path found it is recorded in `detected_by`,
// because "nothing moved" means something different when the schedule has not
// run for three days.

const assertWs = (workspaceId) => { if (!isUuid(workspaceId)) throw new Error('Invalid workspace id'); };

const mapEvent = (r) => ({
    id: r.id,
    kind: r.kind,
    subject: r.subject ?? '',
    direction: r.direction,
    magnitude: Number(r.magnitude) || 0,
    unit: r.unit ?? '',
    pct: r.pct === null || r.pct === undefined ? null : Number(r.pct),
    from: r.value_from === null || r.value_from === undefined ? null : Number(r.value_from),
    to: r.value_to === null || r.value_to === undefined ? null : Number(r.value_to),
    observedAt: r.observed_at,
    comparedTo: r.compared_to ?? null,
    campaignId: r.campaign_id ?? null,
    evidence: r.evidence ?? {},
    detectedBy: r.detected_by ?? 'scheduler',
    dedupeKey: r.dedupe_key,
});

const toRow = (workspaceId, e, detectedBy) => ({
    workspace_id: workspaceId,
    kind: e.kind,
    subject: e.subject,
    direction: e.direction,
    magnitude: e.magnitude,
    unit: e.unit,
    pct: e.pct,
    value_from: e.from,
    value_to: e.to,
    observed_at: e.observedAt,
    compared_to: e.comparedTo,
    campaign_id: e.campaignId,
    evidence: e.evidence,
    detected_by: detectedBy,
    dedupe_key: e.dedupeKey,
});

/** Measures worth watching, and the provider that writes each. */
const WATCHED = [
    { provider: 'ga4', metricKey: 'sessions', measure: 'sessions' },
    { provider: 'ga4', metricKey: 'conversions', measure: 'conversions' },
    { provider: 'zoho', metricKey: 'crmRecords', measure: 'crmRecords' },
    { provider: 'revenue', metricKey: 'revenue', measure: 'revenue' },
];

export const changeEventsService = {
    /**
     * Recent changes, newest first.
     *
     * @param opts.campaignIds when set, keeps workspace-level events (search,
     *        answer engines — they belong to the account) plus campaign events
     *        from these campaigns. Scoping to a goal must not hide the signals
     *        that have no campaign, or the goal looks becalmed when the account
     *        is moving.
     */
    list: async (workspaceId, { limit = 20, sinceDays = 45, campaignIds = null } = {}) => {
        assertWs(workspaceId);
        const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
        const { data, error } = await supabase
            .from('change_events')
            .select('*')
            .eq('workspace_id', workspaceId)
            .gte('observed_at', since)
            .order('observed_at', { ascending: false })
            .limit(200);
        if (error) throw error;

        const rows = (data ?? []).map(mapEvent);
        const scoped = campaignIds
            ? rows.filter((e) => !e.campaignId || campaignIds.includes(e.campaignId))
            : rows;
        return scoped.slice(0, limit);
    },

    /**
     * Run the detectors now, from the browser, and persist what they find.
     *
     * Reads only what this user can already read under RLS. Every leg is caught
     * on its own: Search Console needs a connector and three seconds, and a
     * workspace without one should still get its metric and visibility changes
     * rather than an error.
     */
    detectNow: async (workspaceId, { includeSearch = true } = {}) => {
        assertWs(workspaceId);
        const events = [];
        const failures = [];
        // Loaded once and reused by both the metric detectors and goal drift —
        // re-querying per goal cost seconds per goal for rows already in hand.
        let metricRows = [];

        // ── Metric + outreach movement, from stored readings ────────────────
        try {
            const since = new Date(Date.now() - 45 * 86400000).toISOString();
            const { data, error } = await supabase
                .from('campaign_metrics')
                .select('campaign_id, provider, metrics, captured_at')
                .eq('workspace_id', workspaceId)
                .gte('captured_at', since)
                .order('captured_at', { ascending: true });
            if (error) throw error;
            const rows = data ?? [];
            metricRows = rows;

            for (const w of WATCHED) {
                events.push(...detectMetricMoves(readingSeries(rows, w), { measure: w.measure, campaignId: null }));

                const campaignIds = [...new Set(rows.filter((r) => r.provider === w.provider && r.campaign_id).map((r) => r.campaign_id))];
                for (const campaignId of campaignIds) {
                    const scoped = rows.filter((r) => r.campaign_id === campaignId);
                    events.push(...detectMetricMoves(readingSeries(scoped, w), { measure: w.measure, campaignId }));
                }
            }

            for (const metric of ['replied', 'meetings']) {
                events.push(...detectOutreachMoves(readingSeries(rows, { provider: 'outreach', metricKey: metric }), { metric }));
            }
        } catch {
            failures.push('metrics');
        }

        // ── Search movement — two Search Console windows ────────────────────
        if (includeSearch) {
            try {
                const caps = await capabilityService.resolve(workspaceId);
                if (caps?.gsc_operator?.configured) {
                    const [current, prior] = await Promise.all([
                        integrationService.query(workspaceId, 'gsc', { dimensions: ['query'], days: 28, rowLimit: 500 }),
                        integrationService.query(workspaceId, 'gsc', { dimensions: ['query'], days: 28, offsetDays: 28, rowLimit: 500 }),
                    ]);
                    // Window ends, not "now" — otherwise pressing the button
                    // twice writes the same ranking move under two keys.
                    events.push(...detectSearchMoves(current?.rows ?? [], prior?.rows ?? [], searchWindows()));
                }
            } catch {
                failures.push('search');
            }
        }

        // ── AI-visibility movement — the last two scan runs ─────────────────
        try {
            const scans = await visibilityService.getScans(workspaceId, { limit: 400 });
            const runs = [];
            for (const r of scans) {
                if (!runs.includes(r.scanRunId)) runs.push(r.scanRunId);
                if (runs.length === 2) break;
            }
            if (runs.length === 2) {
                const current = scans.filter((r) => r.scanRunId === runs[0]);
                const prior = scans.filter((r) => r.scanRunId === runs[1]);
                events.push(...detectVisibilityMoves(current, prior, {
                    observedAt: current[0]?.capturedAt ?? new Date().toISOString(),
                    comparedTo: prior[0]?.capturedAt ?? null,
                }));
            }
        } catch {
            failures.push('visibility');
        }

        // ── Goal drift (E10) — the standing of a goal changing ──────────────
        //
        // The previous verdict is RECOMPUTED from history rather than stored.
        // The obvious design — remember the last verdict and compare — needs a
        // baseline to be written on the first run, and a baseline nobody writes
        // means drift is never detected at all. Recomputing the projection as of
        // the previous reading needs no state, cannot go stale, and is literally
        // the roadmap's ask: the feasibility engine run again rather than only at
        // creation.
        try {
            const [goals, campaigns] = await Promise.all([
                goalsService.list(workspaceId),
                campaignService.listCampaigns(workspaceId, { limit: 200 }),
            ]);
            const measured = goals.filter((g) => g.status === 'active' && g.kind === 'measured');

            for (const goal of measured) {
                const campaignIds = new Set(campaigns.filter((c) => c.goalId === goal.id).map((c) => c.id));
                if (!campaignIds.size) continue;

                // Merge providers per capture instant, as goalsService.snapshotsFor
                // does — one reading carries GA4 and CRM metrics together.
                const byInstant = new Map();
                for (const r of metricRows) {
                    if (!campaignIds.has(r.campaign_id)) continue;
                    const entry = byInstant.get(r.captured_at) ?? { capturedAt: r.captured_at, metrics: {} };
                    for (const [k, v] of Object.entries(r.metrics ?? {})) {
                        entry.metrics[k] = (Number(entry.metrics[k]) || 0) + (Number(v) || 0);
                    }
                    byInstant.set(r.captured_at, entry);
                }
                const sorted = [...byInstant.values()]
                    .sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
                if (sorted.length < 2) continue; // one reading is a baseline, not a change

                const project = (rows, at) => projectGoal({
                    runRate: deriveRunRate(rows, goal.measure, { now: at }),
                    baseline: goal.baseline?.value ?? 0,
                    target: goal.target,
                    startDate: goal.startDate,
                    endDate: goal.endDate,
                    now: at,
                });

                const before = project(sorted.slice(0, -1), new Date(sorted[sorted.length - 2].capturedAt));
                const current = project(sorted, new Date());

                events.push(...detectGoalDrift({
                    goalId: goal.id,
                    name: goal.name,
                    verdict: current.verdict,
                    forecast: current.forecast,
                    target: goal.target,
                    observedAt: sorted[sorted.length - 1].capturedAt,
                }, before.verdict));
            }
        } catch {
            failures.push('goals');
        }

        if (!events.length) return { ok: true, detected: 0, failures };

        // ignoreDuplicates so re-checking is free and never doubles a change.
        const { error } = await supabase
            .from('change_events')
            .upsert(events.map((e) => toRow(workspaceId, e, 'manual')), {
                onConflict: 'workspace_id,dedupe_key',
                ignoreDuplicates: true,
            });
        if (error) throw error;

        return { ok: true, detected: events.length, failures };
    },

    /** The measure label a metric event is about, for display. */
    measureLabel: (event) => MEASURES[event?.evidence?.measure]?.label ?? event?.subject ?? '',
};

export default changeEventsService;
