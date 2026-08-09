// Goal feasibility (E2, roadmap S1).
//
// The roadmap's biggest stated risk was "users can articulate an account goal",
// mitigated by design: E2 does not ask for a target on a blank field, it PROPOSES
// one from the account's own funnel rates and shows the reachable range. That
// moves the risk rather than removing it, to two places this module has to guard:
//
//   * COLD START — an account with no history has no rates to derive from.
//     Every function here returns null/'unknown' in that case, never 0. A zero
//     forecast is a claim; "we cannot say yet" is the truth.
//   * FALSE PRECISION — a confident number from thin data. Confidence is
//     reported alongside every figure and it widens the range, so two snapshots
//     never produce the same certainty as three months.
//
// WHAT THE DATA ACTUALLY IS. campaign_metrics snapshots are trailing LEVELS, not
// per-day increments — GA4 stores last-28d sessions, and metricsHistory.js is
// built on the same fact. So a run rate is a level divided by its own trailing
// window, and cumulative progress is that rate integrated over elapsed days. It
// is an ESTIMATE, and `basis` says so on every result. Deriving a true cumulative
// would need per-day deltas the pipeline does not store.

/**
 * Measures a goal can be set against, all readable from data Kepler already has.
 * `trailingDays` is the window the provider's level covers — the divisor that
 * turns a level into a rate.
 */
export const MEASURES = {
    sessions: { id: 'sessions', label: 'Sessions', metricKey: 'sessions', unit: 'sessions', trailingDays: 28, source: 'ga4' },
    conversions: { id: 'conversions', label: 'Conversions', metricKey: 'conversions', unit: 'conversions', trailingDays: 28, source: 'ga4' },
    crmRecords: { id: 'crmRecords', label: 'CRM records', metricKey: 'crmRecords', unit: 'records', trailingDays: 28, source: 'crm' },
    meetings: { id: 'meetings', label: 'Meetings', metricKey: 'meetings', unit: 'meetings', trailingDays: 28, source: 'outreach' },
    revenue: { id: 'revenue', label: 'Revenue', metricKey: 'revenue', unit: 'revenue', trailingDays: 28, source: 'crm' },
    // A percentage, not a flow — it does not accumulate, so it is handled as a
    // level throughout (see isFlowMeasure).
    shareOfVoice: { id: 'shareOfVoice', label: 'AI share of voice', metricKey: 'shareOfVoice', unit: '%', trailingDays: 28, source: 'visibility_scans' },
};

export const MEASURE_IDS = Object.keys(MEASURES);

/** Flow measures accumulate over time; a share/percentage does not. */
export const isFlowMeasure = (measureId) => measureId !== 'shareOfVoice';

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (v) => {
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};

const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY_MS);

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * How much a range should widen for a given confidence. Thin data does not get
 * a tight range — that is the whole defence against false precision.
 */
const RANGE_SPREAD = { high: 0.15, medium: 0.3, low: 0.5 };

/**
 * Confidence from the shape of the evidence, not the size of the number.
 * One snapshot is a level with no trend behind it; that is 'low' however
 * healthy the number looks.
 */
const gradeConfidence = (count, spanDays) => {
    if (count === 0) return 'none';
    if (count === 1) return 'low';
    if (count >= 4 && spanDays >= 14) return 'high';
    return 'medium';
};

/**
 * Derive a run rate for one measure from campaign_metrics snapshots.
 *
 * @param snapshots [{ capturedAt, metrics }] — any order, any provider mix
 * @returns { perDay, level, confidence, snapshots, spanDays, observedAt, basis }
 *          perDay/level are null when there is nothing to read.
 */
export const deriveRunRate = (snapshots = [], measureId, { now = new Date() } = {}) => {
    const measure = MEASURES[measureId];
    const empty = {
        perDay: null, level: null, confidence: 'none', snapshots: 0,
        spanDays: 0, observedAt: null, basis: 'trailing-level',
    };
    if (!measure) return empty;

    const usable = (snapshots ?? [])
        .map((s) => ({ at: toDate(s?.capturedAt), value: num(s?.metrics?.[measure.metricKey]) }))
        .filter((s) => s.at && s.value !== null)
        .sort((a, b) => a.at - b.at);

    if (!usable.length) return empty;

    const latest = usable[usable.length - 1];
    const spanDays = Math.max(0, daysBetween(usable[0].at, latest.at));
    const confidence = gradeConfidence(usable.length, spanDays);

    return {
        // A percentage has no per-day rate; only flows do.
        perDay: isFlowMeasure(measureId) ? latest.value / measure.trailingDays : null,
        level: latest.value,
        confidence,
        snapshots: usable.length,
        spanDays,
        observedAt: latest.at.toISOString(),
        basis: 'trailing-level',
        staleDays: Math.max(0, daysBetween(latest.at, now)),
    };
};

/**
 * Propose a target for a goal window, with the range it might land in.
 *
 * Returns null on cold start — the UI then asks for a target instead of
 * inventing one, which is the honest failure and the one the roadmap calls for.
 */
