import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';
import { getBrandContextForGeneration } from './brandContextService';
import { COPY_ETHICS_GUARDRAIL } from '../lib/persuasionLayer';
import {
    CAMPAIGN_TYPES,
    ALLOWED_STEP_MODULES,
    MODULE_CAPABILITIES,
    normalizePlan,
    coerceCampaignType,
} from '../lib/campaignPlan';

// Conversational goal-intake - a brand-grounded strategist that interviews the
// user, then emits the same CampaignPlan the spine consumes. callAI is single-turn,
// so the transcript is serialized into the prompt each turn. The model returns a
// discriminated union: {mode:'question', ...} while it needs info, or {mode:'plan',
// plan} once it can propose. Anti-theater is enforced in the prompt AND by a hard
// code-level question cap. No per-feature JSON handling - callAI(json) does it.

export const MAX_QUESTIONS = 4;

const moduleMenu = ALLOWED_STEP_MODULES
    .map((m) => `  - ${m}: ${MODULE_CAPABILITIES[m]}`)
    .join('\n');

const typeMenu = CAMPAIGN_TYPES
    .map((t) => `  - ${t.id} (${t.label}): ${t.description}`)
    .join('\n');

const CAMPAIGN_INTAKE_SYSTEM = `You are a senior marketing strategist for KEPLER OS, interviewing the user to design a campaign. You are grounded in the brand context provided below.

ANTI-THEATER RULES (highest priority - a good strategist earns each question):
- Ask a question ONLY when the answer would materially change the plan.
- NEVER ask for something the brand context already tells you. Reference what you already know.
- Prefer stating a reasonable assumption and moving on over asking a low-value question.
- Be specific: name the brand's actual ICPs, offers, and differentiators. Bad: "Who is your audience?" Good: "Your profile lists {ICP names} - should this lead with one, or target both?"
- You have at most ${MAX_QUESTIONS} questions. Propose a plan as soon as you can.

CAMPAIGN TYPES you support:
${typeMenu}

YOUR SPECIALIST CHANNELS (a plan step MUST map to exactly one of these module ids - never invent a channel):
${moduleMenu}

${COPY_ETHICS_GUARDRAIL}

EACH TURN, respond with ONE raw JSON object (no markdown, no fences, no commentary), in ONE of two shapes:
1. Need more info:
{"mode":"question","question":"one specific, brand-grounded question","rationale":"one short line: why this matters (optional)","quickReplies":["up to 4 tappable suggested answers"],"field":"audience|offer|timeline|constraint|type|goal"}
2. Ready to propose (use as soon as you have enough - you may infer the rest):
{"mode":"plan","assumptions":["anything you inferred without asking"],"plan":{"goal":"one crisp sentence","campaignType":"one of the type ids above","strategySummary":"2-4 sentences on the strategy and how the steps connect","steps":[{"module":"one allowed module id","title":"short label","brief":"concrete, generation-ready brief for that specialist","rationale":"one line","suggestedOrder":1,"offsetDays":0}],"successCriteria":["1-3 measurable outcomes"]}}
CADENCE: offsetDays = whole days from campaign start (start at 0). Steps that should launch together share the SAME offsetDays (parallel); only space steps that depend on an earlier one.`;

// transcript: [{ role:'user'|'assistant', content }] → prompt text.
export const serializeTranscript = (transcript = []) =>
    transcript
        .map((t) => `${t.role === 'user' ? 'USER' : 'STRATEGIST'}: ${t.content}`)
        .join('\n');

// Count how many questions the strategist has already asked.
export const countQuestions = (transcript = []) =>
    transcript.filter((t) => t.role === 'assistant' && t.meta?.mode !== 'plan').length;

export const enforceQuestionCap = (transcript = [], max = MAX_QUESTIONS) =>
    countQuestions(transcript) >= max;

