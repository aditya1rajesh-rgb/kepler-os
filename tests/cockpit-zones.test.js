// E5 · the cockpit's two pure zones. What is worth pinning here is not the
// arithmetic, it is the refusals: a queue row built on a column nothing writes,
// a sparkline that plots "no reading yet" as zero, and a funnel rate taken
// against a missing denominator would each look completely plausible on screen.
import { describe, expect, it } from 'vitest';
import { buildNeedsYou } from '../src/lib/needsYou.js';
import { buildFunnel, funnelRates, readingSeries } from '../src/lib/funnelSnapshot.js';

const NOW = new Date('2026-08-09T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe('buildNeedsYou — sequences', () => {
    it('separates a sequence that STOPPED sending from one merely awaiting approval', () => {
        // E1's distinction. Falling out of 'active' halted sends; falling out of
        // 'approved' needs the same click but nothing was in flight, and claiming
        // otherwise would be a fabricated alarm.
        const rows = buildNeedsYou({
            sequences: [
                { id: 's1', heldFromStatus: 'active' },
                { id: 's2', heldFromStatus: 'approved' },
            ],
        }, { now: NOW });
        const stopped = rows.find((r) => r.kind === 'sequence-stopped');
        const held = rows.find((r) => r.kind === 'sequence-held');
        expect(stopped.title).toBe('1 sequence stopped sending');
        expect(held.title).toBe('1 sequence awaiting re-approval');
        expect(held.detail).toMatch(/nothing stopped/i);
        // Stopped sending outranks everything else in the queue.
        expect(rows[0].kind).toBe('sequence-stopped');
    });

    it('says nothing about sequences that were never held', () => {
        expect(buildNeedsYou({ sequences: [{ id: 's1', heldFromStatus: '' }] }, { now: NOW })).toEqual([]);
    });
});

describe('buildNeedsYou — replies', () => {
    it('reads enrollment status, not replies.classified', () => {
        // `classified` is the obvious filter and is never written outside the
        // demo, so a queue built on it would show every reply forever.
        const rows = buildNeedsYou({
            enrollments: [
                { id: 'e1', status: 'stopped_reply', updatedAt: daysAgo(4) },
                { id: 'e2', status: 'stopped_reply', updatedAt: daysAgo(1) },
                { id: 'e3', status: 'meeting', updatedAt: daysAgo(9) },
            ],
        }, { now: NOW });
        const replies = rows.find((r) => r.kind === 'reply');
        expect(replies.count).toBe(2);
        expect(replies.detail).toContain('4 days');
    });
});

describe('buildNeedsYou — campaign steps', () => {
    const campaigns = [{
        id: 'c1',
        title: 'Intake 2027',
        status: 'active',
        plan: {
            steps: [
                { id: 'a', title: 'Pillar post', scheduledDate: daysAgo(11), status: 'pending' },
                { id: 'b', title: 'Comparison post', scheduledDate: daysAgo(2), status: 'pending' },
                { id: 'c', title: 'Done thing', scheduledDate: daysAgo(30), status: 'done' },
                { id: 'd', title: 'Future thing', scheduledDate: '2026-12-01', status: 'pending' },
                { id: 'e', title: 'Undated', status: 'pending' },
            ],
        },
    }];

    it('counts only undated-in-the-past, unfinished steps and names the worst', () => {
        const rows = buildNeedsYou({ campaigns }, { now: NOW });
        const overdue = rows.find((r) => r.kind === 'step-overdue');
        expect(overdue.count).toBe(2);
        expect(overdue.detail).toContain('11 days');
        expect(overdue.detail).toContain('Pillar post');
    });

    it('ignores steps in campaigns that are not active', () => {
        const draft = [{ ...campaigns[0], status: 'draft' }];
        expect(buildNeedsYou({ campaigns: draft }, { now: NOW })).toEqual([]);
    });
});

describe('buildNeedsYou — domains and idle drafts', () => {
    it('raises an unverified domain only where there is outreach to block', () => {
        const domains = [{ id: 'd1', status: 'pending' }];
        expect(buildNeedsYou({ sendingDomains: domains }, { now: NOW })).toEqual([]);
        const withSeq = buildNeedsYou({ sendingDomains: domains, sequences: [{ id: 's', heldFromStatus: '' }] }, { now: NOW });
        expect(withSeq.find((r) => r.kind === 'domain-unverified')).toBeTruthy();
    });

    it('surfaces finished work that never reached a campaign', () => {
        const rows = buildNeedsYou({ idleDrafts: [{ id: 'i1' }, { id: 'i2' }] }, { now: NOW });
        expect(rows[0].title).toBe('2 finished drafts not laddered to a campaign');
        expect(rows[0].module).toBe('library');
    });
});

