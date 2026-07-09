// Campaign plan - the shared contract between the plan producers (strategyService
// one-shot + campaignIntakeService conversational) and campaignService.createCampaign.
//
// A CampaignPlan is the "team spine" object:
//   { goal, campaignType, strategySummary, channelMix[], steps[], successCriteria?[], meta }
// where each step maps to ONE existing specialist generator module and carries a
// generation-ready brief. normalizePlan() is the single, pure place that coerces
// raw model output into this shape and drops anything the app can't act on.

// The only modules a step may target - the four specialist generators that
// produce a content_item. brand-intelligence is NOT a step target (it's research,
// not a generated asset).
export const ALLOWED_STEP_MODULES = ['seo-aeo', 'ad-campaigns', 'outreach', 'social-media'];

// One-line capability of each specialist, injected into strategy prompts so the
// model sequences real modules the app can deep-link into (never invented channels).
export const MODULE_CAPABILITIES = {
    'seo-aeo': 'SEO & AEO blog/content engine - long-form articles, keyword-targeted posts, answer-engine-optimized pages.',
    'ad-campaigns': 'Paid ad copy + creative - Google/Meta/LinkedIn ad variants and audience targeting.',
    outreach: 'Cold + lifecycle outreach - multi-touch email / LinkedIn / SMS sequences.',
    'social-media': 'Organic social - a multi-week post calendar (LinkedIn/multi-platform) + carousels.',
};

// The 5 campaign types. `shape` + `defaultModules` guide the strategist; label +
// description drive the UI tiles. `skillsPorted` documents the marketing skills
// encoded as prompt guidance (no runtime skill files exist in this repo).
export const CAMPAIGN_TYPES = [
    {
        id: 'launch',
        label: 'Launch',
        description: 'Introduce a product, feature, or brand to the market.',
        shape: 'Pre-launch awareness → launch-moment assets → post-launch nurture.',
        defaultModules: ['social-media', 'seo-aeo', 'ad-campaigns', 'outreach'],
        skillsPorted: ['launch', 'marketing-plan', 'content-strategy'],
    },
    {
        id: 'lead-gen',
        label: 'Lead generation',
        description: 'Capture and convert new leads or signups.',
        shape: 'Lead magnet / offer → paid + SEO capture → outreach follow-up.',
        defaultModules: ['seo-aeo', 'ad-campaigns', 'outreach'],
        skillsPorted: ['marketing-plan', 'offers', 'content-strategy'],
    },
    {
        id: 'awareness',
        label: 'Awareness',
        description: 'Build top-of-funnel reach and brand presence.',
        shape: 'Consistent multi-channel content presence, top-of-funnel, no hard ask.',
        defaultModules: ['social-media', 'seo-aeo'],
        skillsPorted: ['content-strategy', 'social'],
    },
    {
        id: 'fundraise',
        label: 'Fundraise',
        description: 'Rally support and donations toward a target.',
        shape: 'Story + case for support → awareness push → direct asks with a deadline.',
        defaultModules: ['social-media', 'outreach', 'seo-aeo'],
        skillsPorted: ['marketing-plan', 'content-strategy', 'public-relations'],
    },
    {
        id: 'retention',
        label: 'Retention',
        description: 'Keep existing users engaged and reduce churn.',
        shape: 'Segment by lifecycle stage → nurture + re-engagement → win-back.',
        defaultModules: ['outreach', 'social-media'],
        skillsPorted: ['churn-prevention', 'onboarding', 'content-strategy'],
    },
];

export const CAMPAIGN_TEMPLATES = Object.fromEntries(CAMPAIGN_TYPES.map((t) => [t.id, t]));

const DEFAULT_TYPE = 'launch';
const MAX_STEPS = 8;

const str = (v, max = 1200) => String(v ?? '').trim().slice(0, max);

