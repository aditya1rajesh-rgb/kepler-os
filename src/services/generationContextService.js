import { supabase } from '../lib/supabase';
import { buildLadderBlock, rankByRelevance } from '../lib/generationContext';
import { getBrandContextForGeneration } from './brandContextService';
import { campaignService } from './campaignService';
import { capabilityService } from './capabilityService';
import { goalsService } from './goalsService';
import { seoOperatorService } from './seoOperatorService';
import { visibilityService } from './visibilityService';

// E3 · goal-grounded generation — the assembler.
//
// One call every generating module makes instead of getBrandContextForGeneration.
// It returns the same shape that call returned (prompt / structured / meta), so
// consumers keep working, plus the ladder above the asset: goal, campaign, prior
// assets, live search + answer-engine signals.
//
// Two design rules the rest of this file follows.
//
// EVERY LEG DEGRADES SOFT. Brand context is the only required leg — the modules
// already refuse to generate without a brand profile. Everything else is upside:
// a missing goal, an unreachable Search Console, an empty visibility scan each
// remove a paragraph from the prompt and nothing else. Grounding that can sink
// a generation is worse than no grounding, because it fails on the days the user
// most wants output.
//
// PROVENANCE IS RETURNED, NOT INFERRED LATER. `meta.groundedIn` says exactly
// what the prompt was built from, so the UI can show it and the asset can store
// it. Reconstructing that after the fact is guesswork, and a grounding claim
// nobody can check is the thing this codebase keeps almost shipping.

/** Signals cost network round-trips; only the modules that use them ask for them. */
const MODULE_WANTS_SIGNALS = { blog: true, seo: true, social: false, ads: false, outreach: false, default: false };

/**
 * Resolve the one goal this asset ladders to.
 *
 * Order matters. An explicit goal is a decision, a campaign's goal is the
 * ladder E2 built, and the primary goal is an INFERENCE — right often enough to
 * be worth making for standalone generation, wrong often enough that it is
 * labelled rather than hidden. `source` travels with it into the UI.
 */
const resolveGoal = async (workspaceId, { goalId, campaign, allowPrimaryFallback }) => {
    if (goalId) {
        const goal = await goalsService.get(workspaceId, goalId).catch(() => null);
        if (goal) return { goal, source: 'explicit' };
    }
    if (campaign?.goalId) {
        const goal = await goalsService.get(workspaceId, campaign.goalId).catch(() => null);
        if (goal) return { goal, source: 'campaign' };
    }
    if (allowPrimaryFallback) {
        const goals = await goalsService.list(workspaceId).catch(() => []);
        const primary = goals.find((g) => g.isPrimary && g.status === 'active');
        if (primary) return { goal: primary, source: 'primary-fallback' };
    }
    return { goal: null, source: null };
};

/**
 * Completed assets already produced beneath this goal.
 *
 * Scoped through campaigns, exactly like goalsService.snapshotsFor: an asset
 * belongs to a goal because its campaign does. Workspace-wide "prior work" would
 * hand a B2B blog the company's Diwali social posts as things not to repeat.
 */
const loadPriorAssets = async (workspaceId, { goal, campaign, excludeId, topic, limit = 24 }) => {
    const campaignIds = new Set();
    if (campaign?.id) campaignIds.add(campaign.id);
    if (goal?.id) {
        const siblings = await goalsService.campaignsFor(workspaceId, goal.id).catch(() => []);
        for (const c of siblings) campaignIds.add(c.id);
    }
    if (!campaignIds.size) return [];

    const { data, error } = await supabase
        .from('content_items')
        .select('id, type, title, target_keyword, campaign_id, status, created_at')
        .eq('workspace_id', workspaceId)
        .in('campaign_id', [...campaignIds])
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(80);
    if (error) return [];

    const rows = (data ?? [])
        .filter((r) => r.id !== excludeId)
        .map((r) => ({
            id: r.id,
            type: r.type ?? 'asset',
            title: r.title ?? '',
            targetKeyword: r.target_keyword ?? '',
            // Same-campaign work is a harder constraint than sibling-campaign work.
            scope: campaign?.id && r.campaign_id === campaign.id ? 'campaign' : 'goal',
        }));

    // Recency already ordered them; relevance to the topic re-orders within that,
    // so the twelve that survive the cap are the twelve worth not repeating.
    return rankByRelevance(rows, topic, (r) => `${r.title} ${r.targetKeyword}`, limit);
};

/**
 * Live evidence: Search Console opportunities + answer-engine gaps.
 *
 * Search Console needs the gsc_operator capability and three API pulls, so it is
 * checked first and skipped silently when absent — a workspace without GSC gets
 * a shorter prompt, not an error. Both calls are individually caught: this is
 * the leg most likely to fail in production and least allowed to matter.
 */