describe('buildNeedsYou — ordering and the empty state', () => {
    it('sorts by urgency, not by count', () => {
        const rows = buildNeedsYou({
            idleDrafts: Array.from({ length: 40 }, (_, i) => ({ id: `d${i}` })),
            enrollments: [{ id: 'e', status: 'stopped_reply', updatedAt: daysAgo(1) }],
            sequences: [{ id: 's', heldFromStatus: 'active' }],
        }, { now: NOW });
        expect(rows.map((r) => r.kind)).toEqual(['sequence-stopped', 'reply', 'draft-idle']);
    });

    it('is empty — a real state — when nothing needs anyone', () => {
        expect(buildNeedsYou({}, { now: NOW })).toEqual([]);
    });

    it('gives every row somewhere to go', () => {
        const rows = buildNeedsYou({
            sequences: [{ id: 's', heldFromStatus: 'active' }],
            enrollments: [{ id: 'e', status: 'stopped_reply' }],
            idleDrafts: [{ id: 'i' }],
        }, { now: NOW });
        expect(rows.every((r) => Boolean(r.module))).toBe(true);
    });
});

describe('buildFunnel', () => {
    const metric = (provider, metrics, days) => ({
        campaign_id: 'c1', provider, metrics, captured_at: daysAgo(days),
    });
    // Trailing levels, one reading a week — the shape campaign_metrics actually has.
    const rows = [
        metric('ga4', { sessions: 2600, conversions: 40 }, 21),
        metric('ga4', { sessions: 2700, conversions: 44 }, 14),
        metric('ga4', { sessions: 2800, conversions: 46 }, 7),
        metric('zoho', { crmRecords: 18 }, 7),
    ];

    it('reads the latest level per period rather than summing periods', () => {
        // Summing four trailing-28d readings would report ~10,900 sessions where
        // the truth is 2,800 — wrong by 4x and entirely plausible-looking.
        const stages = buildFunnel(rows, { granularity: 'weekly', count: 5, now: NOW });
        const sessions = stages.find((s) => s.id === 'sessions');
        expect(sessions.value).toBe(2800);
        expect(sessions.hasData).toBe(true);
    });

    it('plots a period with no reading as null, never as zero', () => {
        const stages = buildFunnel(rows, { granularity: 'weekly', count: 8, now: NOW });
        const sessions = stages.find((s) => s.id === 'sessions');
        // The oldest weeks predate every snapshot.
        expect(sessions.points[0].value).toBeNull();
        expect(sessions.points.some((p) => p.value === null)).toBe(true);
    });

    it('takes the delta from two real readings, not two plotted periods', () => {
        // A week nobody pulled data repeats last week's level, so comparing
        // plotted periods reports "flat" when the truth is "no new reading".
        const stages = buildFunnel(rows, { granularity: 'weekly', count: 5, now: NOW });
        const sessions = stages.find((s) => s.id === 'sessions');
        expect(sessions.delta.direction).toBe('up');
        expect(sessions.delta.pct).toBeCloseTo(3.7, 1); // 2800 vs 2700
        expect(sessions.readAt).toBe(daysAgo(7));
        expect(sessions.comparedTo).toBe(daysAgo(14));
        // One reading only — there is nothing to compare it against.
        expect(stages.find((s) => s.id === 'crmRecords').delta).toBeNull();
    });

    it('sums a reading across campaigns but does not double-count one campaign', () => {
        const multi = [
            { campaign_id: 'a', provider: 'ga4', metrics: { sessions: 100 }, captured_at: daysAgo(7) },
            { campaign_id: 'b', provider: 'ga4', metrics: { sessions: 250 }, captured_at: daysAgo(7) },
            // A second row for the same campaign on the same day: the later one wins.
            { campaign_id: 'a', provider: 'ga4', metrics: { sessions: 120 }, captured_at: daysAgo(6.9) },
        ];
        expect(readingSeries(multi, { provider: 'ga4', metricKey: 'sessions' }).at(-1).value).toBe(370);
    });

    it('reports a stage with no source at all as empty, and says what unlocks it', () => {
        const stages = buildFunnel(rows, { granularity: 'weekly', count: 5, now: NOW });
        const meetings = stages.find((s) => s.id === 'meetings');
        expect(meetings.value).toBeNull();
        expect(meetings.hasData).toBe(false);
        expect(meetings.unlockedBy).toBe('Outreach');
    });

    it('returns all five stages even on a completely cold workspace', () => {
        const stages = buildFunnel([], { now: NOW });
        expect(stages).toHaveLength(5);
        expect(stages.every((s) => s.value === null)).toBe(true);
    });
});

describe('funnelRates', () => {
    it('computes a rate only where both ends are real', () => {
        const stages = [
            { id: 'sessions', value: 2000 },
            { id: 'conversions', value: 40 },
            { id: 'crmRecords', value: null },
        ];
        const rates = funnelRates(stages);
        expect(rates[0]).toEqual({ from: 'sessions', to: 'conversions', rate: 0.02 });
        // A rate against a missing denominator is a confident wrong number.
        expect(rates[1].rate).toBeNull();
    });
});