export const buildIntakePrompt = ({ contextPrompt, icpNames, transcript, campaignType, forcePlan, atCap }) => {
    const parts = [contextPrompt];
    if (icpNames) parts.push(`KNOWN ICPS: ${icpNames}`);
    if (campaignType) parts.push(`The user pre-selected campaign type: ${campaignType}.`);
    const convo = serializeTranscript(transcript);
    if (convo) parts.push(`CONVERSATION SO FAR:\n${convo}`);
    if (forcePlan) {
        parts.push('The user wants you to build the plan now. Return mode:"plan" using best-guess assumptions (list them in "assumptions").');
    } else if (atCap) {
        parts.push('You have reached your question limit. You MUST return mode:"plan" now - no more questions.');
    } else {
        parts.push('Decide your next turn. If you have enough to design a strong plan, return mode:"plan"; otherwise ask ONE high-value question (mode:"question").');
    }
    return parts.join('\n\n');
};

const str = (v, max = 600) => String(v ?? '').trim().slice(0, max);

// Validate the model's discriminated-union output. Pure - never throws.
export const normalizeTurn = (raw, ctxMeta = {}) => {
    const src = raw && typeof raw === 'object' ? raw : {};
    if (src.mode === 'plan' || src.plan) {
        const plan = normalizePlan(
            { ...(src.plan ?? {}), assumptions: src.assumptions },
            { ...ctxMeta, generatedBy: 'campaign-intake' },
        );
        return { mode: 'plan', plan };
    }
    const quickReplies = (Array.isArray(src.quickReplies) ? src.quickReplies : [])
        .map((q) => str(q, 80))
        .filter(Boolean)
        .slice(0, 4);
    return {
        mode: 'question',
        question: str(src.question, 400) || 'What is the goal of this campaign?',
        rationale: str(src.rationale, 240),
        quickReplies,
        field: str(src.field, 40),
    };
};

export const campaignIntakeService = {
    /**
     * Advance the interview one turn.
     * @param {string} workspaceId
     * @param {object} opts
     * @param {Array} opts.transcript  [{ role, content, meta? }]
     * @param {string} [opts.campaignType] pre-seed from the CTA
     * @param {boolean} [opts.forcePlan] "just build it"
     * @returns {Promise<{ok:true, turn:object, modelUsed?:string}|{ok:false, error:string, errorKind?:string}>}
     */
    nextTurn: async (workspaceId, { transcript = [], campaignType = '', forcePlan = false } = {}) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };

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
                error: 'Add a brand profile in Brand Intelligence before starting a campaign.',
            };
        }

        const icpNames = (brandContext.structured?.icps ?? [])
            .map((i) => i.segment || i.role)
            .filter(Boolean)
            .join(', ');

        const atCap = enforceQuestionCap(transcript);
        const prompt = buildIntakePrompt({
            contextPrompt: brandContext.prompt,
            icpNames,
            transcript,
            campaignType: campaignType ? coerceCampaignType(campaignType) : '',
            forcePlan,
            atCap,
        });

        let response;
        try {
            response = await callAI(prompt, {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                includeModelMeta: true,
                maxTokens: 1800,
                temperature: 0.5,
                systemPrompt: CAMPAIGN_INTAKE_SYSTEM,
            });
        } catch (err) {
            return { ok: false, error: `Strategist unavailable: ${err.message}` };
        }

        const turn = normalizeTurn(response?.content ?? {}, {
            modelUsed: response?.modelUsed ?? null,
            icpCount: brandContext.meta.icpCount ?? 0,
            hasBrand: brandContext.meta.hasBrand,
        });

        // If forced to plan but the model produced no usable steps, surface it.
        if (turn.mode === 'plan' && (!turn.plan.steps || turn.plan.steps.length === 0)) {
            return {
                ok: false,
                errorKind: 'empty_content',
                error: 'The strategist could not shape a plan yet. Add a bit more detail about the goal.',
            };
        }

        return { ok: true, turn, modelUsed: response?.modelUsed ?? null };
    },
};

export default campaignIntakeService;
