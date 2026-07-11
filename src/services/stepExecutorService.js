import { contentService } from './contentService';
import { campaignService } from './campaignService';
import { blogPipelineService } from './blogPipelineService';
import { socialService } from './socialService';
import { adGenerationService } from './adGenerationService';
import { outreachService } from './outreachService';
import { brandService } from './brandService';

// Auto-executing campaign spine (V2 Phase 4): run a campaign step's generation
// HEADLESSLY from the Campaigns view, composing the exact service pipeline each
// module's page uses — same content_items shapes, same sources, same campaign
// attribution — so an auto-executed asset is indistinguishable from a
// hand-generated one (and rateable by the same feedback loop).
//
// Deliberate difference from the in-module flow: pages mark a step 'done' after
// generation because the user just watched the output appear. Here the OS did
// the work unseen, so the step KEEPS status 'pending' and only gains
// contentItemId — surfacing as "Review draft". Approval stays human.
// See [[aeo-wedge-roadmap]].

export const STEP_MODULE_TO_TYPE = {
    'seo-aeo': 'seo',
    'social-media': 'social',
    'ad-campaigns': 'ads',
    'outreach': 'outreach',
};

const fail = (error) => ({ ok: false, error });

// Reuse the item a module page may already have seeded for this step (pages
// seed a queue item on deep-link mount) instead of creating a duplicate.
const findStepItem = async (workspaceId, type, stepId) => {
    const items = await contentService.getContentItems(workspaceId, type);
    return items.find((i) => i.campaignStepId === stepId) ?? null;
};

const executeSeo = async (workspaceId, campaign, step) => {
    const targetKeyword = step.suggestedConfig?.topic || step.title || '';
    if (!targetKeyword) return fail('This step has no topic to write about — add a title or topic first.');

    let item = await findStepItem(workspaceId, 'seo', step.id);
    if (item?.status === 'completed') return { ok: true, contentItemId: item.id, itemCount: 1 };
    if (!item) {
        item = await contentService.createContentItem(workspaceId, 'seo', {
            title: (step.suggestedConfig?.topic || step.brief || step.title || 'Campaign content').slice(0, 80),
            targetKeyword,
            intent: step.brief || '',
            source: 'campaign-step',
            campaignId: campaign.id,
            campaignStepId: step.id,
        });
    }

    // A page-seeded item may carry an empty keyword — fall back to the step's.
    const genItem = { ...item, targetKeyword: item.targetKeyword || targetKeyword };

    await contentService.updateContentItem(workspaceId, item.id, { status: 'generating' });
    const res = await blogPipelineService.generateBlog(workspaceId, { contentItem: genItem });
    if (!res.ok) {
        // Same recovery the SEO page uses: back to queue, error surfaced to the caller.
        await contentService.updateContentItem(workspaceId, item.id, { status: 'queue' });
        return fail(res.error || 'Blog generation failed.');
    }
    await contentService.updateContentItem(workspaceId, item.id, {
        status: 'completed',
        title: res.result.title || item.title,
        targetKeyword: genItem.targetKeyword,
        payload: { ...item.payload, blog: res.result },
    });
    return { ok: true, contentItemId: item.id, itemCount: 1 };
};

const executeSocial = async (workspaceId, campaign, step) => {
    const cfg = step.suggestedConfig ?? {};
    const res = await socialService.generateContentCalendar(workspaceId, {
        startDate: (step.scheduledDate || new Date().toISOString()).slice(0, 10),
        weeks: cfg.weeks ?? 2,
        postsPerWeek: cfg.postsPerWeek ?? 3,
        platforms: cfg.platforms ?? ['linkedin'],
        topic: cfg.topic || step.title || '',
        voice: cfg.voice || 'company',
    });
    if (!res.ok) return fail(res.error || 'Social calendar generation failed.');
    if (!res.posts?.length) return fail('No posts were generated.');

    const rows = res.posts.map((p) => ({
        title: (p.hook || `${p.platform} post`).slice(0, 80),
        status: 'completed',
        source: 'social-calendar',
        payload: { date: p.date, platform: p.platform, kind: 'post', post: p },
        campaignId: campaign.id,
        campaignStepId: step.id,
    }));
    const created = await contentService.createContentItems(workspaceId, 'social', rows);
    return { ok: true, contentItemId: created[0]?.id ?? null, itemCount: created.length };
};

