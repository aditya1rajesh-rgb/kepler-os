import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';
import { getBrandContextForGeneration } from './brandContextService';
import { PERSUASION_SYSTEM_FRAGMENT } from '../lib/persuasionLayer';
import { buildColdSkeleton, LIFECYCLE_FLOWS } from '../lib/outreachSkeletons';
import { feedbackService } from './feedbackService';

// Outreach sequence generation. Ports cold-outreach (#20) + email-marketing-bible
// (#22) + the marketingskills cold-email/emails/sms skills. The model fills copy
// into a CANONICAL skeleton (never invents structure). Reuses the shared
// persuasion layer; adds an anti-slop block (the de-AI blacklist) and a
// personalization-token system so nothing is fabricated. One robust JSON callAI
// (truncation/parse recovery is centralized - see [[ai-json-robustness]]).

// Anti-slop / banned vocabulary the model must avoid (cold-email + EMB blacklist).
const BANNED = [
    'synergy', 'leverage', 'circle back', 'circling back', 'just checking in', 'best-in-class',
    'leading provider', 'i hope this email finds you well', 'i came across your profile',
    'delve', 'foster', 'seamless', 'robust', 'cutting-edge', 'transformative', 'furthermore',
    'moreover', 'in today\'s', 'unlock', 'elevate', 'game-changer',
];

const OUTREACH_SYSTEM_PROMPT = `You are a senior outreach copywriter for KEPLER OS. You write personalized, high-reply outreach grounded in the brand context and a specific recipient profile (ICP).

${PERSUASION_SYSTEM_FRAGMENT}

OUTREACH RULES:
- Lead with the recipient's world, not ours - "you/your" should dominate over "I/we". If removing the personalized opener leaves the message still making sense, it isn't personalized enough.
- Emails: 50-125 words, ruthlessly short. Subjects: 2-4 words, lowercase, look internal (no pitch/emoji/urgency). One soft, interest-based CTA ("worth a look?" beats "book a demo").
- SMS: under 160 characters, plain text, no emoji. LinkedIn: under 300 characters, no pitch.
- Vary sentence length (a hard 3-5 word line after a long one). One genuine, defensible opinion per message. Specificity beats superlatives.
- NEVER use these phrases/words: ${BANNED.join(', ')}.

ANTI-FABRICATION + PERSONALIZATION TOKENS (critical):
- Use ONLY facts present in the brand context. NEVER invent metrics, customer names, case studies, or recipient details.
- For anything recipient-specific or any proof you don't have, emit a token instead: {{firstName}}, {{company}}, {{signal}} (their trigger event), {{observation}} (a researched detail), {{proofPoint}} (a real result to fill in). Declare every token you use.

OUTPUT CONTRACT:
- Respond with ONE raw JSON object matching the requested schema. No markdown, no code fences, no commentary. Double-quoted keys/strings.`;

const buildColdPrompt = (context, skeleton, { icpSummary, goal, offer }) => `${context}

RECIPIENT (ICP): ${icpSummary}
Goal of the sequence: ${goal || 'start a conversation'}
${offer ? `Offer / value to lead with: ${offer}` : ''}

Fill copy into this fixed cold-outreach skeleton (do not change the structure, channels, or day offsets):
${JSON.stringify(skeleton, null, 2)}

Return JSON only:
{"sequenceName":"short name",
 "personalizationVariables":[{"token":"{{firstName}}","description":"recipient first name"}],
 "steps":[{
   "stepNumber":1,"channel":"email|linkedin|sms","dayOffset":0,"framework":"PAS","purpose":"...",
   "subject":"lowercase 2-4 words (email only; empty for linkedin/sms)",
   "body":"the message with {{tokens}} for unknowns",
   "cta":"one soft, interest-based ask"
 }]}
Each follow-up must add NEW value (never "just bumping this"). Keep emails 50-125 words, SMS <160 chars, LinkedIn <300 chars.`;

const buildLifecyclePrompt = (context, flow, flowType, { icpSummary, goal }) => `${context}

RECIPIENT (ICP): ${icpSummary}
Flow: ${flow.label} - trigger: ${flow.trigger}. Goal: ${goal || flow.goal}

Fill copy into this fixed lifecycle flow (do not change the email order, delays, or per-email goals):
${JSON.stringify(flow.emails, null, 2)}

Return JSON only:
{"sequenceName":"short name","flowType":"${flowType}","trigger":"${flow.trigger}",
 "personalizationVariables":[{"token":"{{firstName}}","description":"recipient first name"}],
 "steps":[{
   "stepNumber":1,"channel":"email","delay":"Immediate","purpose":"the email's one goal",
   "subject":"<=50 chars, lowercase/casual ok",
   "previewText":"90-140 chars, extends (not repeats) the subject",
   "body":"Hook -> Context -> Value -> CTA -> warm sign-off, with {{tokens}} for unknowns",
   "cta":"one clear CTA"
 }]}
One job + one CTA per email. 3:1 value-to-promo across the flow. Keep bodies tight (transactional 50-125 words, educational up to ~300).`;

const str = (v, max = 6000) => String(v ?? '').trim().slice(0, max);
const countWords = (t) => String(t ?? '').split(/\s+/).filter(Boolean).length;
const findBanned = (t) => {
    const lower = String(t ?? '').toLowerCase();
    return BANNED.filter((b) => lower.includes(b));
};
const findTokens = (t) => Array.from(String(t ?? '').matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]);

