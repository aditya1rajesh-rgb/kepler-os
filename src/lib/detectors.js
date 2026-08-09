// Scheduled detectors (E7, roadmap NEXT) — what changed, and by how much.
//
// Kepler already runs jobs that look at the world (page teardowns, AI-visibility
// scans, Search Console analyses) and throws every run away. The roadmap files
// that under entropy: "stateless jobs discard every run". A detector is the same
// look, kept, and compared against the last one — which is the only way to say
// what CHANGED rather than what IS.
//
// The output lands on the cockpit's goal hero as "what moved", never as a
// standalone activity feed: movement you cannot act on is filler, and the same
// movement attached to a target is direction.
//
// WHY THIS FILE IS MOSTLY REFUSALS. A detector's failure mode is not missing a
// change, it is announcing one that did not happen. Three sessions from now
// nobody will remember whether "+45% replies" was real, and a screen that cries
// wolf costs more trust than an empty one. So:
//
//   * ONE READING IS NEVER A CHANGE. No prior, no event — never "+100%, new".
//   * SMALL NUMBERS DO NOT GET PERCENTAGES. 2 replies becoming 3 is +50% and
//     means nothing; every detector carries an absolute floor as well as a
//     relative one, and both must clear.
//   * A LEVEL IS NOT A GAIN. campaign_metrics rows are trailing windows (GA4 =
//     last 28 days), so a difference between two readings is a change in the
//     trailing average. Every event says which two readings it compared and the
//     wording never implies a period total. Same fact goalFeasibility.js and
//     funnelSnapshot.js are built on.
//   * SILENCE IS A RESULT. Nothing moved is a legitimate, common answer.

import { MEASURES } from './goalFeasibility';

/**
 * Floors per kind: an event must clear BOTH the absolute and the relative bar.
 * These are deliberately blunt. A tunable threshold nobody tunes is a constant
 * with extra steps, and a threshold that fires on noise trains people to ignore
 * the surface entirely.
 */
export const FLOORS = {
    metric: { abs: 20, pct: 0.05 },
    // Search positions are absolute places, not percentages; impressions gate it.
    search: { positions: 1.5, impressions: 50 },
    // Visibility is boolean per prompt — one prompt gained or lost is real.
    visibility: { prompts: 1 },
    outreach: { abs: 3, pct: 0.15 },
};

/** How many events a single run may emit per kind, most significant first. */
export const MAX_PER_KIND = 5;

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const pctChange = (from, to) => {
    const a = num(from);
    const b = num(to);
    // A percentage against a zero base is infinite, not "+100%". The event still
    // stands on its absolute magnitude; the pct is simply unknown.
    if (a === null || b === null || a === 0) return null;
    return Math.round(((b - a) / Math.abs(a)) * 1000) / 10;
};

const clean = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * A detected change. `dedupeKey` is what makes a re-run a no-op rather than a
 * duplicate row — the same comparison detected twice is one event.
 */
const event = ({
    kind, subject, direction, magnitude, pct = null, unit = '',
    from = null, to = null, observedAt, comparedTo = null, campaignId = null, evidence = {},
    // What makes this event THIS event, when the display subject is not enough
    // on its own — the same prompt moving on two answer engines is two changes.
    identity = null,
}) => ({
    kind,
    subject: clean(subject),
    direction,
    magnitude: Math.abs(Math.round(magnitude * 100) / 100),
    pct,
    unit,
    from,
    to,
    observedAt,
    // The reading this was measured AGAINST. Without it "up 12%" is unfalsifiable.
    comparedTo,
    campaignId,
    evidence,
    // The campaign is part of the identity. Without it, "Sessions" detected
    // workspace-wide and "Sessions" detected on a campaign share a key at the
    // same instant, and the unique index silently keeps one of them — which is
    // how a real movement disappears without any error anywhere.
    dedupeKey: `${kind}|${campaignId ?? 'workspace'}|${clean(identity ?? subject, 140)}|${observedAt}|${comparedTo ?? ''}`,
});

// ── Metric movement (campaign_metrics readings) ──────────────────────────────

/**
 * Movement in one measure between the last two READINGS.
 *
 * @param readings [{ at, value, campaignId? }] oldest first — the shape
 *        funnelSnapshot.readingSeries produces
 * @param opts.measure a MEASURES id, for the unit and the label
 */
export const detectMetricMoves = (readings = [], { measure = 'sessions', campaignId = null } = {}) => {
    const usable = (readings ?? [])
        .map((r) => ({ at: r?.at ?? r?.capturedAt ?? null, value: num(r?.value) }))
        .filter((r) => r.at && r.value !== null);
    // One reading is a level, not a movement.
    if (usable.length < 2) return [];

    const latest = usable[usable.length - 1];
    const prior = usable[usable.length - 2];
    const delta = latest.value - prior.value;
    const pct = pctChange(prior.value, latest.value);

    const floor = FLOORS.metric;
    if (Math.abs(delta) < floor.abs) return [];
    if (pct !== null && Math.abs(pct) < floor.pct * 100) return [];

    const m = MEASURES[measure];
    return [event({
        kind: 'metric',
        subject: m?.label ?? measure,
        direction: delta > 0 ? 'up' : 'down',
        magnitude: delta,
        pct,
        unit: m?.unit ?? '',
        from: prior.value,
        to: latest.value,
        observedAt: latest.at,
        comparedTo: prior.at,
        campaignId,
        evidence: { measure, basis: 'trailing-level' },
    })];
};

