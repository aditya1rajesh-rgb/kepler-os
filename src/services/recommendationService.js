import { campaignYields, channelHint, recommendForGoal } from '../lib/goalRecommendation';
import { isUuid } from '../lib/validation';
import { campaignService } from './campaignService';
import { goalsService } from './goalsService';
import { measurementService } from './measurementService';
import { strategyService } from './strategyService';

// Continuous goal recommendation (E10) — the goal asking for work.
//
// Two calls: `forGoal` sizes the live gap against what this account's own
// campaigns have delivered, and `accept` turns that into a real campaign,
// pre-parented to the goal and pre-briefed against the gap.
//
// COMPUTED ON READ, NOT STORED. The roadmap asks for the feasibility engine to
// run "on a schedule rather than only at creation", and it is easy to read that
// as "persist a recommendations table". It should not be: a recommendation is a
// pure function of the goal, its campaigns and their latest readings, so storing
// it would mean serving a stale number the moment any of those move — the one
// failure this feature cannot afford. What the SCHEDULE is for is noticing that
// a goal's standing changed and saying so unprompted; that is a change event
// (E7), and it is where the "continuous" lives.

const assertWs = (workspaceId) => { if (!isUuid(workspaceId)) throw new Error('Invalid workspace id'); };

export const recommendationService = {
    /**
     * Size the gap on one goal.
     *
     * Yields come from the goal's OWN campaigns first, because "what a campaign
     * delivers here" is most honestly answered by the work already pointed at
     * this goal. Below the sample floor it widens to the workspace rather than
     * refusing — a second goal's campaigns are still this account's campaigns,
     * and the alternative is silence on every new goal forever.
     */
    forGoal: async (workspaceId, goal, { projection = null, now = new Date() } = {}) => {
        assertWs(workspaceId);
        if (!goal) return null;

        const [goalCampaigns, allCampaigns, snapshots] = await Promise.all([
            goalsService.campaignsFor(workspaceId, goal.id).catch(() => []),
            campaignService.listCampaigns(workspaceId, { limit: 200 }).catch(() => []),
            measurementService.getSnapshots(workspaceId).catch(() => ({})),
        ]);

        const proj = projection ?? await goalsService.projectionFor(workspaceId, goal, { now }).catch(() => null);

        const own = campaignYields(goalCampaigns, snapshots, { measure: goal.measure, now });
        const yields = own.length >= 3
            ? own
            : campaignYields(allCampaigns, snapshots, { measure: goal.measure, now });

        const recommendation = recommendForGoal({ goal, projection: proj, yields });

        // The channel hint is scoped to this goal's campaigns for the same reason
        // the cockpit's table is: workspace-wide would credit the goal with wings
        // that never worked on it.
        let hint = null;
        try {
            const contribution = await measurementService.getContribution(workspaceId, {
                goalCampaignIds: goalCampaigns.map((c) => c.id),
            });
            hint = channelHint(contribution?.contributions ?? []);
        } catch { /* a hint is upside-only */ }

        return {
            ...recommendation,
            channelHint: hint,
            // Which campaigns the estimate was built from, so "median 800" can be
            // traced to actual rows rather than taken on faith.
            basedOn: yields.map((y) => ({ campaignId: y.campaignId, title: y.title, value: y.value, days: y.days })),
            scope: own.length >= 3 ? 'goal' : 'workspace',
        };
    },

    /**
     * Accept a recommendation: plan a campaign against the brief and create it
     * already parented to the goal.
     *
     * The brief carries the gap and the deadline and NOT the estimate — the brief
     * becomes the campaign's own goal text, and a campaign that says "should
     * deliver ~800 sessions" reads later as a promise Kepler made for it.
     */
    accept: async (workspaceId, { goal, brief, campaignType = 'lead-gen' } = {}) => {
        assertWs(workspaceId);
        if (!goal?.id) return { ok: false, error: 'A goal is required.' };
        if (!brief?.trim()) return { ok: false, error: 'Nothing to brief the campaign with.' };

        const res = await strategyService.generateCampaignPlan(workspaceId, { goal: brief, campaignType });
        if (!res.ok) return { ok: false, error: res.error || 'Could not plan a campaign against this goal.' };

        const created = await campaignService.createCampaign(workspaceId, {
            title: res.title,
            goal: brief,
            campaignType,
            goalId: goal.id,
            plan: res.plan,
            source: 'recommendation',
        });
        return { ok: true, campaign: created };
    },
};

export default recommendationService;