const normalizeStep = (raw, idx) => {
    const channel = ['email', 'linkedin', 'sms'].includes(String(raw?.channel)) ? String(raw.channel) : 'email';
    const body = str(raw?.body, 6000);
    if (!body) return null;
    const subject = str(raw?.subject, 200);
    const wordCount = countWords(body);
    const charCount = body.length;
    // Channel-appropriate length flag.
    const overLength =
        channel === 'sms' ? charCount > 160
            : channel === 'linkedin' ? charCount > 300
                : wordCount > 125;
    return {
        stepNumber: Number(raw?.stepNumber) || idx + 1,
        channel,
        dayOffset: typeof raw?.dayOffset === 'number' ? raw.dayOffset : null,
        delay: str(raw?.delay, 40),
        framework: str(raw?.framework, 40),
        purpose: str(raw?.purpose, 300),
        subject,
        previewText: str(raw?.previewText, 200),
        body,
        cta: str(raw?.cta, 200),
        validation: {
            wordCount,
            charCount,
            overLength,
            bannedFound: findBanned(`${subject} ${body}`),
            tokens: Array.from(new Set([...findTokens(body), ...findTokens(subject)])),
        },
    };
};

const COMPLIANCE_NOTES = {
    email: 'On send: include an unsubscribe link + physical address (CAN-SPAM/GDPR). Do not fabricate these.',
    sms: 'On send: SMS requires prior express written consent, a "Reply STOP to opt out" footer, and quiet hours (recipient-local ~9am-8pm). Treat as opt-in only.',
    linkedin: 'LinkedIn DMs must respect connection/messaging limits; keep it personal, not a pitch.',
};

export const outreachService = {
    /**
     * Generate an outreach sequence.
     * @param {string} workspaceId
     * @param {object} cfg
     * @param {'cold'|'lifecycle'} cfg.mode
     * @param {object} cfg.icp - selected persona ({ role, segment, painPoints, ... })
     * @param {string} [cfg.goal]
     * @param {string} [cfg.offer]            (cold)
     * @param {string[]} [cfg.channels]       (cold) e.g. ['email','linkedin','sms']
     * @param {number} [cfg.touchCount]       (cold) 3-5
     * @param {string} [cfg.flowType]         (lifecycle) welcome|nurture|winback|reengagement|dunning
     * @returns {Promise<{ok:boolean, sequence?:object, error?:string}>}
     */
    generateSequence: async (workspaceId, cfg = {}) => {
        const { mode = 'cold', icp, goal = '', offer = '', channels = ['email'], touchCount = 5, flowType = 'welcome' } = cfg;
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };
        if (!icp) return { ok: false, error: 'Select a recipient ICP first.' };

        let brandContext;
        try {
            brandContext = await getBrandContextForGeneration(workspaceId, { module: 'outreach', depth: 'profile' });
        } catch (err) {
            return { ok: false, error: `Could not load brand context: ${err.message}` };
        }
        if (!brandContext.meta.hasBrand) {
            return { ok: false, error: 'Add a brand profile in Brand Intelligence before generating outreach.' };
        }

        const icpSummary = [icp.segment || icp.role, icp.painPoints && `pains: ${icp.painPoints}`]
            .filter(Boolean).join(' - ');

        const guidance = await feedbackService.getGuidance(workspaceId, 'outreach');
        const ctx = brandContext.prompt + guidance;

        let prompt;
        let channelsUsed;
        if (mode === 'lifecycle') {
            const flow = LIFECYCLE_FLOWS[flowType];
            if (!flow) return { ok: false, error: `Unknown lifecycle flow: ${flowType}` };
            prompt = buildLifecyclePrompt(ctx, flow, flowType, { icpSummary, goal });
            channelsUsed = ['email'];
        } else {
            const skeleton = buildColdSkeleton(touchCount, channels);
            prompt = buildColdPrompt(ctx, skeleton, { icpSummary, goal, offer });
            channelsUsed = Array.from(new Set(skeleton.map((s) => s.channel)));
        }

        let response;
        try {
            response = await callAI(prompt, {
                model: FREE_MODEL_FALLBACKS[0],
                modelFallbacks: FREE_MODEL_FALLBACKS,
                json: true,
                includeModelMeta: true,
                maxTokens: 4000,
                temperature: 0.6,
                systemPrompt: OUTREACH_SYSTEM_PROMPT,
            });
        } catch (err) {
            return { ok: false, error: `Outreach generation failed: ${err.message}` };
        }

        const content = response?.content ?? {};
        const steps = (Array.isArray(content.steps) ? content.steps : [])
            .map(normalizeStep)
            .filter(Boolean);
        if (steps.length === 0) {
            return { ok: false, errorKind: 'empty_content', error: 'The AI returned no usable steps. Try a different goal or enrich the brand profile.' };
        }

        const personalizationVariables = Array.isArray(content.personalizationVariables)
            ? content.personalizationVariables
                .map((v) => ({ token: str(v?.token, 60), description: str(v?.description, 200) }))
                .filter((v) => v.token)
            : [];

        return {
            ok: true,
            sequence: {
                name: str(content.sequenceName, 200) || (mode === 'lifecycle' ? `${flowType} flow` : 'Cold sequence'),
                mode,
                flowType: mode === 'lifecycle' ? flowType : null,
                goal: goal || (mode === 'lifecycle' ? LIFECYCLE_FLOWS[flowType]?.goal : ''),
                steps,
                personalizationVariables,
                complianceNotes: channelsUsed.map((c) => COMPLIANCE_NOTES[c]).filter(Boolean),
            },
            modelUsed: response?.modelUsed ?? null,
        };
    },
};

export default outreachService;
