import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { buildNeedsYou } from '../lib/needsYou';
import { buildFunnel } from '../lib/funnelSnapshot';
import { contributionCaveats } from '../lib/channelContribution';
import { campaignService } from './campaignService';
import { enrollmentsService } from './enrollmentsService';
import { goalsService } from './goalsService';
import { integrationService } from './integrationService';
import { measurementService } from './measurementService';
import { sequencesService } from './sequencesService';

// The cockpit's data layer (E5, roadmap S2).
//
// One read for the whole screen, because the zones are not independent: the
// channel table is scoped to the hero goal's campaigns, and the funnel is the
// same history the goal's forecast is derived from. Loading them separately
// would let two zones disagree about the same workspace on the same screen.
//
// EVERY ZONE DEGRADES ON ITS OWN. A failed reply read must not blank the goal
// hero. Each leg is caught individually and reports what it could not load, so
// the screen shows four working zones and one honest gap rather than an error
// page.

const HISTORY_DAYS = 120; // enough for an 8-week sparkline plus slack

const assertWs = (workspaceId) => { if (!isUuid(workspaceId)) throw new Error('Invalid workspace id'); };

/** Which ad platforms would make paid contribution real. */
const PAID_PROVIDERS = ['google_ads', 'meta_ads', 'linkedin_ads'];

/**
 * Pick the goal the cockpit leads with.
 *
 * The primary flag is a decision the user made and always wins. With no primary
 * set, the soonest-ending active goal is a defensible lead — but the screen is
 * told it was INFERRED so it can say so, the same way E3's provenance does. A
 * hero that silently picks for you teaches the wrong thing about what "primary"
 * means.
 */
export const pickHeroGoal = (goals = []) => {
    const active = goals.filter((g) => g.status === 'active');
    const primary = active.find((g) => g.isPrimary);
    if (primary) return { goal: primary, inferred: false };
    const soonest = [...active].sort((a, b) => String(a.endDate ?? '').localeCompare(String(b.endDate ?? '')))[0];
    return { goal: soonest ?? null, inferred: Boolean(soonest) };
};

const loadMetricsHistory = async (workspaceId) => {
    const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();
    const { data, error } = await supabase
        .from('campaign_metrics')
        .select('campaign_id, provider, metrics, captured_at')
        .eq('workspace_id', workspaceId)
        .gte('captured_at', since)
        .order('captured_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
};

/** Completed assets that never got laddered to a campaign — the orphans. */
const loadIdleDrafts = async (workspaceId) => {
    const { data, error } = await supabase
        .from('content_items')
        .select('id, type, title, updated_at')
        .eq('workspace_id', workspaceId)
        .eq('status', 'completed')
        .is('campaign_id', null)
        .order('updated_at', { ascending: false })
        .limit(50);
    if (error) throw error;
    return data ?? [];
};

const loadSendingDomains = async (workspaceId) => {
    const { data, error } = await supabase
        .from('sending_domains')
        .select('id, domain, status')
        .eq('workspace_id', workspaceId);
    if (error) throw error;
    return data ?? [];
};

const settle = async (promise, fallback, failures, label) => {
    try {
        return await promise;
    } catch {
        failures.push(label);
        return fallback;
    }
};

export const cockpitService = {
    /**
     * Everything the cockpit renders, in one pass.
     *
     * @returns {Promise<{
     *   goals, hero, heroInferred, projection, goalCampaigns,
     *   needsYou, funnel, contribution, caveats, statuses, failures
     * }>}
     */
    load: async (workspaceId, { now = new Date() } = {}) => {
        assertWs(workspaceId);
        const failures = [];

        const [goals, campaigns, sequences, enrollments, sendingDomains, idleDrafts, history, statuses] = await Promise.all([
            settle(goalsService.list(workspaceId), [], failures, 'goals'),
            settle(campaignService.listCampaigns(workspaceId, { limit: 200 }), [], failures, 'campaigns'),
            settle(sequencesService.list(workspaceId), [], failures, 'sequences'),
            settle(enrollmentsService.list(workspaceId), [], failures, 'replies'),
            settle(loadSendingDomains(workspaceId), [], failures, 'domains'),
            settle(loadIdleDrafts(workspaceId), [], failures, 'drafts'),
            settle(loadMetricsHistory(workspaceId), [], failures, 'metrics'),
            settle(integrationService.listStatuses(workspaceId), {}, failures, 'integrations'),
        ]);

        const { goal: hero, inferred: heroInferred } = pickHeroGoal(goals);

        // The goal's own campaigns scope the channel table. Without them the
        // table would credit the goal with every campaign in the workspace.
        const goalCampaigns = hero
            ? await settle(goalsService.campaignsFor(workspaceId, hero.id), [], failures, 'goal-campaigns')
            : [];

        const [projection, contribution] = await Promise.all([
            hero?.kind === 'measured'
                ? settle(goalsService.projectionFor(workspaceId, hero, { now }), null, failures, 'forecast')
                : Promise.resolve(null),
            settle(
                measurementService.getContribution(workspaceId, {
                    goalCampaignIds: hero ? goalCampaigns.map((c) => c.id) : null,
                }),
                null,
                failures,
                'contribution',
            ),
        ]);

        const paidConnected = PAID_PROVIDERS.some((p) => statuses?.[p]?.status === 'connected');

        return {
            goals,
            hero,
            heroInferred,
            projection,
            // The goal's campaigns scope the channel table; the full list is what
            // a metrics pull must attribute against — matching GA4's utm against
            // only the hero goal's campaigns would push every other campaign's
            // traffic into the unattributed bucket.
            campaigns,
            goalCampaigns,
            needsYou: buildNeedsYou({ sequences, enrollments, campaigns, sendingDomains, idleDrafts }, { now }),
            funnel: buildFunnel(history, { granularity: 'weekly', count: 8, now }),
            contribution,
            caveats: contributionCaveats({
                paidConnected,
                hasSourceBreakdown: contribution?.hasSourceBreakdown ?? true,
            }),
            statuses,
            // Named so the screen can say which zone is missing rather than
            // rendering an empty one that looks like a real "nothing here".
            failures,
        };
    },

    /** Promote a goal to primary — the decision the hero is built around. */
    setPrimaryGoal: async (workspaceId, goalId) => {
        assertWs(workspaceId);
        await goalsService.setPrimary(workspaceId, goalId);
    },
};

export default cockpitService;
