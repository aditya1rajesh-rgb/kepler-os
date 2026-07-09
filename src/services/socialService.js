import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';
import { getBrandContextForGeneration } from './brandContextService';
import {
    SOCIAL_PLATFORM_SPECS,
    LINKEDIN_HOOK_FORMULAS,
    LINKEDIN_GOALS,
    FOUNDER_PILLARS,
    FOUNDER_NARRATIVE_TYPES,
    SOCIAL_ANTI_SLOP,
} from '../lib/socialSpecs';
import { feedbackService } from './feedbackService';

// Social content generation. Ports the LinkedIn (#27) hook-formula + pick-by-goal
// + algorithm rules and the voice-first (#28) per-channel specs + founder pillars.
// The model fills copy into proven structures; code validates length. One robust
// JSON callAI per call (parse/repair/retry centralized - see [[ai-json-robustness]]).

const baseSystem = (extra = '') => `You are a senior social media copywriter for KEPLER OS. Write platform-native posts grounded ONLY in the provided brand context - never invent facts, metrics, or customers.

${SOCIAL_ANTI_SLOP}
${extra}

OUTPUT CONTRACT: Respond with ONE raw JSON object matching the requested schema. No markdown, no code fences, no commentary. Double-quoted keys/strings.`;

const str = (v, max = 6000) => String(v ?? '').trim().slice(0, max);
const arr = (v, max = 12) => (Array.isArray(v) ? v.map((x) => str(x, 80)).filter(Boolean).slice(0, max) : []);

const validateForPlatform = (body, platform) => {
    const spec = SOCIAL_PLATFORM_SPECS[platform];
    const charCount = String(body ?? '').length;
    return { charCount, limit: spec?.charLimit ?? null, overLimit: spec ? charCount > spec.charLimit : false };
};

const loadContext = async (workspaceId) => {
    const ctx = await getBrandContextForGeneration(workspaceId, { module: 'social', depth: 'profile' });
    if (!ctx.meta.hasBrand) throw new Error('Add a brand profile in Brand Intelligence before generating social content.');
    // Learning loop: fold past low-rated feedback into the context for every social call.
    const guidance = await feedbackService.getGuidance(workspaceId, 'social');
    return { ...ctx, prompt: ctx.prompt + guidance };
};

const runJson = async (prompt, systemPrompt, maxTokens = 2800) => {
    const res = await callAI(prompt, {
        model: FREE_MODEL_FALLBACKS[0],
        modelFallbacks: FREE_MODEL_FALLBACKS,
        json: true,
        includeModelMeta: true,
        maxTokens,
        temperature: 0.7,
        systemPrompt,
    });
    return res?.content ?? {};
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const chunk = (xs, size) => { const out = []; for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size)); return out; };