// ── Search movement (Search Console, query level) ────────────────────────────

/**
 * The two window ends a search comparison is between.
 *
 * Stamping "now" here instead looks harmless and quietly breaks dedupe: the key
 * carries the timestamp, so pressing "check for changes" twice in a minute
 * writes the same ranking move twice with two different keys. The comparison is
 * a property of the WINDOW, not of the moment somebody asked, so the window ends
 * are what the event is stamped with — and they only move once a day.
 *
 * The 3-day offset is Search Console's own reporting lag, not a safety margin.
 */
export const searchWindows = ({ now = new Date(), days = 28, lagDays = 3 } = {}) => {
    const endOfDay = (d) => `${new Date(d).toISOString().slice(0, 10)}T00:00:00.000Z`;
    const currentEnd = new Date(now.getTime() - lagDays * 86400000);
    return {
        observedAt: endOfDay(currentEnd),
        comparedTo: endOfDay(new Date(currentEnd.getTime() - days * 86400000)),
    };
};

/**
 * Queries whose average position moved, comparing two GSC pulls.
 *
 * THE INVERSION. In Search Console a LOWER position number is better: 12 → 4 is
 * a gain. Writing this the obvious way produces a detector that reports every
 * improvement as a decline, and the sentence reads perfectly either way.
 */
export const detectSearchMoves = (current = [], prior = [], { limit = MAX_PER_KIND, observedAt = null, comparedTo = null } = {}) => {
    const priorByQuery = new Map();
    for (const r of prior ?? []) {
        const q = clean(r?.query ?? r?.title, 120);
        if (q) priorByQuery.set(q.toLowerCase(), r);
    }

    const out = [];
    for (const r of current ?? []) {
        const q = clean(r?.query ?? r?.title, 120);
        if (!q) continue;
        const was = priorByQuery.get(q.toLowerCase());
        if (!was) continue; // no prior reading for this query — not a change

        const nowPos = num(r.position);
        const wasPos = num(was.position);
        const impressions = num(r.impressions) ?? 0;
        if (nowPos === null || wasPos === null) continue;
        if (impressions < FLOORS.search.impressions) continue;

        const move = wasPos - nowPos; // positive = climbed
        if (Math.abs(move) < FLOORS.search.positions) continue;

        out.push(event({
            kind: 'search',
            subject: q,
            direction: move > 0 ? 'up' : 'down',
            magnitude: move,
            pct: null,
            unit: 'positions',
            from: wasPos,
            to: nowPos,
            observedAt,
            comparedTo,
            evidence: {
                impressions,
                clicks: num(r.clicks),
                // Crossing onto page one is the change worth naming, so it is
                // recorded rather than left for the reader to infer.
                enteredPageOne: wasPos > 10 && nowPos <= 10,
                leftPageOne: wasPos <= 10 && nowPos > 10,
            },
        }));
    }

    return out
        .sort((a, b) => (b.evidence.impressions ?? 0) * b.magnitude - (a.evidence.impressions ?? 0) * a.magnitude)
        .slice(0, limit);
};

// ── AI visibility movement (visibility_scans, prompt level) ──────────────────

/**
 * Prompts where the brand gained or lost a mention/citation between two scans.
 *
 * A loss matters at least as much as a gain — being dropped from an answer that
 * used to cite you is the single most actionable fact this surface produces, and
 * a detector that only reports good news is a marketing feature.
 */
