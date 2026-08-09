// E2 · the feasibility engine. The roadmap's mitigation for "users can't
// articulate a goal" is proposing one from their own rates — which moves the
// risk to cold start and false precision. Both are tested here explicitly,
// because a confident wrong number is worse than no number.
import { describe, expect, it } from 'vitest';
import {
    MEASURES,
    deriveRunRate,
    describeBasis,
    goalWindowAdvice,
    isFlowMeasure,
    projectGoal,
    proposeTarget,
} from '../src/lib/goalFeasibility.js';

const NOW = new Date('2026-08-09T12:00:00Z');
const snap = (daysAgo, metrics) => ({
    capturedAt: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(),
    metrics,
});

// GA4 levels are trailing-28d, so 2,800 sessions = 100/day.
const history = [
    snap(30, { sessions: 2600 }),
    snap(20, { sessions: 2700 }),
    snap(10, { sessions: 2750 }),
    snap(1, { sessions: 2800 }),
];

describe('deriveRunRate — a level is not a rate', () => {
    it('divides the trailing level by its own window', () => {
        const r = deriveRunRate(history, 'sessions', { now: NOW });
        expect(r.level).toBe(2800);
        expect(r.perDay).toBeCloseTo(100, 5); // 2800 / 28
        expect(r.basis).toBe('trailing-level');
    });

    it('reads the LATEST snapshot, whatever order they arrive in', () => {
        const shuffled = [history[2], history[0], history[3], history[1]];
        expect(deriveRunRate(shuffled, 'sessions', { now: NOW }).level).toBe(2800);
    });

    it('returns none — not zero — with no history at all', () => {
        const r = deriveRunRate([], 'sessions', { now: NOW });
        expect(r.confidence).toBe('none');
        expect(r.perDay).toBeNull();
        expect(r.level).toBeNull();
    });

    it('ignores snapshots missing the measure rather than reading them as zero', () => {
        const r = deriveRunRate([snap(3, { conversions: 12 }), snap(1, {})], 'sessions', { now: NOW });
        expect(r.confidence).toBe('none');
    });

    it('grades confidence on the shape of the evidence, not the size of the number', () => {
        expect(deriveRunRate([snap(1, { sessions: 999999 })], 'sessions', { now: NOW }).confidence).toBe('low');
        expect(deriveRunRate([snap(3, { sessions: 10 }), snap(1, { sessions: 12 })], 'sessions', { now: NOW }).confidence).toBe('medium');
        expect(deriveRunRate(history, 'sessions', { now: NOW }).confidence).toBe('high');
    });

    it('reports staleness so an old reading cannot masquerade as current', () => {
        const r = deriveRunRate([snap(40, { sessions: 2800 }), snap(30, { sessions: 2800 })], 'sessions', { now: NOW });
        expect(r.staleDays).toBe(30);
        expect(describeBasis(r)).toMatch(/30 days old/);
    });

    it('has no per-day rate for a percentage measure', () => {
        const r = deriveRunRate([snap(1, { shareOfVoice: 12 })], 'shareOfVoice', { now: NOW });
        expect(r.level).toBe(12);
        expect(r.perDay).toBeNull();
        expect(isFlowMeasure('shareOfVoice')).toBe(false);
    });

    it('is total on junk input', () => {
        expect(deriveRunRate(null, 'sessions').confidence).toBe('none');
        expect(deriveRunRate(history, 'not-a-measure').confidence).toBe('none');
        expect(deriveRunRate([{ capturedAt: 'nonsense', metrics: { sessions: 1 } }], 'sessions').confidence).toBe('none');
    });
});

