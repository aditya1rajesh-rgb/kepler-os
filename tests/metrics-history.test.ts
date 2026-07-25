import { describe, expect, it } from 'vitest';
import { buildPeriods, latestPerPeriod, periodDelta } from '../src/lib/metricsHistory.js';

describe('buildPeriods', () => {
    it('builds N monthly periods oldest-first ending at now', () => {
        const now = new Date(2026, 6, 15); // Jul 2026
        const p = buildPeriods('monthly', 3, now);
        expect(p.map((x) => x.label)).toEqual(['May', 'Jun', 'Jul']);
        expect(p[2].start).toEqual(new Date(2026, 6, 1));
        expect(p[2].end).toEqual(new Date(2026, 7, 1));
    });

    it('builds quarterly periods', () => {
        const now = new Date(2026, 6, 15); // Q3
        const p = buildPeriods('quarterly', 2, now);
        expect(p.map((x) => x.label)).toEqual(['Q2', 'Q3']);
    });

    it('builds weekly 7-day windows aligned to Monday', () => {
        const now = new Date(2026, 6, 15); // Wed Jul 15 2026
        const p = buildPeriods('weekly', 2, now);
        expect(p).toHaveLength(2);
        // Each window is exactly 7 days.
        for (const win of p) {
            expect((win.end.getTime() - win.start.getTime()) / 86400000).toBe(7);
        }
        // Latest window contains `now`.
        expect(p[1].start.getTime()).toBeLessThanOrEqual(now.getTime());
        expect(p[1].end.getTime()).toBeGreaterThan(now.getTime());
    });
});

describe('latestPerPeriod', () => {
    const rows = [
        { campaign_id: 'a', provider: 'ga4', metrics: { conversions: 10 }, captured_at: '2026-05-10T00:00:00Z' },
        { campaign_id: 'a', provider: 'ga4', metrics: { conversions: 25 }, captured_at: '2026-06-20T00:00:00Z' },
        { campaign_id: 'b', provider: 'ga4', metrics: { conversions: 5 }, captured_at: '2026-06-25T00:00:00Z' },
        { campaign_id: 'a', provider: 'zoho', metrics: { crmRecords: 99 }, captured_at: '2026-06-20T00:00:00Z' },
    ];
    const periods = buildPeriods('monthly', 3, new Date(2026, 6, 15));

    it('takes the latest snapshot at/before each period end and sums campaigns', () => {
        const series = latestPerPeriod(rows, periods, { provider: 'ga4', metricKey: 'conversions' });
        // May: only campaign a's May snapshot (10)
        expect(series[0].value).toBe(10);
        // Jun: a=25 (latest ≤ Jul 1) + b=5 = 30
        expect(series[1].value).toBe(30);
        // Jul: same latest levels carry (a=25, b=5) = 30
        expect(series[2].value).toBe(30);
    });

    it('ignores other providers', () => {
        const series = latestPerPeriod(rows, periods, { provider: 'zoho', metricKey: 'crmRecords' });
        expect(series[1].value).toBe(99);
        expect(series[0].value).toBe(0); // no zoho snapshot before May end
    });
});

describe('periodDelta', () => {
    it('computes up/down percentages', () => {
        expect(periodDelta(120, 100)).toEqual({ pct: 20, direction: 'up' });
        expect(periodDelta(80, 100)).toEqual({ pct: -20, direction: 'down' });
    });
    it('hides the pill when there is no comparable base', () => {
        expect(periodDelta(50, 0)).toEqual({ pct: null, direction: 'up' });
        expect(periodDelta(0, 0)).toEqual({ pct: null, direction: 'flat' });
    });
});