export const detectVisibilityMoves = (currentRows = [], priorRows = [], { limit = MAX_PER_KIND, observedAt = null, comparedTo = null } = {}) => {
    const key = (r) => `${clean(r?.prompt, 160).toLowerCase()}|${clean(r?.surface, 40)}`;
    const priorByKey = new Map();
    for (const r of priorRows ?? []) {
        if (r?.status && r.status !== 'ok') continue;
        priorByKey.set(key(r), r);
    }

    const out = [];
    for (const r of currentRows ?? []) {
        if (r?.status && r.status !== 'ok') continue;
        const was = priorByKey.get(key(r));
        if (!was) continue;

        const gainedCite = Boolean(r.brandCited ?? r.brand_cited) && !(was.brandCited ?? was.brand_cited);
        const lostCite = !(r.brandCited ?? r.brand_cited) && Boolean(was.brandCited ?? was.brand_cited);
        const gainedMention = Boolean(r.brandMentioned ?? r.brand_mentioned) && !(was.brandMentioned ?? was.brand_mentioned);
        const lostMention = !(r.brandMentioned ?? r.brand_mentioned) && Boolean(was.brandMentioned ?? was.brand_mentioned);

        // A citation change outranks a mention change on the same prompt: one
        // event per prompt, describing the strongest thing that happened.
        let change = null;
        if (gainedCite) change = { direction: 'up', what: 'cited' };
        else if (lostCite) change = { direction: 'down', what: 'cited' };
        else if (gainedMention) change = { direction: 'up', what: 'mentioned' };
        else if (lostMention) change = { direction: 'down', what: 'mentioned' };
        if (!change) continue;

        out.push(event({
            kind: 'visibility',
            subject: clean(r.prompt, 160),
            // Prompt AND surface: "cited on Perplexity" and "cited on OpenAI"
            // are two different facts about the same question.
            identity: `${clean(r.prompt, 120)}@${clean(r.surface, 40)}`,
            direction: change.direction,
            magnitude: 1,
            unit: change.what,
            observedAt: observedAt ?? r.capturedAt ?? r.captured_at ?? null,
            comparedTo,
            evidence: {
                surface: clean(r.surface, 40),
                what: change.what,
                competitors: (r.competitorMentions ?? r.competitor_mentions ?? [])
                    .filter((c) => c?.mentioned)
                    .map((c) => clean(c.name, 60))
                    .slice(0, 4),
            },
        }));
    }

    // Losses first: they are the ones that need somebody.
    return out
        .sort((a, b) => (a.direction === b.direction ? 0 : a.direction === 'down' ? -1 : 1))
        .slice(0, limit);
};

// ── Outreach movement ────────────────────────────────────────────────────────

/** Replies and meetings, from the outreach snapshots. Same two-reading rule. */
export const detectOutreachMoves = (readings = [], { metric = 'replied' } = {}) => {
    const usable = (readings ?? [])
        .map((r) => ({ at: r?.at ?? r?.capturedAt ?? null, value: num(r?.value) }))
        .filter((r) => r.at && r.value !== null);
    if (usable.length < 2) return [];

    const latest = usable[usable.length - 1];
    const prior = usable[usable.length - 2];
    const delta = latest.value - prior.value;
    const pct = pctChange(prior.value, latest.value);

    if (Math.abs(delta) < FLOORS.outreach.abs) return [];
    if (pct !== null && Math.abs(pct) < FLOORS.outreach.pct * 100) return [];

    return [event({
        kind: 'outreach',
        subject: metric === 'meetings' ? 'Meetings' : 'Replies',
        direction: delta > 0 ? 'up' : 'down',
        magnitude: delta,
        pct,
        unit: metric,
        from: prior.value,
        to: latest.value,
        observedAt: latest.at,
        comparedTo: prior.at,
        evidence: { metric },
    })];
};

// ── Reading the events back ──────────────────────────────────────────────────

/** Significance for display: the metric that moved most, then search, then the rest. */
const KIND_WEIGHT = { metric: 4, search: 3, visibility: 2, outreach: 2 };

export const rankEvents = (events = []) => [...events].sort((a, b) => {
    const w = (KIND_WEIGHT[b.kind] ?? 1) - (KIND_WEIGHT[a.kind] ?? 1);
    if (w !== 0) return w;
    const pa = Math.abs(a.pct ?? 0);
    const pb = Math.abs(b.pct ?? 0);
    return pb - pa || b.magnitude - a.magnitude;
});

/**
 * One sentence for the goal hero: what moved on this goal's measure, and what
 * plausibly contributed.
 *
 * "Contributed" is doing careful work here. Kepler observes that ranking gains
 * and a traffic rise happened in the same window; it has not established cause,
 * and the wording must not claim it did. Correlation stated as correlation is
 * useful; correlation stated as cause is the thing every analytics vendor does
 * and cannot defend.
 */
export const summariseMovement = (events = [], { measure = 'sessions' } = {}) => {
    const ranked = rankEvents(events);
    // The headline sits under a GOAL heading, so it must be the account-level
    // move on the goal's measure. A campaign-scoped event carries a smaller
    // number for the same words ("Sessions rose to 2,295" when the account read
    // 8,136), and nothing on the line would tell the reader which one it is.
    // Campaign-scoped moves stay in the event list; they do not headline.
    // ONLY the goal's own measure headlines. Falling back to whatever metric
    // moved most put "Revenue rose 5.1%" as the headline of a SESSIONS goal —
    // true, and read by everyone as the goal moving. Other measures are still
    // reported; they are contributors, where the subject names itself.
    const headline = ranked.find((e) => e.kind === 'metric' && !e.campaignId && e.evidence?.measure === measure) ?? null;
    const contributors = ranked.filter((e) => e !== headline && !e.campaignId).slice(0, 3);

    if (!headline && contributors.length === 0) return null;

    return {
        headline,
        contributors,
        // Only claim alignment when the supporting movement points the same way.
        aligned: Boolean(headline) && contributors.some((c) => c.direction === headline.direction),
    };
};

export default detectMetricMoves;
