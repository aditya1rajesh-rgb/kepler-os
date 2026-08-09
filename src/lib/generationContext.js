// Goal-grounded generation context (E3, roadmap S4).
//
// Generation used to read the brand profile and nothing else, so every asset was
// an orphan: correct about who the company is, ignorant of what the company is
// currently trying to achieve. E2 built the rung above (goal → campaign →
// asset); E3 makes generation actually READ it. This module renders that ladder
// into prompt text.
//
// Four legs, in descending order of authority over the output:
//   GOAL     — what success means, and where it currently stands
//   CAMPAIGN — the angle, the channel mix, this asset's place in the plan
//   PRIOR    — what already exists under it, so a new asset complements
//              rather than duplicates
//   SIGNALS  — live Search Console + AI answer-engine evidence about demand
//
// EVERYTHING HERE IS PURE. The service assembles the data; this file decides
// what may be said about it. That split matters because the honesty rules are
// the risky part and they are the part worth testing.
//
// THE HONESTY RULES, which are the same ones goalFeasibility.js guards:
//   * No goal → no GOAL block. Never a generic "grow the business" stand-in.
//     An invented goal would ground the copy in a fiction and read as grounded.
//   * verdict 'unknown' → say the standing is unknown and forbid progress
//     claims. A model handed a target and no standing will happily write "we're
//     well on our way".
//   * A target is an INTENT and may always be stated; achieved/forecast are
//     CLAIMS and appear only when the projection actually produced them.

/** Hard caps. The ai-proxy ceiling is 60K chars and brand context already
 *  budgets 20K for source files, so the ladder gets a deliberately small slice —
 *  it is the framing, not the material. */
export const LADDER_BUDGET = 6000;
export const MAX_PRIOR_ASSETS = 12;
export const MAX_SEARCH_SIGNALS = 6;
export const MAX_AEO_GAPS = 5;

const VERDICT_LABEL = {
    'on-track': 'On track',
    'at-risk': 'At risk',
    'off-pace': 'Behind',
};

const STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'best', 'but', 'by', 'for', 'from',
    'how', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'top', 'vs',
    'was', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
]);

