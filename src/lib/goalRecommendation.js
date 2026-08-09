// Continuous goal recommendation (E10, roadmap S1 + S2 zone 3).
//
// "Kepler re-reads the gap as data accrues and keeps proposing the portfolio
// that would close it — 2,400 sessions short with 6 weeks left; this campaign
// plausibly delivers ~1,500 at your current conversion rates."
//
// This is the return-driver: the goal actively asks for work rather than waiting
// to be visited. E5 built the zone and deliberately left it empty, because it
// would not rank work it had not measured. This is the measurement.
//
// THE NUMBER IS THE WHOLE RISK. "This campaign will deliver ~1,500 sessions" is
// the most confident sentence in the product, and it would be generated from a
// handful of trailing readings on two past campaigns. The roadmap's own guard —
// a confident number from thin data is worse than no number — applies harder
// here than anywhere else, so:
//
//   * EVERY ESTIMATE COMES FROM THE ACCOUNT'S OWN CAMPAIGNS. Never an industry
//     benchmark, never a model's guess. If this workspace has not run campaigns,
//     Kepler does not know what a campaign here delivers and says exactly that.
//   * TWO CAMPAIGNS IS NOT A SAMPLE. Below the floor there is no estimate at
//     all — the recommendation degrades to "start the work, we cannot size it
//     yet", which is still useful and is not a fabrication.
//   * THE WORKING IS RETURNED, NOT SUMMARISED. `workings` carries the sentences
//     that show how the number was reached, so it can be argued with. An
//     unauditable recommendation is a horoscope.
//   * TIME IS A CONSTRAINT, NOT A DETAIL. Proposing work that cannot land before
//     the goal resolves is worse than proposing nothing, so the window is
//     checked against how long past campaigns actually took to deliver.

import { MEASURES } from './goalFeasibility';

/** Below this many observed campaigns, Kepler will not size a contribution. */
export const MIN_SAMPLE = 3;

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const median = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const fmt = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat().format(Math.round(n)));

/**
 * What each past campaign actually delivered on this measure.
 *
 * @param campaigns [{ id, title, campaignType, plan, createdAt }]
 * @param snapshots latest per campaign: { [campaignId]: { metrics, capturedAt } }
 * @param measure the goal's measure
 * @returns [{ campaignId, title, value, days }] — only campaigns with a real
 *          reading and enough life to have produced it
 */
export const campaignYields = (campaigns = [], snapshots = {}, { measure = 'sessions', now = new Date(), minDays = 7 } = {}) => {
    const metricKey = MEASURES[measure]?.metricKey ?? measure;
    const out = [];
    for (const c of campaigns) {
        const value = num(snapshots?.[c.id]?.metrics?.[metricKey]);
        if (value === null || value <= 0) continue;
        const started = c.createdAt ? new Date(c.createdAt) : null;
        if (!started || Number.isNaN(started.getTime())) continue;
        const days = Math.round((now.getTime() - started.getTime()) / 86400000);
        // A campaign three days old has not delivered its level, it inherited a
        // window that mostly predates it. Counting it would drag the median down
        // and make every recommendation ask for more campaigns than it should.
        if (days < minDays) continue;
        out.push({ campaignId: c.id, title: c.title ?? '', value, days });
    }
    return out;
};

/**
 * The recommendation.
 *
 * @param opts.goal       the measured goal
 * @param opts.projection goalsService.projectionFor output
 * @param opts.yields     campaignYields() output
 * @returns {{ status, headline, workings, brief, ... }}
 */