// posts/week -> which weekdays to post on (0=Sun … 6=Sat).
const WEEKDAY_SLOTS = { 1: [3], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
// Angle pool to rotate across the calendar so a month isn't repetitive (content-matrix idea).
const ANGLE_POOL = ['how_to', 'story', 'contrarian', 'list', 'case_study', 'question', 'behind_the_scenes', 'data_insight', 'myth_bust', 'quick_tip'];

// Build a posting schedule: dated slots across the timeline, round-robin platforms.
const buildSchedule = (startDate, weeks, postsPerWeek, platforms) => {
    const weekdays = WEEKDAY_SLOTS[clamp(postsPerWeek, 1, 5)] ?? [1, 3, 5];
    const total = weeks * weekdays.length;
    const slots = [];
    const d = new Date(startDate);
    let platIdx = 0;
    let guard = 0;
    while (slots.length < total && guard < weeks * 7 + 21) {
        if (weekdays.includes(d.getDay())) {
            slots.push({ date: d.toISOString().slice(0, 10), platform: platforms[platIdx % platforms.length] });
            platIdx++;
        }
        d.setDate(d.getDate() + 1);
        guard++;
    }
    return slots;
};

export const socialService = {
    /** Multi-platform posts from one topic. */
    generatePosts: async (workspaceId, { platforms = ['linkedin'], topic = '' } = {}) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };
        const chosen = platforms.filter((p) => SOCIAL_PLATFORM_SPECS[p]);
        if (chosen.length === 0) return { ok: false, error: 'Select at least one platform.' };

        let ctx;
        try { ctx = await loadContext(workspaceId); } catch (err) { return { ok: false, error: err.message }; }

        const specBlock = chosen.map((p) => `- ${SOCIAL_PLATFORM_SPECS[p].label}: ${SOCIAL_PLATFORM_SPECS[p].guidance}`).join('\n');
        const prompt = `${ctx.prompt}

Topic / angle: ${topic || 'pick the strongest angle from the brand context'}

Write ONE native post for each of these platforms, adapting format/length to each:
${specBlock}

Return JSON only:
{"posts":[{"platform":"${chosen[0]}","hook":"scroll-stopping first line","body":"full post text","hashtags":["..."],"cta":"one clear CTA"}]}`;

        let content;
        try { content = await runJson(prompt, baseSystem()); } catch (err) { return { ok: false, error: `Generation failed: ${err.message}` }; }

        const posts = (Array.isArray(content.posts) ? content.posts : [])
            .map((p) => {
                const platform = SOCIAL_PLATFORM_SPECS[p?.platform] ? p.platform : chosen[0];
                const body = str(p?.body, 6000);
                if (!body) return null;
                return { platform, hook: str(p?.hook, 400), body, hashtags: arr(p?.hashtags), cta: str(p?.cta, 200), validation: validateForPlatform(body, platform) };
            })
            .filter(Boolean);
        if (posts.length === 0) return { ok: false, error: 'No usable posts returned. Try a clearer topic.' };
        return { ok: true, posts };
    },

    /** LinkedIn posts - hook-formula + pick-by-goal; standard or founder voice. */
    generateLinkedInPosts: async (workspaceId, { topic = '', goal = 'comments', mode = 'standard', pillar = 'authority', narrativeType = '', count = 3 } = {}) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };
        let ctx;
        try { ctx = await loadContext(workspaceId); } catch (err) { return { ok: false, error: err.message }; }

        const formulaIds = mode === 'founder'
            ? ['confession', 'failure', 'contrarian', 'how_i', 'curiosity_gap']
            : (LINKEDIN_GOALS[goal] ?? LINKEDIN_GOALS.comments);
        const formulas = LINKEDIN_HOOK_FORMULAS.filter((f) => formulaIds.includes(f.id));
        const formulaBlock = formulas.map((f) => `- ${f.id} (${f.name}): ${f.skeleton}`).join('\n');
        const ln = SOCIAL_PLATFORM_SPECS.linkedin;

        const founderBlock = mode === 'founder'
            ? `\nThis is a FOUNDER personal-brand post. Pillar: ${FOUNDER_PILLARS[pillar]?.label} - ${FOUNDER_PILLARS[pillar]?.desc}${narrativeType ? `\nNarrative type: ${FOUNDER_NARRATIVE_TYPES.find((n) => n.id === narrativeType)?.label ?? narrativeType}` : ''}\nWrite first-person, vulnerable, signal over hustle. It should pass the "investors will read this before our next meeting" test. One product mention max.`
            : `\nEngagement goal: ${goal}. Choose the hook formula that best serves it.`;

        const prompt = `${ctx.prompt}

Topic / angle: ${topic || 'pick the strongest angle from the brand context'}
${founderBlock}

LinkedIn rules: ${ln.guidance}

Write ${count} distinct LinkedIn posts, each using a DIFFERENT hook formula from:
${formulaBlock}

Return JSON only:
{"posts":[{"formula":"formula id used","hook":"first line (<=210 chars, ideally <=140)","body":"full post, 900-1300 chars, double line-breaks between ideas","hashtags":["0-2 tags"],"cta":"engagement prompt / question"}]}`;

        let content;
        try { content = await runJson(prompt, baseSystem(), 3600); } catch (err) { return { ok: false, error: `Generation failed: ${err.message}` }; }

        const posts = (Array.isArray(content.posts) ? content.posts : [])
            .map((p) => {
                const body = str(p?.body, 6000);
                if (!body) return null;
                return { platform: 'linkedin', formula: str(p?.formula, 60), hook: str(p?.hook, 400), body, hashtags: arr(p?.hashtags, 3), cta: str(p?.cta, 200), validation: validateForPlatform(body, 'linkedin') };
            })
            .filter(Boolean);
        if (posts.length === 0) return { ok: false, error: 'No usable posts returned.' };
        return { ok: true, posts, mode };
    },

    /** Long-form (e.g. a finished blog) → a week of channel-native posts. */
    repurposeContent: async (workspaceId, { sourceText = '', channels = ['linkedin', 'x', 'instagram'], count = 5 } = {}) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };
        if (!String(sourceText).trim()) return { ok: false, error: 'Provide source content to repurpose.' };
        const chosen = channels.filter((c) => SOCIAL_PLATFORM_SPECS[c]);
        if (chosen.length === 0) return { ok: false, error: 'Select at least one channel.' };

        let ctx;
        try { ctx = await loadContext(workspaceId); } catch (err) { return { ok: false, error: err.message }; }

        const specBlock = chosen.map((p) => `- ${SOCIAL_PLATFORM_SPECS[p].label}: ${SOCIAL_PLATFORM_SPECS[p].guidance}`).join('\n');
        const prompt = `${ctx.prompt}

SOURCE CONTENT TO REPURPOSE (extract the sharpest points; do not invent anything not present here or in the brand context):
${str(sourceText, 14000)}

Extract the ${count} strongest distinct ideas/points/stats from the source, then write ${count} channel-native posts (one per idea), distributing across these channels:
${specBlock}

Each post must stand alone and use a DIFFERENT angle. Return JSON only:
{"posts":[{"channel":"${chosen[0]}","sourceKeyPoint":"the idea this is built on","hook":"first line","body":"full post adapted to the channel","hashtags":["..."],"cta":"one CTA"}]}`;

        let content;
        try { content = await runJson(prompt, baseSystem(), 3600); } catch (err) { return { ok: false, error: `Repurpose failed: ${err.message}` }; }

        const posts = (Array.isArray(content.posts) ? content.posts : [])
            .map((p) => {
                const channel = SOCIAL_PLATFORM_SPECS[p?.channel] ? p.channel : chosen[0];
                const body = str(p?.body, 6000);
                if (!body) return null;
                return { platform: channel, sourceKeyPoint: str(p?.sourceKeyPoint, 300), hook: str(p?.hook, 400), body, hashtags: arr(p?.hashtags), cta: str(p?.cta, 200), validation: validateForPlatform(body, channel) };
            })
            .filter(Boolean);
        if (posts.length === 0) return { ok: false, error: 'No usable posts returned from the source.' };
        return { ok: true, posts };
    },

    /**
     * Generate a full content calendar in one run: a native post for every
     * scheduled slot across the timeline + platforms. Chunked so large months
     * don't truncate; each post carries its scheduled date.
     * @returns {Promise<{ok:boolean, posts?:object[], error?:string, partial?:boolean}>}
     */
    generateContentCalendar: async (workspaceId, { startDate = new Date().toISOString().slice(0, 10), weeks = 4, postsPerWeek = 3, platforms = ['linkedin'], topic = '', voice = 'company' } = {}) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };
        const chosen = platforms.filter((p) => SOCIAL_PLATFORM_SPECS[p]);
        if (chosen.length === 0) return { ok: false, error: 'Select at least one platform.' };

        let ctx;
        try { ctx = await loadContext(workspaceId); } catch (err) { return { ok: false, error: err.message }; }

        const slots = buildSchedule(startDate, clamp(weeks, 1, 6), clamp(postsPerWeek, 1, 5), chosen);
        if (slots.length === 0) return { ok: false, error: 'No posting slots in the chosen timeline.' };

        // Voice segregation: company page (third person, product/industry) vs
        // founder (first person, personal). Mix asks the model to label each post.
        const VOICE_RULES = {
            company: 'VOICE: Write in THIRD PERSON as the COMPANY/brand. Focus on industry insights, product features, and customer outcomes. Do NOT use "I/my" or personal anecdotes. Set "voice" to "company" on every post.',
            founder: 'VOICE: Write in FIRST PERSON as the FOUNDER. Personal POV, lessons, opinions, and stories - signal over hustle. Set "voice" to "founder" on every post.',
            mix: 'VOICE: Produce a MIX - roughly half COMPANY posts (third person, product/industry, no "I") and half FOUNDER posts (first person, personal). Set each post\'s "voice" field to "company" or "founder" accordingly, and keep the two clearly distinct in tone.',
        };
        const voiceRule = VOICE_RULES[voice] ?? VOICE_RULES.company;

        const all = [];
        const errors = [];
        for (const group of chunk(slots, 6)) {
            const slotBlock = group.map((s, i) => `${i}. ${SOCIAL_PLATFORM_SPECS[s.platform].label} on ${s.date}`).join('\n');
            const prompt = `${ctx.prompt}

${topic ? `Overall theme for the month: ${topic}\n` : ''}${voiceRule}

Write ONE native social post for EACH scheduled slot below. Rotate the ANGLE across posts for variety (use a different one each time from: ${ANGLE_POOL.join(', ')}). Each post stands alone and is native to its platform.

Slots:
${slotBlock}

Platform rules:
${chosen.map((p) => `- ${SOCIAL_PLATFORM_SPECS[p].label}: ${SOCIAL_PLATFORM_SPECS[p].guidance}`).join('\n')}

Return JSON only:
{"posts":[{"slotIndex":0,"voice":"company | founder","angle":"the angle used","hook":"first line","body":"full post","hashtags":["..."],"cta":"one CTA"}]}`;

            let content;
            try {
                content = await runJson(prompt, baseSystem(), 6000);
            } catch (err) {
                errors.push(err.message);
                continue;
            }
            for (const p of (Array.isArray(content.posts) ? content.posts : [])) {
                const slot = group[p?.slotIndex];
                const body = str(p?.body, 6000);
                if (!slot || !body) continue;
                all.push({
                    date: slot.date,
                    platform: slot.platform,
                    voice: voice === 'mix' ? (['company', 'founder'].includes(p?.voice) ? p.voice : 'company') : voice,
                    angle: str(p?.angle, 60),
                    hook: str(p?.hook, 400),
                    body,
                    hashtags: arr(p?.hashtags),
                    cta: str(p?.cta, 200),
                    validation: validateForPlatform(body, slot.platform),
                });
            }
        }

        if (all.length === 0) {
            return { ok: false, error: `Calendar generation returned no posts.${errors.length ? ` (${errors[0]})` : ''}` };
        }
        all.sort((a, b) => a.date.localeCompare(b.date));
        return { ok: true, posts: all, partial: all.length < slots.length };
    },

    /** Carousel slide content (the on-brand HTML render happens in the UI). */
    generateCarousel: async (workspaceId, { topic = '', slideCount = 6 } = {}) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };
        let ctx;
        try { ctx = await loadContext(workspaceId); } catch (err) { return { ok: false, error: err.message }; }

        const n = Math.max(4, Math.min(8, slideCount));
        const prompt = `${ctx.prompt}

Topic / angle: ${topic || 'pick the strongest educational angle from the brand context'}

Create a ${n}-slide social carousel. Slide 1 is a scroll-stopping cover (big hook), the middle slides each make ONE point (short heading + 1-2 tight sentences), and the last slide is a CTA. Keep each slide's body under ~160 characters so it fits a square slide.

Return JSON only:
{"title":"carousel title","caption":"the post caption to accompany the carousel","hashtags":["..."],
 "slides":[{"heading":"slide heading","body":"slide body (<=160 chars)","kind":"cover | point | cta"}]}`;

        let content;
        try { content = await runJson(prompt, baseSystem(), 2400); } catch (err) { return { ok: false, error: `Carousel generation failed: ${err.message}` }; }

        const slides = (Array.isArray(content.slides) ? content.slides : [])
            .map((s, i) => ({
                heading: str(s?.heading, 200),
                body: str(s?.body, 400),
                kind: ['cover', 'point', 'cta'].includes(s?.kind) ? s.kind : (i === 0 ? 'cover' : 'point'),
            }))
            .filter((s) => s.heading || s.body);
        if (slides.length === 0) return { ok: false, error: 'No slides returned. Try a clearer topic.' };
        return {
            ok: true,
            carousel: {
                title: str(content.title, 200),
                caption: str(content.caption, 2200),
                hashtags: arr(content.hashtags),
                slides,
            },
        };
    },
};

export default socialService;