const executeAds = async (workspaceId, campaign, step) => {
    const cfg = step.suggestedConfig ?? {};
    const config = {
        name: step.title || 'Campaign ads',
        platform: cfg.platform || 'multi',
        objective: step.brief || step.title || campaign.goal || '',
        campaignType: cfg.type || campaign.campaignType || '',
    };
    const res = await adGenerationService.generateAdVariants(workspaceId, { ...config, count: cfg.count ?? 5 });
    if (!res.ok) return fail(res.error || 'Ad variant generation failed.');

    const created = await contentService.createContentItem(workspaceId, 'ads', {
        title: config.name,
        status: 'completed',
        source: 'ad-generator',
        payload: { config, variants: res.variants },
        campaignId: campaign.id,
        campaignStepId: step.id,
    });
    return { ok: true, contentItemId: created.id, itemCount: 1 };
};

const executeOutreach = async (workspaceId, campaign, step) => {
    const cfg = step.suggestedConfig ?? {};
    const personas = await brandService.getPersonas(workspaceId);
    const icp = personas.find((p) => p.id === cfg.icpId) ?? personas[0];
    if (!icp) return fail('Outreach needs an ICP — confirm one in Brand Intelligence → Audience & ICP first.');

    const mode = cfg.mode || 'cold';
    const res = await outreachService.generateSequence(workspaceId, {
        mode,
        icp,
        goal: step.brief || campaign.goal || '',
        offer: cfg.offer || '',
        channels: cfg.channels ?? ['email'],
        touchCount: cfg.touchCount ?? 5,
        flowType: cfg.flowType || 'welcome',
    });
    if (!res.ok) return fail(res.error || 'Sequence generation failed.');

    const created = await contentService.createContentItem(workspaceId, 'outreach', {
        title: res.sequence.name || step.title || 'Outreach sequence',
        status: 'completed',
        source: `outreach-${mode}`,
        payload: { config: { ...cfg, mode, icpId: icp.id }, sequence: res.sequence },
        campaignId: campaign.id,
        campaignStepId: step.id,
    });
    return { ok: true, contentItemId: created.id, itemCount: 1 };
};

const EXECUTORS = {
    'seo-aeo': executeSeo,
    'social-media': executeSocial,
    'ad-campaigns': executeAds,
    'outreach': executeOutreach,
};

export const stepExecutorService = {
    /**
     * Execute one campaign step headlessly: generate the module's asset(s),
     * attach the first to the step (contentItemId), and leave the step PENDING
     * for human review.
     *
     * @returns {Promise<{ok:true, contentItemId:string|null, itemCount:number, campaign?:object}
     *                  |{ok:false, error:string}>}
     */
    executeStep: async (workspaceId, campaign, step) => {
        if (!workspaceId || !campaign?.id || !step?.id) return fail('Missing campaign or step.');
        if (step.contentItemId) return { ok: true, contentItemId: step.contentItemId, itemCount: 0 };
        const executor = EXECUTORS[step.module];
        if (!executor) return fail(`Unsupported step module: ${step.module}`);

        const res = await executor(workspaceId, campaign, step);
        if (!res.ok) return res;

        // Link asset to step; status stays 'pending' — approval is the user's.
        const updated = await campaignService.updateStep(workspaceId, campaign.id, step.id, {
            contentItemId: res.contentItemId,
        });
        return { ...res, campaign: updated ?? undefined };
    },
};

export default stepExecutorService;