// Coerce a raw campaign-type string to the enum. Maps common synonyms.
export const coerceCampaignType = (raw) => {
    const v = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '-');
    if (CAMPAIGN_TEMPLATES[v]) return v;
    const synonyms = {
        signups: 'lead-gen',
        'sign-ups': 'lead-gen',
        leadgen: 'lead-gen',
        leads: 'lead-gen',
        'lead-generation': 'lead-gen',
        conversion: 'lead-gen',
        conversions: 'lead-gen',
        brand: 'awareness',
        'brand-awareness': 'awareness',
        reach: 'awareness',
        fundraising: 'fundraise',
        donation: 'fundraise',
        donations: 'fundraise',
        retain: 'retention',
        churn: 'retention',
        engagement: 'retention',
    };
    return synonyms[v] ?? DEFAULT_TYPE;
};

const genId = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `step-${Math.random().toString(36).slice(2, 10)}`;

// Normalize a raw plan (from the model, one-shot or conversational) into the
// frozen CampaignPlan shape. Pure - never throws, never hits network. Drops steps
// targeting non-allowed modules. Callers decide viability via plan.steps.length.
export const normalizePlan = (raw, ctxMeta = {}) => {
    const src = raw && typeof raw === 'object' ? raw : {};
    const rawSteps = Array.isArray(src.steps) ? src.steps : [];

    const steps = rawSteps
        .map((s, i) => {
            const module = String(s?.module ?? '').trim();
            if (!ALLOWED_STEP_MODULES.includes(module)) return null;
            return {
                id: genId(),
                module,
                title: str(s?.title, 120) || 'Untitled step',
                brief: str(s?.brief, 1200),
                rationale: str(s?.rationale, 400),
                suggestedOrder: Number.isFinite(s?.suggestedOrder) ? s.suggestedOrder : i + 1,
                suggestedConfig: s?.suggestedConfig && typeof s.suggestedConfig === 'object'
                    ? s.suggestedConfig
                    : {},
                status: 'pending',
                contentItemId: null,
                scheduledDate: typeof s?.scheduledDate === 'string' ? s.scheduledDate.slice(0, 10) : null,
                // Days from the campaign anchor (start date, or an event date). Steps
                // sharing an offset run in parallel; NEGATIVE = before the anchor (used
                // for event-anchored campaigns). Null → auto-schedule falls back to weekly.
                offsetDays: Number.isFinite(s?.offsetDays) ? Math.round(s.offsetDays) : null,
            };
        })
        .filter(Boolean)
        .slice(0, MAX_STEPS)
        .sort((a, b) => a.suggestedOrder - b.suggestedOrder)
        .map((s, i) => ({ ...s, suggestedOrder: i + 1 }));

    const channelMix = Array.from(new Set(steps.map((s) => s.module)));

    const successCriteria = (Array.isArray(src.successCriteria) ? src.successCriteria : [])
        .map((c) => str(c, 240))
        .filter(Boolean)
        .slice(0, 6);

    const assumptions = (Array.isArray(src.assumptions) ? src.assumptions : [])
        .map((a) => str(a, 240))
        .filter(Boolean)
        .slice(0, 6);

    return {
        goal: str(src.goal, 400),
        campaignType: coerceCampaignType(src.campaignType),
        strategySummary: str(src.strategySummary, 800),
        channelMix,
        steps,
        successCriteria,
        // Event anchor (set for event-anchored campaigns): steps schedule around this date.
        anchorDate: typeof src.anchorDate === 'string' ? src.anchorDate.slice(0, 10) : null,
        anchorLabel: str(src.anchorLabel, 120),
        meta: {
            generatedBy: ctxMeta.generatedBy ?? 'strategy-engine',
            modelUsed: ctxMeta.modelUsed ?? null,
            createdFrom: {
                icpCount: ctxMeta.icpCount ?? 0,
                hasBrand: ctxMeta.hasBrand ?? false,
            },
            ...(assumptions.length ? { assumptions } : {}),
        },
    };
};

// A plan is viable (worth persisting) when it has at least one actionable step.
export const isViablePlan = (plan) => Boolean(plan?.steps?.length);