describe('proposeTarget — never a blank field, never a fake number', () => {
    const dates = { startDate: '2026-08-01', endDate: '2026-10-30' }; // 90 days

    it('proposes the run rate carried across the window', () => {
        const p = proposeTarget(deriveRunRate(history, 'sessions', { now: NOW }), dates);
        expect(p.suggested).toBe(9000); // 100/day × 90
        expect(p.basis).toBe('run-rate');
    });

    it('returns null on cold start rather than proposing zero', () => {
        expect(proposeTarget(deriveRunRate([], 'sessions'), dates)).toBeNull();
    });

    it('widens the range when the evidence is thin — the false-precision guard', () => {
        const thin = proposeTarget(deriveRunRate([snap(1, { sessions: 2800 })], 'sessions', { now: NOW }), dates);
        const solid = proposeTarget(deriveRunRate(history, 'sessions', { now: NOW }), dates);
        const width = (p) => p.range.high - p.range.low;
        expect(thin.confidence).toBe('low');
        expect(solid.confidence).toBe('high');
        expect(width(thin)).toBeGreaterThan(width(solid));
    });

    it('treats share of voice as a level to hold, not a total to accumulate', () => {
        const p = proposeTarget(deriveRunRate([snap(1, { shareOfVoice: 12 })], 'shareOfVoice', { now: NOW }), dates);
        expect(p.basis).toBe('current-level');
        expect(p.suggested).toBe(12);
    });

    it('needs both dates', () => {
        expect(proposeTarget(deriveRunRate(history, 'sessions', { now: NOW }), { startDate: '2026-08-01' })).toBeNull();
    });
});

describe('projectGoal', () => {
    const base = {
        runRate: deriveRunRate(history, 'sessions', { now: NOW }),
        startDate: '2026-08-01',
        endDate: '2026-10-30',
        now: NOW,
    };

    it('forecasts at current pace and reports the gap in real units', () => {
        const p = projectGoal({ ...base, target: 12000 });
        expect(p.forecast).toBe(9000);
        expect(p.gap).toBe(3000); // 12000 − 9000
        expect(p.verdict).toBe('off-pace');
    });

    it('measures progress from the BASELINE, not from zero', () => {
        // Goal set when the measure already stood at 5,000; target 14,000 means
        // 9,000 of new work, which the current pace exactly delivers.
        const p = projectGoal({ ...base, target: 14000, baseline: 5000 });
        expect(p.verdict).toBe('on-track');
        // Without baseline handling this would read as badly off pace.
        expect(projectGoal({ ...base, target: 14000 }).verdict).toBe('off-pace');
    });

    it('calls a near miss at-risk rather than off-pace', () => {
        expect(projectGoal({ ...base, target: 10000 }).verdict).toBe('at-risk'); // 90%
        expect(projectGoal({ ...base, target: 9000 }).verdict).toBe('on-track');
    });

    it('returns unknown with NULLS, never zeros, on cold start', () => {
        const p = projectGoal({ ...base, runRate: deriveRunRate([], 'sessions'), target: 9000 });
        expect(p.verdict).toBe('unknown');
        expect(p.forecast).toBeNull();
        expect(p.achieved).toBeNull();
        expect(p.gap).toBeNull();
    });

    it('is unknown when there is no target (a directional goal)', () => {
        expect(projectGoal({ ...base, target: null }).verdict).toBe('unknown');
    });

    it('sizes what the pace would have to become to still land it', () => {
        const p = projectGoal({ ...base, target: 12000 });
        expect(p.requiredPerDay).toBeGreaterThan(p.forecast / p.totalDays);
        expect(p.daysRemaining).toBe(p.totalDays - p.daysElapsed);
    });

    it('clamps progress to 0–1 rather than reporting 140%', () => {
        const p = projectGoal({ ...base, target: 100 });
        expect(p.progress).toBe(1);
    });
});

describe('goalWindowAdvice — advisory, never blocking', () => {
    it('advises on a sub-month window without forbidding it', () => {
        const a = goalWindowAdvice({ startDate: '2026-08-01', endDate: '2026-08-20' });
        expect(a.level).toBe('advice');
        expect(a.message).toMatch(/campaign-shaped/);
    });

    it('says nothing about a quarter', () => {
        expect(goalWindowAdvice({ startDate: '2026-08-01', endDate: '2026-10-30' })).toBeNull();
    });

    it('flags a reversed range as an actual error', () => {
        expect(goalWindowAdvice({ startDate: '2026-10-30', endDate: '2026-08-01' }).level).toBe('error');
    });
});

describe('the measure catalogue', () => {
    it('gives every measure a metric key and a trailing window to divide by', () => {
        for (const m of Object.values(MEASURES)) {
            expect(m.metricKey).toBeTruthy();
            expect(m.trailingDays).toBeGreaterThan(0);
            expect(m.label).toBeTruthy();
        }
    });
});
