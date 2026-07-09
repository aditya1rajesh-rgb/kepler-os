import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';
import { getBrandContextForGeneration } from './brandContextService';
import { PERSUASION_SYSTEM_FRAGMENT } from '../lib/persuasionLayer';
import { feedbackService } from './feedbackService';
import {
    CAMPAIGN_TEMPLATES,
    MODULE_CAPABILITIES,
    ALLOWED_STEP_MODULES,
    normalizePlan,
    isViablePlan,
    coerceCampaignType,
} from '../lib/campaignPlan';

// Strategy engine - the "strategist" that turns a business goal into a coordinated,
// sequenced plan across the existing specialist modules. This is the one new AI
// call; it follows the exact shape of every other generator (brand context →
// feedback guidance → one robust JSON callAI → normalize). Ports the marketing-plan
// / content-strategy / launch skills conceptually, as strategist instructions +
// per-type shape guidance baked into the prompt (no runtime skill files exist).

const moduleMenu = ALLOWED_STEP_MODULES
    .map((m) => `- ${m}: ${MODULE_CAPABILITIES[m]}`)
    .join('\n');

const STRATEGY_SYSTEM_PROMPT = `You are a senior marketing strategist for KEPLER OS. You turn a single business goal into a coordinated, sequenced campaign that a small team could actually run - grounded in the provided brand context and ICPs.

${PERSUASION_SYSTEM_FRAGMENT}

YOUR SPECIALIST CHANNELS (a step MUST map to exactly one of these module ids - never invent a channel):
${moduleMenu}

PRINCIPLES:
- Sequence matters: order steps the way a real campaign unfolds (warm up → core push → follow-up).
- Cadence matters: set each step's "offsetDays" (whole days from campaign start, starting at 0). Steps that should launch TOGETHER share the SAME offsetDays (run them in parallel - do not artificially stagger high-value work). Only add a gap when a step genuinely depends on an earlier one finishing.
- Every step's "brief" must be concrete and generation-ready for that specialist (topic/angle/audience), not a vague theme.
- Ground everything in the brand's real value, ICPs, and proof. Do not fabricate stats, deadlines, or customer counts.
- Prefer 3–6 high-signal steps over a long list of filler. If a channel adds no value for this goal, omit it.

OUTPUT CONTRACT:
- Respond with ONE raw JSON object matching the requested schema. No markdown, no code fences, no commentary. Double-quoted keys/strings.`;

const buildPrompt = (context, { goal, campaignType, anchorLabel, anchorDate }) => {
    const template = CAMPAIGN_TEMPLATES[campaignType] ?? CAMPAIGN_TEMPLATES.launch;
    const eventBlock = anchorLabel
        ? `\nANCHOR EVENT: "${anchorLabel}"${anchorDate ? ` on ${anchorDate}` : ''}. This campaign supports that event. Set each step's "offsetDays" RELATIVE TO THE EVENT DAY (0 = event day): NEGATIVE = days BEFORE the event (build-up: teasers, invites, ads), POSITIVE = days AFTER (follow-up, recap, nurture). Most work should happen before the event.`
        : '';
    return `${context}

CAMPAIGN GOAL: ${goal}
CAMPAIGN TYPE: ${template.label} - typical shape: ${template.shape}
Channels that usually fit this type (use judgement, not obligation): ${template.defaultModules.join(', ')}${eventBlock}

Design the campaign. Return JSON only:
{"goal":"restate the goal in one crisp sentence",
"strategySummary":"2-4 sentences: the strategic rationale and how the steps work together",
"steps":[{
  "module":"one of: ${ALLOWED_STEP_MODULES.join(' | ')}",
  "title":"short human label for this step",
  "brief":"a concrete, generation-ready brief for that specialist (what to make, for whom, the angle)",
  "rationale":"one line: why this step, here, in the sequence",
  "suggestedOrder":1,
  "offsetDays":0
}],
"successCriteria":["1-3 measurable outcomes that would mean this campaign worked"]}

Provide 3-6 ordered steps. Each step maps to exactly one allowed module. Only include channels that genuinely advance this goal.`;
};

export const strategyService = {
    /**
     * Turn a goal + campaign type into a normalized CampaignPlan.
     * @param {string} workspaceId
     * @param {object} opts
     * @param {string} opts.goal
     * @param {string} [opts.campaignType]
     * @param {string} [opts.title]
     * @returns {Promise<{ok:true, plan:object, modelUsed?:string}|{ok:false, error:string, errorKind?:string}>}
     */
    generateCampaignPlan: async (workspaceId, { goal = '', campaignType = 'launch', title = '', anchorLabel = '', anchorDate = null } = {}) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };
        if (!goal.trim()) return { ok: false, errorKind: 'no_goal', error: 'Describe the campaign goal first.' };

        const type = coerceCampaignType(campaignType);

        let brandContext;
        try {
            brandContext = await getBrandContextForGeneration(workspaceId, { module: 'default', depth: 'profile' });
        } catch (err) {
            return { ok: false, error: `Could not load brand context: ${err.message}` };
        }
        if (!brandContext.meta.hasBrand) {
            return {
                ok: false,
                errorKind: 'insufficient_context',
                error: 'Add a brand profile in Brand Intelligence before planning a campaign.',
            };
        }

        const guidance = await feedbackService.getGuidance(workspaceId, 'strategy');

        let response;
        try {
            response = await callAI(buildPrompt(brandContext.prompt + guidance, { goal, campaignType: type, anchorLabel, anchorDate }), {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                includeModelMeta: true,
                maxTokens: 3500,
                temperature: 0.6,
                systemPrompt: STRATEGY_SYSTEM_PROMPT,
            });
        } catch (err) {
            return { ok: false, error: `Strategy generation failed: ${err.message}` };
        }

        const plan = normalizePlan(
            {
                ...(response?.content ?? {}),
                goal: response?.content?.goal || goal,
                campaignType: type,
                anchorDate: anchorDate || null,
                anchorLabel: anchorLabel || '',
            },
            {
                generatedBy: 'strategy-engine',
                modelUsed: response?.modelUsed ?? null,
                icpCount: brandContext.meta.icpCount ?? 0,
                hasBrand: brandContext.meta.hasBrand,
            },
        );

        if (!isViablePlan(plan)) {
            return {
                ok: false,
                errorKind: 'empty_content',
                error: 'The strategist returned no usable steps. Try a clearer goal or enrich the brand profile.',
            };
        }

        return { ok: true, plan, title: title || plan.goal.slice(0, 80), modelUsed: response?.modelUsed ?? null };
    },
};

export default strategyService;