const loadSignals = async (workspaceId, { topic }) => {
    const [search, gaps] = await Promise.all([
        (async () => {
            try {
                const caps = await capabilityService.resolve(workspaceId);
                if (!caps?.gsc_operator?.configured) return [];
                const res = await seoOperatorService.analyze(workspaceId, { limit: 30 });
                return res?.ok ? (res.opportunities ?? []) : [];
            } catch { return []; }
        })(),
        visibilityService.getVisibilityGaps(workspaceId, { limit: 20 }).catch(() => []),
    ]);

    return {
        // buildOpportunities sorts by impact; relevance re-ranks within that so a
        // blog about pricing is not handed six queries about hiring.
        searchOpportunities: rankByRelevance(search, topic, (o) => o?.title ?? '', 6),
        aeoGaps: rankByRelevance(gaps, topic, (g) => g?.prompt ?? '', 5),
    };
};

/**
 * Brand context + the goal ladder above the asset.
 *
 * @param {string} workspaceId
 * @param {object} opts
 * @param {'blog'|'outreach'|'ads'|'social'|'default'} [opts.module]
 * @param {'profile'|'full'} [opts.depth]
 * @param {string} [opts.topic] what is being generated — drives relevance ranking
 * @param {string} [opts.campaignId] the campaign this asset belongs to
 * @param {string} [opts.goalId] an explicitly chosen goal (wins over the campaign's)
 * @param {string} [opts.stepId] the campaign step this asset fulfils
 * @param {string} [opts.excludeContentItemId] the item being generated, so it is
 *        not offered to itself as prior work
 * @param {boolean} [opts.allowPrimaryFallback] infer the primary goal for
 *        standalone generation (labelled 'primary-fallback' in provenance)
 * @param {boolean} [opts.includeSignals] override the per-module default
 * @returns {Promise<object>} brand-context shape + { goal, campaign, priorAssets,
 *          signals, ladder, meta.groundedIn }
 */
export const getGenerationContext = async (workspaceId, {
    module = 'default',
    depth = 'profile',
    topic = '',
    campaignId = null,
    goalId = null,
    stepId = '',
    excludeContentItemId = null,
    allowPrimaryFallback = true,
    includeSignals,
} = {}) => {
    if (!workspaceId) throw new Error('getGenerationContext: workspaceId is required');

    // The one leg allowed to throw: without a brand there is nothing to ground.
    const brand = await getBrandContextForGeneration(workspaceId, { module, depth });

    const campaign = campaignId
        ? await campaignService.getCampaign(workspaceId, campaignId).catch(() => null)
        : null;
    const { goal, source: goalSource } = await resolveGoal(workspaceId, {
        goalId, campaign, allowPrimaryFallback,
    });

    const wantSignals = includeSignals ?? MODULE_WANTS_SIGNALS[module] ?? false;
    const [projection, checkpoints, priorAssets, signals] = await Promise.all([
        goal?.kind === 'measured'
            ? goalsService.projectionFor(workspaceId, goal).catch(() => null)
            : Promise.resolve(null),
        goal?.kind === 'directional'
            ? goalsService.checkpoints(workspaceId, goal.id).catch(() => [])
            : Promise.resolve([]),
        (goal || campaign)
            ? loadPriorAssets(workspaceId, { goal, campaign, excludeId: excludeContentItemId, topic })
            : Promise.resolve([]),
        wantSignals ? loadSignals(workspaceId, { topic }) : Promise.resolve({ searchOpportunities: [], aeoGaps: [] }),
    ]);

    const ladder = buildLadderBlock({
        goal,
        projection,
        checkpoints,
        goalSource,
        campaign,
        stepId,
        priorAssets,
        searchOpportunities: signals.searchOpportunities,
        aeoGaps: signals.aeoGaps,
    });

    return {
        ...brand,
        // The prompt every consumer already used, now with the ladder appended.
        prompt: brand.prompt + ladder.text,
        brandPrompt: brand.prompt,
        goal,
        goalSource,
        projection,
        campaign,
        priorAssets,
        signals,
        ladder,
        meta: {
            ...brand.meta,
            hasGoal: Boolean(goal),
            goalSource,
            hasCampaign: Boolean(campaign),
            priorAssetCount: priorAssets.length,
            signalCount: signals.searchOpportunities.length + signals.aeoGaps.length,
            groundedIn: ladder.groundedIn,
        },
    };
};

export const generationContextService = { getGenerationContext };

export default getGenerationContext;
