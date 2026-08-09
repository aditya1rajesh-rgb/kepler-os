// E30 · the cross-campaign calendar. "What is shipping this month" is only
// trustworthy if the rule for what lands on a day is exact.
import { describe, expect, it } from 'vitest';
import {
    groupByDate,
    monthSummary,
    scheduledStepsAcross,
    unscheduledCount,
} from '../src/lib/campaignSchedule.js';

const campaign = (over = {}) => ({
    id: 'c1',
    title: 'Q3 intake',
    status: 'active',
    plan: { steps: [] },
    ...over,
});

const step = (over = {}) => ({
    id: 's1', title: 'Blog post', module: 'seo-aeo', status: 'todo', scheduledDate: '2026-08-14', ...over,
});

describe('scheduledStepsAcross', () => {
    it('flattens dated steps from every campaign', () => {
        const rows = scheduledStepsAcross([
            campaign({ id: 'c1', plan: { steps: [step({ id: 'a' }), step({ id: 'b', scheduledDate: '2026-08-20' })] } }),
            campaign({ id: 'c2', plan: { steps: [step({ id: 'c' })] } }),
        ]);
        expect(rows).toHaveLength(3);
        expect(new Set(rows.map((r) => r.campaign.id))).toEqual(new Set(['c1', 'c2']));
    });

    it('drops undated steps — undated work belongs on the plan, not on a day', () => {
        const rows = scheduledStepsAcross([campaign({ plan: { steps: [step({ scheduledDate: '' }), step({ id: 'x', scheduledDate: null })] } })]);
        expect(rows).toEqual([]);
    });

    it('drops skipped steps — a decision already taken is not upcoming work', () => {
        const rows = scheduledStepsAcross([campaign({ plan: { steps: [step({ status: 'skipped' })] } })]);
        expect(rows).toEqual([]);
    });

    it('excludes archived campaigns', () => {
        const rows = scheduledStepsAcross([campaign({ status: 'archived', plan: { steps: [step()] } })]);
        expect(rows).toEqual([]);
    });

    it('ignores malformed dates rather than putting them on a wrong day', () => {
        const rows = scheduledStepsAcross([campaign({ plan: { steps: [step({ scheduledDate: '14/08/2026' }), step({ id: 'y', scheduledDate: 'soon' })] } })]);
        expect(rows).toEqual([]);
    });

    it('survives a campaign with no plan', () => {
        expect(scheduledStepsAcross([campaign({ plan: null }), {}])).toEqual([]);
        expect(scheduledStepsAcross()).toEqual([]);
    });
});

describe('groupByDate', () => {
    it('buckets several campaigns landing on the same day', () => {
        const rows = scheduledStepsAcross([
            campaign({ id: 'c1', plan: { steps: [step({ id: 'a' })] } }),
            campaign({ id: 'c2', plan: { steps: [step({ id: 'b' })] } }),
        ]);
        expect(groupByDate(rows)['2026-08-14']).toHaveLength(2);
    });
});

describe('monthSummary', () => {
    const rows = scheduledStepsAcross([
        campaign({ id: 'c1', plan: { steps: [step({ id: 'a' }), step({ id: 'b', status: 'done' })] } }),
        campaign({ id: 'c2', plan: { steps: [step({ id: 'c', scheduledDate: '2026-09-02' })] } }),
    ]);

    it('counts only the month shown, and distinct campaigns within it', () => {
        const s = monthSummary(rows, new Date(2026, 7, 1)); // August
        expect(s).toEqual({ steps: 2, campaigns: 1, done: 1 });
    });

    it('moves with the month', () => {
        expect(monthSummary(rows, new Date(2026, 8, 1))).toMatchObject({ steps: 1, campaigns: 1 });
    });

    it('is zero-safe on an empty schedule', () => {
        expect(monthSummary([], new Date(2026, 7, 1))).toEqual({ steps: 0, campaigns: 0, done: 0 });
    });
});

describe('unscheduledCount', () => {
    it('counts undated work that is still outstanding', () => {
        const n = unscheduledCount([campaign({
            plan: { steps: [step({ scheduledDate: '' }), step({ id: 'b', scheduledDate: '' , status: 'done' }), step({ id: 'c' })] },
        })]);
        // one undated todo; the undated-but-done step and the dated step don't count
        expect(n).toBe(1);
    });
});
