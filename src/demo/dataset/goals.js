/**
 * The goals spine (E2/E5/E10) for the demo.
 *
 * `goals` was declared in DEMO_TABLES from the start but never seeded, so every
 * demo opened on the cockpit's COLD START — "Ken42 has no goal yet" — and the
 * three zones that hang off a goal (GoalHero, What-would-close-the-gap,
 * Also-running) rendered only their empty states. A demo of a goal-led product
 * that has no goal undersells the whole spine.
 *
 * The numbers are chosen so the hero lands in its most INTERESTING state rather
 * than its happiest one: behind pace, with a real shortfall in real units. An
 * "on track" hero shows a progress bar; a behind-pace hero shows the forecast,
 * the gap, the days left and the per-day rate needed — which is what the zone
 * exists to say.
 *
 * SIZE THE TARGET AGAINST THE LADDER, NOT THE WORKSPACE. The forecast is built
 * from `campaign_metrics` of the campaigns whose `goal_id` is this goal — not
 * from the workspace total. Two campaigns ladder here, which run ~100/day, so a
 * 90-day window forecasts ~9,100. A 12,000 target sits ~2,900 short and asks for
 * roughly two more campaigns: behind pace and worth acting on. Sizing it off the
 * workspace-wide rate (~290/day) instead produced a 22,894 shortfall and a
 * "15 more campaigns" recommendation, which reads as broken planning.
 *
 * `change_events` stays empty on purpose (see DEMO_TABLES): movement is left for
 * "Check for changes" to detect against the demo's own metric history, so the
 * hero opens on its null-movement branch and the detector runs for real.
 */
import { id } from '../ids';
import { daysAgo, daysAhead } from './time';
import { DEMO_WORKSPACE_ID } from './identity';

const ws = DEMO_WORKSPACE_ID;

/** YYYY-MM-DD — goals carry DATE columns, not timestamps. */
const day = (iso) => iso.slice(0, 10);

const PRIMARY_ID = id('goal-q3-sessions');
const MEETINGS_ID = id('goal-meetings');
const DIRECTIONAL_ID = id('goal-category-position');

export const goals = [
    {
        id: PRIMARY_ID,
        workspace_id: ws,
        name: 'Q3 organic sessions to 12,000',
        description:
            'The quarter rides on inbound. Group consolidation and the accreditation push both ladder here.',
        kind: 'measured',
        measure: 'sessions',
        target: 12000,
        // What the measure read when the goal was set. Zero because the target
        // counts sessions earned SINCE the goal started — progress is
        // target-minus-baseline, or a goal set mid-quarter opens at 60%.
        baseline: { value: 0, measure: 'sessions', capturedAt: daysAgo(40) },
        // Why it was thought reachable, kept so the forecast can be argued with
        // months later once the rates have moved.
        feasibility_basis: {
            perDay: 101,
            confidence: 'medium',
            window: { trailingDays: 28, from: day(daysAgo(68)), to: day(daysAgo(40)) },
            note: 'Sized off the trailing 28-day rate of the two campaigns laddered here, before consolidation launched.',
        },
        start_date: day(daysAgo(40)),
        end_date: day(daysAhead(50)),
        is_primary: true,
        status: 'active',
        created_by: null,
        created_at: daysAgo(40),
        updated_at: daysAgo(2),
    },
    {
        id: MEETINGS_ID,
        workspace_id: ws,
        name: '40 qualified meetings from outreach',
        description: 'Pipeline cover for the quarter, driven by the CIO-track sequences.',
        kind: 'measured',
        measure: 'meetings',
        target: 40,
        baseline: { value: 0, measure: 'meetings', capturedAt: daysAgo(30) },
        feasibility_basis: {
            perDay: 0.4,
            confidence: 'low',
            window: { trailingDays: 28, from: day(daysAgo(58)), to: day(daysAgo(30)) },
            note: 'Thin evidence — two sequences had run long enough to rate.',
        },
        start_date: day(daysAgo(30)),
        end_date: day(daysAhead(60)),
        is_primary: false,
        status: 'active',
        created_by: null,
        created_at: daysAgo(30),
        updated_at: daysAgo(6),
    },
    {
        // A directional goal, so the hero's no-forecast branch is reachable in the
        // demo by promoting it — that branch loses the percentage, the track and
        // the whole facts grid, and it is the one most likely to break a layout.
        id: DIRECTIONAL_ID,
        workspace_id: ws,
        name: 'Be the obvious answer for multi-campus SIS',
        description: 'Directional. Judged on checkpoints, not a number.',
        kind: 'directional',
        measure: null,
        target: null,
        baseline: {},
        feasibility_basis: {},
        start_date: day(daysAgo(75)),
        end_date: day(daysAhead(110)),
        is_primary: false,
        status: 'active',
        created_by: null,
        created_at: daysAgo(75),
        updated_at: daysAgo(12),
    },
];

