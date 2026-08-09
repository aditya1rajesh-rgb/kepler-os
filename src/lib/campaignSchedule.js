// Cross-campaign schedule (E30, from roadmap S3).
//
// A per-campaign calendar already existed, buried inside one campaign's detail
// view. The orchestrator's actual question — "what is shipping this month across
// everything" — could not be asked, because every calendar was scoped to the
// campaign you happened to have open.
//
// The grouping lives here rather than in the screen so it can be tested without
// a browser, and so "which steps count as scheduled" has one definition.

/** Steps a campaign can contribute. Archived campaigns are not upcoming work. */
const SCHEDULABLE_CAMPAIGN_STATUS = new Set(['draft', 'active', 'completed']);

/**
 * Every dated step across every campaign, flattened.
 *
 * A step without a `scheduledDate` is not on the calendar — it is real work, but
 * undated work belongs on the campaign plan, not on a day. Skipped steps drop
 * out entirely: they are decisions already taken.
 */
export const scheduledStepsAcross = (campaigns = []) => {
    const out = [];
    for (const campaign of campaigns) {
        if (!SCHEDULABLE_CAMPAIGN_STATUS.has(campaign?.status)) continue;
        const steps = Array.isArray(campaign?.plan?.steps) ? campaign.plan.steps : [];
        for (const step of steps) {
            if (step?.status === 'skipped') continue;
            const iso = String(step?.scheduledDate ?? '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
            out.push({ iso, step, campaign });
        }
    }
    return out;
};

/** `{ '2026-08-14': [entry, …] }` — the shape a month grid indexes into. */
export const groupByDate = (entries = []) => {
    const byDate = {};
    for (const entry of entries) {
        (byDate[entry.iso] ??= []).push(entry);
    }
    return byDate;
};

/**
 * What a month actually contains, for the screen's status line. "14 steps across
 * 3 campaigns" is the sentence the orchestrator wants; a bare grid is not.
 */
export const monthSummary = (entries = [], monthDate = new Date()) => {
    const year = monthDate.getFullYear();
    const month = String(monthDate.getMonth() + 1).padStart(2, '0');
    const prefix = `${year}-${month}`;
    const inMonth = entries.filter((e) => e.iso.startsWith(prefix));
    const campaigns = new Set(inMonth.map((e) => e.campaign.id));
    const done = inMonth.filter((e) => e.step.status === 'done').length;
    return { steps: inMonth.length, campaigns: campaigns.size, done };
};

/** Undated steps on live campaigns — work that exists but has no day yet. */
export const unscheduledCount = (campaigns = []) => {
    let n = 0;
    for (const campaign of campaigns) {
        if (!SCHEDULABLE_CAMPAIGN_STATUS.has(campaign?.status)) continue;
        const steps = Array.isArray(campaign?.plan?.steps) ? campaign.plan.steps : [];
        for (const step of steps) {
            if (step?.status === 'skipped' || step?.status === 'done') continue;
            if (!String(step?.scheduledDate ?? '').trim()) n += 1;
        }
    }
    return n;
};
