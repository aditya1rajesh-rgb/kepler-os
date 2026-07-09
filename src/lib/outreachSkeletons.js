// Canonical outreach skeletons. The biggest quality lever from the cold-outreach
// (#20) and email-marketing-bible (#22) skills: DON'T let the model invent
// sequence structure - give it a proven skeleton (touch count, cadence, per-step
// framework/goal/channel) and have it only fill copy. These structures are
// ported verbatim from those skills' recipes.

// ─── Cold outreach (prospecting) - Hormozi 5-touch blueprint ──────────────────
// Channel rotation email → LinkedIn → email → email/SMS → email; spaced 3-5 days.
const COLD_BLUEPRINT = [
    { channel: 'email', dayOffset: 0, framework: 'PAS', purpose: 'Problem-aware opener - lead with their world, soft ask' },
    { channel: 'linkedin', dayOffset: 3, framework: 'connect', purpose: 'Connect + reference their content/company (no pitch)' },
    { channel: 'email', dayOffset: 5, framework: 'value_add', purpose: 'Share a genuine insight or relevant case study' },
    { channel: 'email', dayOffset: 10, framework: 'one_liner', purpose: 'Brief one-liner nudge: observation + result + soft ask' },
    { channel: 'email', dayOffset: 14, framework: 'breakup', purpose: 'Graceful breakup - close the loop, leave the door open' },
];

// Build a cold skeleton for N touches (3-5), honoring selected channels. Any step
// whose channel isn't selected falls back to email so the cadence stays intact.
export const buildColdSkeleton = (touchCount = 5, channels = ['email']) => {
    const n = Math.max(3, Math.min(5, touchCount));
    return COLD_BLUEPRINT.slice(0, n).map((step, i) => ({
        stepNumber: i + 1,
        channel: channels.includes(step.channel) ? step.channel : 'email',
        dayOffset: step.dayOffset,
        framework: step.framework,
        purpose: step.purpose,
    }));
};

// ─── Lifecycle flows (#22 + emails skill) ─────────────────────────────────────
// Each entry: per-email order, delay (human label), and the ONE goal of that email.
export const LIFECYCLE_FLOWS = {
    welcome: {
        label: 'Welcome',
        trigger: 'New signup / subscribe',
        goal: 'Activate the new contact and set expectations',
        emails: [
            { order: 1, delay: 'Immediate', goal: 'Deliver the promised value + one segmenting question' },
            { order: 2, delay: 'Day 1-2', goal: 'A quick win they can get right now' },
            { order: 3, delay: 'Day 3-4', goal: 'Brand story / why we exist' },
            { order: 4, delay: 'Day 5-6', goal: 'Social proof (use what the brand actually has)' },
            { order: 5, delay: 'Day 7-8', goal: 'Overcome the main objection + soft offer' },
        ],
    },
    nurture: {
        label: 'Lead nurture',
        trigger: 'Lead magnet / opt-in',
        goal: 'Build trust and move toward a first conversion',
        emails: [
            { order: 1, delay: 'Immediate', goal: 'Deliver the lead magnet + quick intro' },
            { order: 2, delay: 'Day 2-3', goal: 'Expand on the topic they opted in for' },
            { order: 3, delay: 'Day 4-5', goal: 'Deep-dive the core problem' },
            { order: 4, delay: 'Day 6-8', goal: 'Present the solution framework' },
            { order: 5, delay: 'Day 9-11', goal: 'Case study / proof (real only)' },
            { order: 6, delay: 'Day 12-14', goal: 'Direct but low-pressure offer' },
        ],
    },
    winback: {
        label: 'Win-back',
        trigger: '60-90 days inactive',
        goal: 'Re-activate a lapsed contact or cleanly part ways',
        emails: [
            { order: 1, delay: 'Day 0', goal: '"We miss you" - genuine check-in, no hard sell' },
            { order: 2, delay: 'Day 4-5', goal: 'Remind them of the core value / what is new' },
            { order: 3, delay: 'Day 9-10', goal: 'A real incentive (only if the brand offers one)' },
            { order: 4, delay: 'Day 14', goal: 'Breakup - stay or unsubscribe, highest reply rate' },
        ],
    },
    reengagement: {
        label: 'Re-engagement',
        trigger: '30-60 days inactive',
        goal: 'Bring a quiet contact back to engaged',
        emails: [
            { order: 1, delay: 'Day 0', goal: 'Genuine "still useful?" check-in' },
            { order: 2, delay: 'Day 5', goal: 'Value reminder - what they are missing' },
            { order: 3, delay: 'Day 12', goal: 'Last-chance: confirm interest or sunset' },
        ],
    },
    dunning: {
        label: 'Payment recovery (dunning)',
        trigger: 'Payment failed',
        goal: 'Recover a failed payment without churning the customer',
        emails: [
            { order: 1, delay: 'Day 0', goal: 'Friendly heads-up - card did not go through' },
            { order: 2, delay: 'Day 3', goal: 'Reminder + how to update payment' },
            { order: 3, delay: 'Day 7', goal: 'Urgency - access at risk' },
            { order: 4, delay: 'Day 10', goal: 'Final notice before pause/cancel' },
        ],
    },
};

export const LIFECYCLE_FLOW_TYPES = Object.keys(LIFECYCLE_FLOWS);

export const OUTREACH_CHANNELS = ['email', 'linkedin', 'sms'];
