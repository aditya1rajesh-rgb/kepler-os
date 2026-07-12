// Social specs + frameworks, ported from the LinkedIn (#27) and voice-first (#28)
// skills. The model fills copy into these proven structures; code validates
// length. X/Instagram specs are authored here (the source packs are LinkedIn-only).

// Per-platform format + length rules. charLimit is the in-feed/recommended cap
// validated in code (the model miscounts).
export const SOCIAL_PLATFORM_SPECS = {
    linkedin: {
        label: 'LinkedIn',
        charLimit: 1300,            // 900-1300 sweet spot
        hookLimit: 210,             // hook must land before "…see more"
        guidance: 'Hook in first 210 chars (write for the 140-char mobile line). 900-1300 chars. Double line-breaks between ideas. 0-2 hashtags at the end. No links in the body.',
    },
    x: {
        label: 'X / Twitter',
        charLimit: 280,
        guidance: 'Single post ≤280 chars, or a thread of 3-6 tweets. Punchy, one idea, no hashtag spam (0-1).',
    },
    instagram: {
        label: 'Instagram',
        charLimit: 2200,
        guidance: 'Caption: strong first line (shows before "more"), scannable, 3-8 relevant hashtags at the end, one clear CTA.',
    },
    facebook: {
        label: 'Facebook',
        charLimit: 600,             // engagement drops sharply past ~500-600 chars
        guidance: 'Conversational and concrete; first 2 lines carry the idea (rest folds behind "See more"). One clear CTA or question. 0-2 hashtags, links fine.',
    },
};

export const SOCIAL_PLATFORMS = Object.keys(SOCIAL_PLATFORM_SPECS);

// Condensed high-value subset of the LinkedIn hook formulas (from the 16),
// tagged with the engagement goal they best serve.
export const LINKEDIN_HOOK_FORMULAS = [
    { id: 'how_i', name: 'How I (first-person result)', skeleton: '"How I [achieved specific result]" - lead with a concrete number and the real method.', goals: ['saves', 'likes'] },
    { id: 'confession', name: 'Time-anchor confession', skeleton: '"{N} months ago I stopped [behavior]. Here\'s what happened." Backstory → quiet cost → change → surprising upside → mirror question.', goals: ['comments'] },
    { id: 'contrarian', name: 'Contrarian + receipts', skeleton: 'State the common belief, then dismantle it with dated, specific receipts; close with a binary identity line.', goals: ['comments', 'reposts'] },
    { id: 'ledger', name: 'Odd-precision ledger', skeleton: 'An oddly specific number ("$873.47"), then every line item unrounded; what it replaces; identity reframe close.', goals: ['saves'] },
    { id: 'curiosity_gap', name: 'Curiosity gap', skeleton: 'Open a specific loop the reader must keep reading to close; pay it off concretely.', goals: ['comments', 'likes'] },
    { id: 'failure', name: 'Real failure first', skeleton: 'Lead with what broke in the first 3 lines (8.5x outperforms polished framing), then the lesson.', goals: ['comments', 'reposts'] },
    { id: 'explain_simply', name: 'Explain to a 5-year-old', skeleton: 'Take a complex idea and explain it in the simplest possible terms; end with the grown-up implication.', goals: ['saves', 'likes'] },
    { id: 'named_gratitude', name: 'Named gratitude', skeleton: 'Specifically thank a named person/team for a concrete thing they did; generous and repost-friendly.', goals: ['reposts', 'likes'] },
];

// Pick-by-goal: which formula ids fit each engagement goal.
export const LINKEDIN_GOALS = {
    comments: ['confession', 'contrarian', 'curiosity_gap', 'failure'],
    reposts: ['named_gratitude', 'contrarian', 'failure'],
    likes: ['how_i', 'curiosity_gap', 'explain_simply', 'named_gratitude'],
    saves: ['explain_simply', 'ledger', 'how_i'],
};

// Founder / personal-brand content pillars (the founder-voice mix).
export const FOUNDER_PILLARS = {
    authority: { label: 'Authority', desc: 'Frameworks, teardowns, named systems, hard-won expertise.' },
    narrative: { label: 'Personal narrative', desc: 'Vulnerable, first-person story. Trust compounds on vulnerability.' },
    community: { label: 'Community', desc: 'Celebrate others, spark discussion, give credit.' },
};

// Narrative types for the personal-narrative pillar (rotate; no repeat within 2 weeks).
export const FOUNDER_NARRATIVE_TYPES = [
    { id: 'painful_lesson', label: 'Painful lesson' },
    { id: 'client_breakthrough', label: 'Client breakthrough' },
    { id: 'contrarian_opinion', label: 'Contrarian opinion' },
    { id: 'behind_the_scenes', label: 'Behind the scenes' },
    { id: 'perspective_shift', label: 'Perspective shift ("I used to believe X…")' },
];

// Copy frameworks (voice-first pack).
export const SOCIAL_FRAMEWORKS = ['PAS', 'AIDA', 'BAB', 'STAR'];

// Shared social anti-slop rules. The "absence signals" idea: define voice by
// what it never does. Reused across post/linkedin/founder prompts.
export const SOCIAL_ANTI_SLOP = `VOICE & ANTI-SLOP RULES:
- NEVER use em dashes. NEVER use AI vocabulary: leverage, fundamentally, streamline, harness, delve, unlock, foster, seamless, robust, "in today's fast-paced world", "game-changer", "deep dive".
- First-person and specific. "How I" beats "How to". A specific number in the first sentence beats a vague claim ("47%" beats "significant").
- Vary sentence length aggressively - drop a hard 3-5 word line after a long one. One genuine, defensible opinion per post.
- At least one specific number, one named entity, and one first-person concrete detail per ~100 words.
- NEVER fabricate metrics, customer names, or results - if a number is missing, write qualitatively or leave a {{token}}; do not invent it.`;