export const recommendForGoal = ({ goal, projection, yields = [] } = {}) => {
    const measure = MEASURES[goal?.measure];
    const unit = measure?.unit ?? '';

    // Directional goals have no gap to close by arithmetic. Checkpoints are
    // their progress, and inventing a portfolio for one would be theatre.
    if (!goal || goal.kind !== 'measured') {
        return {
            status: 'not-measured',
            headline: 'A directional goal is judged by its checkpoints, not by a number.',
            workings: [],
            brief: '',
        };
    }

    const gap = num(projection?.gap);
    const daysRemaining = num(projection?.daysRemaining);

    // Unknown standing → unknown gap. Sizing against a gap Kepler cannot compute
    // is the exact false precision E2 was built to refuse.
    if (gap === null || projection?.verdict === 'unknown') {
        return {
            status: 'no-standing',
            headline: 'Not enough measured history to size a gap yet.',
            workings: ['A recommendation needs a forecast, and a forecast needs readings from campaigns under this goal.'],
            brief: '',
        };
    }

    if (gap <= 0) {
        return {
            status: 'no-gap',
            headline: `Ahead of pace by ${fmt(Math.abs(gap))} ${unit}. Nothing needs adding to land this.`,
            workings: ['Forecast at the current run rate already exceeds the target.'],
            brief: '',
            gap,
            daysRemaining,
        };
    }

    const values = yields.map((y) => y.value);
    const days = yields.map((y) => y.days);
    const sample = values.length;

    // ── Below the sample floor: propose work, refuse to size it ──────────────
    if (sample < MIN_SAMPLE) {
        return {
            status: 'insufficient-evidence',
            headline: `${fmt(gap)} ${unit} short with ${daysRemaining ?? '—'} days left.`,
            workings: [
                sample === 0
                    ? 'No campaign under this account has run long enough to show what one delivers.'
                    : `Only ${sample} campaign${sample === 1 ? ' has' : 's have'} run long enough to measure — Kepler needs ${MIN_SAMPLE} before it will estimate a contribution.`,
                'Rather than guess from an industry average, it will size this once your own campaigns have reported.',
            ],
            brief: buildBrief({ goal, gap, daysRemaining, unit, estimate: null }),
            gap,
            daysRemaining,
            sample,
        };
    }

    // ── Sized from the account's own campaigns ───────────────────────────────
    const mid = median(values);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const typicalDays = median(days);

    const needed = Math.max(1, Math.ceil(gap / mid));
    const neededIfLow = Math.max(1, Math.ceil(gap / Math.max(1, low)));
    const neededIfHigh = Math.max(1, Math.ceil(gap / Math.max(1, high)));

    // Proposing work that cannot land before the goal resolves is worse than
    // proposing nothing. This is a warning, not a block — the user may know
    // something Kepler does not.
    const tooLate = daysRemaining !== null && typicalDays !== null && daysRemaining < typicalDays;

    return {
        status: 'ok',
        headline: `${fmt(gap)} ${unit} short with ${daysRemaining ?? '—'} days left. `
            + `${needed} more campaign${needed === 1 ? '' : 's'} of your usual size would plausibly close it.`,
        workings: [
            `Your ${sample} measured campaigns have delivered ${fmt(low)}–${fmt(high)} ${unit} each (median ${fmt(mid)}).`,
            `At the median that is ${needed} campaign${needed === 1 ? '' : 's'}; at your best ${neededIfHigh}, at your weakest ${neededIfLow}.`,
            `Those are trailing levels from each campaign's own readings, not lifetime totals.`,
            ...(tooLate
                ? [`Your campaigns took around ${fmt(typicalDays)} days to reach that level and only ${daysRemaining} remain, so new work is unlikely to land inside this goal.`]
                : []),
        ],
        brief: buildBrief({ goal, gap, daysRemaining, unit, estimate: mid }),
        gap,
        daysRemaining,
        sample,
        estimate: { median: mid, low, high, typicalDays, unit },
        campaignsNeeded: { mid: needed, low: neededIfHigh, high: neededIfLow },
        tooLate,
    };
};

/**
 * The brief an accepted recommendation is created with — pre-parented to the
 * goal and pre-briefed against its live gap, per S3's "ways in".
 *
 * Deliberately states the gap and the deadline and NOT the estimate: the brief
 * becomes the campaign's own goal text, and a campaign that carries "should
 * deliver ~800 sessions" reads later as a promise Kepler made on its behalf.
 */
export const buildBrief = ({ goal, gap, daysRemaining, unit }) => {
    if (!goal?.name) return '';
    const shortfall = gap && gap > 0
        ? `Close a shortfall of ${fmt(gap)} ${unit}`
        : `Advance "${goal.name}"`;
    const window = daysRemaining ? ` within ${daysRemaining} days` : '';
    return `${shortfall}${window} against the goal "${goal.name}".`;
};

/**
 * Which production wing has delivered most per campaign, from E5's contribution
 * rows. A hint, not an instruction — and null rather than a coin toss when the
 * evidence does not separate them.
 */
export const channelHint = (contributions = []) => {
    const ours = contributions.filter((c) => c.production && c.production !== 'Other' && c.production !== 'Campaign');
    if (ours.length < 2) return null;
    const [best, second] = [...ours].sort((a, b) => b.sessions - a.sessions);
    // A near-tie is not a finding. Requiring a clear margin keeps this from
    // rotating its advice every time the numbers wobble.
    if (!second || best.sessions < second.sessions * 1.5) return null;
    return {
        production: best.production,
        source: best.source,
        evidence: `${best.production} has delivered the most of any wing you produce (${fmt(best.sessions)} sessions vs ${fmt(second.sessions)} for ${second.production}).`,
    };
};

export default recommendForGoal;