export const proposeTarget = (runRate, { startDate, endDate } = {}) => {
    const start = toDate(startDate);
    const end = toDate(endDate);
    if (!start || !end || !runRate || runRate.confidence === 'none') return null;

    const days = Math.max(1, daysBetween(start, end));

    if (runRate.perDay === null) {
        // Share of voice: the "target" is a level to reach, not a total to
        // accumulate. Propose the current level as the floor and leave the
        // ambition to the user — we have no basis for predicting a share gain.
        return {
            suggested: Math.round(runRate.level),
            range: { low: Math.round(runRate.level), mid: Math.round(runRate.level), high: null },
            days,
            confidence: runRate.confidence,
            basis: 'current-level',
        };
    }

    const mid = runRate.perDay * days;
    const spread = RANGE_SPREAD[runRate.confidence] ?? 0.5;
    return {
        suggested: Math.round(mid),
        range: {
            low: Math.round(mid * (1 - spread)),
            mid: Math.round(mid),
            high: Math.round(mid * (1 + spread)),
        },
        days,
        perDay: runRate.perDay,
        confidence: runRate.confidence,
        basis: 'run-rate',
    };
};

const verdictFor = (forecast, target) => {
    if (forecast === null || target === null || !target) return 'unknown';
    const ratio = forecast / target;
    if (ratio >= 1) return 'on-track';
    if (ratio >= 0.85) return 'at-risk';
    return 'off-pace';
};

/**
 * Where a goal actually stands.
 *
 * Progress is measured from the BASELINE, not from zero: a goal set mid-quarter
 * against a measure that was already at 800 would otherwise open at 66% without
 * anyone doing anything.
 *
 * @returns everything the right rail renders. Numbers are null, never 0, when
 *          they cannot be known.
 */
export const projectGoal = ({
    runRate,
    baseline = 0,
    target,
    startDate,
    endDate,
    now = new Date(),
} = {}) => {
    const start = toDate(startDate);
    const end = toDate(endDate);
    const tgt = num(target);
    const base = num(baseline) ?? 0;

    const totalDays = start && end ? Math.max(1, daysBetween(start, end)) : null;
    const daysElapsed = start ? Math.max(0, Math.min(daysBetween(start, now), totalDays ?? Infinity)) : null;
    const daysRemaining = totalDays !== null && daysElapsed !== null ? Math.max(0, totalDays - daysElapsed) : null;

    const unknown = {
        achieved: null, forecast: null, gap: null, progress: null,
        verdict: 'unknown', totalDays, daysElapsed, daysRemaining,
        confidence: runRate?.confidence ?? 'none',
        basis: runRate?.basis ?? null,
        requiredPerDay: null,
    };

    if (!runRate || runRate.confidence === 'none' || tgt === null) return unknown;

    // Share of voice is a level: "achieved" is where it stands now, and there is
    // no run rate to project, so the forecast is the current level held flat.
    if (runRate.perDay === null) {
        const achieved = runRate.level;
        return {
            ...unknown,
            achieved,
            forecast: achieved,
            gap: tgt - achieved,
            progress: tgt ? Math.max(0, Math.min(1, achieved / tgt)) : null,
            verdict: verdictFor(achieved, tgt),
            confidence: runRate.confidence,
            basis: 'current-level',
        };
    }

    const achieved = daysElapsed !== null ? runRate.perDay * daysElapsed : null;
    const netTarget = Math.max(0, tgt - base);
    const forecast = totalDays !== null ? runRate.perDay * totalDays : null;

    return {
        achieved: achieved === null ? null : Math.round(achieved),
        forecast: forecast === null ? null : Math.round(forecast),
        gap: forecast === null ? null : Math.round(tgt - base - forecast),
        progress: netTarget && achieved !== null ? Math.max(0, Math.min(1, achieved / netTarget)) : null,
        verdict: verdictFor(forecast, netTarget),
        totalDays,
        daysElapsed,
        daysRemaining,
        confidence: runRate.confidence,
        basis: runRate.basis,
        // What the pace would have to become to still land it — the number the
        // "recommend campaigns" action (E10) is sized against.
        requiredPerDay: daysRemaining
            ? Math.max(0, (netTarget - (achieved ?? 0)) / daysRemaining)
            : null,
    };
};

/**
 * The advisory the roadmap asks for on short goals — stated, never blocking.
 * "Scaffold, not cage": Kepler says a month is campaign-shaped and lets you proceed.
 */
export const goalWindowAdvice = ({ startDate, endDate } = {}) => {
    const start = toDate(startDate);
    const end = toDate(endDate);
    if (!start || !end) return null;
    const days = daysBetween(start, end);
    if (days < 0) return { level: 'error', message: 'The end date is before the start date.' };
    if (days < 30) {
        return {
            level: 'advice',
            message: 'A month is campaign-shaped: goals want several campaigns and enough cycles for a forecast to mean anything. Create a campaign instead?',
        };
    }
    return null;
};

/** Plain-language basis line, so a forecast can be argued with rather than trusted. */
export const describeBasis = (runRate) => {
    if (!runRate || runRate.confidence === 'none') return 'No history yet — connect a source or set a target manually.';
    const n = runRate.snapshots;
    const span = runRate.spanDays;
    const spanText = span >= 1 ? ` over ${span} day${span === 1 ? '' : 's'}` : '';
    const stale = runRate.staleDays >= 7 ? ` Last reading is ${runRate.staleDays} days old.` : '';
    return `Based on ${n} reading${n === 1 ? '' : 's'}${spanText} (${runRate.confidence} confidence).${stale}`;
};