/** Directional goals show progress as checkpoints — some done, some not. */
export const goal_checkpoints = [
    { id: id('gcp-1'), goal_id: DIRECTIONAL_ID, workspace_id: ws, label: 'Comparison page live against the two incumbents', position: 0, done_at: daysAgo(48), done_by: null, created_at: daysAgo(75) },
    { id: id('gcp-2'), goal_id: DIRECTIONAL_ID, workspace_id: ws, label: 'Cited by an AI engine for “multi-campus SIS”', position: 1, done_at: daysAgo(19), done_by: null, created_at: daysAgo(75) },
    { id: id('gcp-3'), goal_id: DIRECTIONAL_ID, workspace_id: ws, label: 'Three named-account references published', position: 2, done_at: null, done_by: null, created_at: daysAgo(75) },
    { id: id('gcp-4'), goal_id: DIRECTIONAL_ID, workspace_id: ws, label: 'Analyst brief accepted', position: 3, done_at: null, done_by: null, created_at: daysAgo(75) },
];

/**
 * THE LADDER. A campaign has exactly ONE parent goal (`campaigns.goal_id`), and
 * this is what the forecast is computed from: `snapshotsFor` → `campaignsFor`
 * reads `campaigns.goal_id`, so a goal with no campaigns laddered to it has no
 * snapshots, no run rate, and renders "Not enough data" however much metric
 * history the workspace holds elsewhere. Applied in dataset/index.js.
 *
 * `campaign-kenfin` is deliberately left unparented — an unladdered campaign is
 * a real state the cockpit reports on.
 */
export const CAMPAIGN_GOAL = {
    [id('campaign-consolidation')]: PRIMARY_ID,
    [id('campaign-accreditation')]: PRIMARY_ID,
    [id('campaign-intake')]: MEETINGS_ID,
};

/**
 * `goal_links` is the SECOND relationship, not a duplicate of the ladder above —
 * a launch that serves pipeline as well as traffic, linked to the other goal
 * without lying about which one it primarily ladders to.
 */
export const goal_links = [
    { id: id('glink-consolidation-meetings'), goal_id: MEETINGS_ID, workspace_id: ws, linked_type: 'campaign', linked_id: id('campaign-consolidation'), relation: 'supports', created_at: daysAgo(34) },
    { id: id('glink-intake-sessions'), goal_id: PRIMARY_ID, workspace_id: ws, linked_type: 'campaign', linked_id: id('campaign-intake'), relation: 'supports', created_at: daysAgo(24) },
];

/** Target changes are kept so a moved goalpost stays visible. */
export const goal_target_history = [
    {
        id: id('gth-sessions-1'),
        goal_id: PRIMARY_ID,
        workspace_id: ws,
        previous_target: 10000,
        target: 12000,
        reason: 'Raised after the consolidation campaign beat its first two weeks.',
        changed_by: null,
        changed_at: daysAgo(21),
    },
];
