// The funnel snapshot — zone 4 of the cockpit (E5, roadmap S2).
//
// Sessions → conversions → CRM records → meetings → revenue, each with a
// sparkline rather than a bare number. That is not decoration: the screen's
// admission filter says a card reporting current state does not belong, and a
// number with a trend answers "what changed" while a number alone does not.
//
// THE TRAP THIS FILE EXISTS TO AVOID. campaign_metrics rows are trailing LEVELS
// (GA4 reports last-28-days), not per-period increments. Summing them across
// periods would multiply the truth by roughly the number of readings; treating
// consecutive points as growth would too. So every point here is "the level as
// it read at that moment", the delta is level-vs-previous-level, and the label
// says exactly that. See goalFeasibility.js, which guards the same fact for
// forecasts, and metricsHistory.js, which is built on it.

import { buildPeriods, latestPerPeriod, periodDelta } from './metricsHistory';

/**
 * The stages, in funnel order, with the provider that writes each one.
 *
 * `unlockedBy` is what a user would have to connect for a missing stage to
 * appear — the cold-start requirement is that the funnel shows what connecting
 * each source would give you, rather than five dashes.
 */
export const FUNNEL_STAGES = [
    { id: 'sessions', label: 'Sessions', provider: 'ga4', metricKey: 'sessions', unlockedBy: 'GA4', connector: 'ga4' },
    { id: 'conversions', label: 'Conversions', provider: 'ga4', metricKey: 'conversions', unlockedBy: 'GA4', connector: 'ga4' },
    { id: 'crmRecords', label: 'CRM records', provider: 'zoho', metricKey: 'crmRecords', unlockedBy: 'a CRM', connector: 'zoho' },
    { id: 'meetings', label: 'Meetings', provider: 'outreach', metricKey: 'meetings', unlockedBy: 'Outreach', connector: null },
    { id: 'revenue', label: 'Revenue', provider: 'revenue', metricKey: 'revenue', unlockedBy: 'a CRM with deal values', connector: 'zoho' },
];

/**
 * The distinct READINGS behind a metric, oldest first — one entry per day a
 * snapshot was taken, summed across campaigns.
 *
 * The delta has to come from here rather than from the plotted periods. Periods
 * carry the latest level at or before their end, so a week nobody pulled data
 * repeats last week's number, and comparing those two would report "flat" when
 * the truth is "no new reading". Bucketing by day rather than by exact instant
 * because the writers insert one row per campaign and each gets its own now().
 */
export const readingSeries = (rows = [], { provider, metricKey }) => {
    const byDay = new Map();
    for (const r of rows ?? []) {
        if (r?.provider !== provider) continue;
        const at = new Date(r.captured_at);
        if (Number.isNaN(at.getTime())) continue;
        const day = at.toISOString().slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, { day, at: at.toISOString(), perCampaign: new Map() });
        const bucket = byDay.get(day);
        if (at.toISOString() > bucket.at) bucket.at = at.toISOString();
        const key = r.campaign_id ?? '__none__';
        const prev = bucket.perCampaign.get(key);
        const t = at.getTime();
        if (!prev || t > prev.t) bucket.perCampaign.set(key, { t, value: Number(r.metrics?.[metricKey] ?? 0) });
    }
    return [...byDay.values()]
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((b) => ({
            day: b.day,
            at: b.at,
            value: [...b.perCampaign.values()].reduce((s, e) => s + e.value, 0),
        }));
};

/**
 * Build the five stages from raw campaign_metrics rows.
 *
 * @param rows [{ provider, metrics, captured_at }] — workspace history
 * @param opts.granularity 'weekly' | 'monthly' | 'quarterly'
 * @param opts.count how many periods the sparkline spans
 * @returns [{ id, label, value, points, delta, hasData, unlockedBy }]
 */
export const buildFunnel = (rows = [], { granularity = 'weekly', count = 8, now = new Date() } = {}) => {
    const periods = buildPeriods(granularity, count, now);

    return FUNNEL_STAGES.map((stage) => {
        const series = latestPerPeriod(rows, periods, {
            provider: stage.provider,
            metricKey: stage.metricKey,
            nullWhenMissing: true,
        });
        // A period with no reading is null, not 0 — a week nobody pulled data is
        // not a week of zero sessions, and drawing it at the floor would render
        // a cliff that never happened.
        const points = series.map((p) => ({ label: p.label, value: p.value }));

        const readings = readingSeries(rows, { provider: stage.provider, metricKey: stage.metricKey });
        const latest = readings.length ? readings[readings.length - 1] : null;
        const previous = readings.length > 1 ? readings[readings.length - 2] : null;

        return {
            ...stage,
            value: latest ? latest.value : null,
            points,
            // Level against the previous LEVEL, from two distinct readings. Never
            // described as growth: two trailing windows overlap, so the difference
            // is a change in the trailing average, not the period's own gain.
            delta: latest && previous ? periodDelta(latest.value, previous.value) : null,
            readAt: latest?.at ?? null,
            comparedTo: previous?.at ?? null,
            hasData: Boolean(latest),
        };
    });
};

/**
 * The stage-to-stage conversion rates, for the stages that have both ends.
 * Returns null per pair when either end is missing — a rate against a missing
 * denominator is the kind of confident wrong number this codebase keeps
 * refusing to print.
 */
export const funnelRates = (stages = []) => {
    const out = [];
    for (let i = 0; i < stages.length - 1; i += 1) {
        const from = stages[i];
        const to = stages[i + 1];
        const rate = from?.value && to?.value !== null && to?.value !== undefined
            ? to.value / from.value
            : null;
        out.push({ from: from.id, to: to.id, rate });
    }
    return out;
};

export default buildFunnel;