const clean = (v, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const fmt = (n) => (n === null || n === undefined || !Number.isFinite(Number(n))
    ? null
    : Math.round(Number(n)).toLocaleString('en-US'));

/** Content words of a phrase, lowercased and de-duplicated. */
export const topicTokens = (text) => {
    const tokens = String(text ?? '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2 && !STOPWORDS.has(t));
    return new Set(tokens);
};

/**
 * Order candidates by how much they share with the topic, keeping input order
 * for ties so the caller's own ranking (impact, recency) still decides between
 * equally-relevant items. Zero-overlap items are kept — they fill the tail when
 * nothing matches, which is the common case for a brand-new topic — but they
 * always sort below anything that does match.
 */
export const rankByRelevance = (items = [], topic = '', textOf = (x) => x, limit = Infinity) => {
    const wanted = topicTokens(topic);
    if (!items.length) return [];
    return items
        .map((item, index) => {
            const tokens = topicTokens(textOf(item));
            let overlap = 0;
            for (const t of tokens) if (wanted.has(t)) overlap += 1;
            return { item, index, overlap };
        })
        .sort((a, b) => (b.overlap - a.overlap) || (a.index - b.index))
        .slice(0, limit)
        .map((r) => r.item);
};

// ── The four blocks ──────────────────────────────────────────────────────────

/**
 * What the asset must ladder to.
 *
 * @param goal       mapped goal row (goalsService.mapGoal shape) or null
 * @param projection goalsService.projectionFor result, or null for directional
 *                   goals and for measured goals with nothing to project
 * @param checkpoints open checkpoints, for directional goals (they have no math)
 */
export const renderGoalBlock = (goal, projection = null, checkpoints = []) => {
    if (!goal?.name) return '';

    const lines = [`GOAL — everything in this asset must serve this:`];
    lines.push(`"${clean(goal.name, 200)}"${goal.endDate ? `, by ${goal.endDate}` : ''}.`);
    if (goal.description) lines.push(clean(goal.description, 600));

    if (goal.kind === 'measured' && goal.measure) {
        const target = fmt(goal.target);
        // The target is an intention the user typed. Always safe to state.
        if (target) lines.push(`Target: ${target} ${goal.measure}.`);

        const verdict = projection?.verdict ?? 'unknown';
        if (verdict === 'unknown' || projection?.achieved === null || projection?.achieved === undefined) {
            // The critical guard. Silence here would let the model fill the gap.
            lines.push('Standing: not enough measured data yet to say where this goal stands.'
                + ' Do NOT claim progress, momentum or results anywhere in the output,'
                + ' and do NOT cite any performance number.');
        } else {
            const achieved = fmt(projection.achieved);
            const pct = projection.progress === null || projection.progress === undefined
                ? null
                : Math.round(projection.progress * 100);
            lines.push(`Standing: ${VERDICT_LABEL[verdict] ?? 'Unknown'}`
                + `${achieved && target ? ` — ${achieved} of ${target}` : ''}`
                + `${pct === null ? '' : ` (${pct}%)`}`
                + `${projection.daysRemaining === null || projection.daysRemaining === undefined ? '' : `, ${projection.daysRemaining} days left`}.`);
            // Estimated from trailing levels — say so, so the model does not
            // quote it as a measured fact in the copy.
            lines.push('That standing is an internal estimate for your framing only.'
                + ' Never state it, or any figure derived from it, in the output.');
            if (verdict === 'off-pace' || verdict === 'at-risk') {
                lines.push('This goal is behind pace, so favour angles that compound quickly'
                    + ' over ones that pay off in a year.');
            }
        }
    } else {
        lines.push('This goal is directional — judged by whether the work happened and'
            + ' changed the conversation, not by a number.');
        const open = (checkpoints ?? []).filter((c) => !c.doneAt).slice(0, 6);
        if (open.length) {
            lines.push(`Open checkpoints: ${open.map((c) => clean(c.label, 120)).join('; ')}.`);
        }
    }

    return lines.join('\n');
};

/** Where the asset sits in the plan. */
export const renderCampaignBlock = (campaign, stepId = '') => {
    if (!campaign?.id) return '';

    const plan = campaign.plan ?? {};
    const lines = [`CAMPAIGN — the angle this asset belongs to:`];
    lines.push(`"${clean(campaign.title, 200)}"`
        + `${campaign.campaignType ? ` (${campaign.campaignType}` : ''}`
        + `${campaign.campaignType && campaign.status ? `, ${campaign.status}` : ''}`
        + `${campaign.campaignType ? ')' : ''}.`);

    // `campaigns.goal` is the LEGACY free-text column, not the goals row — the
    // campaign's own statement of intent. Worth saying, and worth saying under
    // the campaign heading so it is never mistaken for the goal above.
    const intent = clean(campaign.goal ?? plan.goal ?? '', 400);
    if (intent) lines.push(`What this campaign is for: ${intent}`);

    const summary = clean(plan.strategySummary ?? plan.strategy ?? '', 800);
    if (summary) lines.push(`Strategy: ${summary}`);

    const mix = Array.isArray(plan.channelMix) ? plan.channelMix : [];
    if (mix.length) {
        lines.push(`Channel mix: ${mix.map((c) => clean(typeof c === 'string' ? c : c?.channel ?? '', 40)).filter(Boolean).join(', ')}.`);
    }

    const steps = Array.isArray(plan.steps) ? plan.steps : [];
    const step = stepId ? steps.find((s) => String(s?.id) === String(stepId)) : null;
    if (step) {
        const position = steps.indexOf(step) + 1;
        lines.push(`This asset is step ${position} of ${steps.length}: "${clean(step.title ?? step.name, 200)}"`
            + `${step.description ? ` — ${clean(step.description, 400)}` : ''}`);
    }

    return lines.join('\n');
};

/**
 * What already exists beneath the same goal.
 *
 * Assets from the SAME campaign and from sibling campaigns are labelled
 * differently on purpose: repeating a sibling campaign's angle is a smaller sin
 * than repeating your own campaign's, and the model should weigh them that way.
 */
export const selectPriorAssets = (assets = []) => {
    const out = [];
    const seen = new Set();
    for (const a of assets ?? []) {
        const title = clean(a?.title || a?.targetKeyword, 160);
        if (!title) continue;
        const key = title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...a, title });
        if (out.length >= MAX_PRIOR_ASSETS) break;
    }
    return out;
};

export const renderPriorAssetsBlock = (assets = []) => {
    const selected = selectPriorAssets(assets);
    if (!selected.length) return '';

    const rows = selected.map((a) => `  - [${clean(a.type, 20) || 'asset'}] "${a.title}"`
        + `${a.targetKeyword && a.targetKeyword !== a.title ? ` (keyword: ${clean(a.targetKeyword, 80)})` : ''}`
        + `${a.scope === 'campaign' ? ' — same campaign' : ' — elsewhere under this goal'}`);

    // Deliberately NOT phrased "reference them by title:" — a line ending in
    // "Title:" collides with downstream prompt parsing that looks for the draft's
    // own `Title:` field, and the first match wins. Injected context has to avoid
    // the field labels the surrounding prompts use.
    return `ALREADY PRODUCED UNDER THIS GOAL (${rows.length}) — do not repeat these.`
        + ` Cover what they do not, and where a link would genuinely help the reader,`
        + ` reference them by name:\n${rows.join('\n')}`;
};

/**
 * Live evidence of demand: Search Console opportunities and answer-engine gaps.
 * Both are real observations about this account, which is what separates a
 * grounded brief from a plausible one.
 */
export const renderSignalsBlock = ({ searchOpportunities = [], aeoGaps = [] } = {}) => {
    const parts = [];

    const search = searchOpportunities
        .filter((o) => clean(o?.title, 120))
        .slice(0, MAX_SEARCH_SIGNALS)
        .map((o) => {
            const m = o?.metrics ?? {};
            const bits = [
                m.position === undefined || m.position === null ? null : `position ${Number(m.position).toFixed(1)}`,
                m.impressions ? `${fmt(m.impressions)} impressions` : null,
            ].filter(Boolean);
            return `  - "${clean(o.title, 120)}"${bits.length ? ` — ${bits.join(', ')}` : ''}`
                + `${o?.type ? ` (${String(o.type).replace(/_/g, ' ')})` : ''}`;
        });
    if (search.length) {
        parts.push('LIVE SEARCH DEMAND (Search Console, last 28 days — real queries this'
            + ` site already appears for). Use the exact language searchers use:\n${search.join('\n')}`);
    }

    const gaps = aeoGaps
        .filter((g) => clean(g?.prompt, 160))
        .slice(0, MAX_AEO_GAPS)
        .map((g) => `  - "${clean(g.prompt, 160)}"`
            + `${g?.surface ? ` (${clean(g.surface, 40)})` : ''}`
            + `${g?.competitors?.length ? ` — cited instead: ${g.competitors.slice(0, 4).map((c) => clean(c, 60)).join(', ')}` : ''}`);
    if (gaps.length) {
        parts.push('ANSWER-ENGINE GAPS — questions where AI engines cite competitors and'
            + ` not this brand. Answer them directly and completely enough to be quotable:\n${gaps.join('\n')}`);
    }

    return parts.join('\n\n');
};

// ── Composition ──────────────────────────────────────────────────────────────

// Sections are appended in authority order and each one is all-or-nothing: a
// half-rendered goal is worse than no goal, and truncating mid-list produces
// prompts that end on a dangling bullet.
const SECTION_ORDER = ['goal', 'campaign', 'prior', 'signals'];

const PRECEDENCE = 'When these conflict, the goal wins over the campaign, the campaign over'
    + ' prior assets, and prior assets over the search signals. Ground the piece in the material'
    + ' above; never invent a number, a customer, or a result that does not appear in it.';

/**
 * Assemble the ladder block and the provenance that goes with it.
 *
 * `groundedIn` is not decoration. It is what the UI shows the user so a claim of
 * grounding can be checked rather than trusted, and it is what gets persisted on
 * the generated asset. This codebase's recurring defect is data that is designed
 * and then never written; provenance is exactly the kind of thing that rots that
 * way, so it is returned from the same call that builds the prompt.
 *
 * @returns {{ text: string, groundedIn: Array<{kind:string,label:string}>, dropped: string[] }}
 */
export const buildLadderBlock = ({
    goal = null,
    projection = null,
    checkpoints = [],
    goalSource = null,
    campaign = null,
    stepId = '',
    priorAssets = [],
    searchOpportunities = [],
    aeoGaps = [],
    budget = LADDER_BUDGET,
} = {}) => {
    const sections = {
        goal: renderGoalBlock(goal, projection, checkpoints),
        campaign: renderCampaignBlock(campaign, stepId),
        prior: renderPriorAssetsBlock(priorAssets),
        signals: renderSignalsBlock({ searchOpportunities, aeoGaps }),
    };

    const kept = [];
    const dropped = [];
    let used = 0;
    for (const key of SECTION_ORDER) {
        const text = sections[key];
        if (!text) continue;
        if (used + text.length > budget) { dropped.push(key); continue; }
        kept.push(text);
        used += text.length;
    }

    if (!kept.length) return { text: '', groundedIn: [], dropped };

    const groundedIn = [];
    if (sections.goal && !dropped.includes('goal')) {
        groundedIn.push({
            kind: 'goal',
            label: clean(goal.name, 120),
            // How we arrived at this goal, so "grounded in your goal" can be
            // questioned when the goal was inferred rather than chosen.
            source: goalSource ?? 'explicit',
        });
    }
    if (sections.campaign && !dropped.includes('campaign')) {
        groundedIn.push({ kind: 'campaign', label: clean(campaign.title, 120) });
    }
    if (sections.prior && !dropped.includes('prior')) {
        const n = selectPriorAssets(priorAssets).length;
        groundedIn.push({ kind: 'priorAssets', label: `${n} prior asset${n === 1 ? '' : 's'}`, count: n });
    }
    if (sections.signals && !dropped.includes('signals')) {
        const s = Math.min(searchOpportunities.length, MAX_SEARCH_SIGNALS);
        const g = Math.min(aeoGaps.length, MAX_AEO_GAPS);
        groundedIn.push({
            kind: 'signals',
            label: [s ? `${s} search signal${s === 1 ? '' : 's'}` : '', g ? `${g} answer-engine gap${g === 1 ? '' : 's'}` : '']
                .filter(Boolean).join(', '),
            searchCount: s,
            gapCount: g,
        });
    }

    return {
        text: `\n\n${kept.join('\n\n')}\n\n${PRECEDENCE}\n`,
        groundedIn,
        dropped,
    };
};

export default buildLadderBlock;
