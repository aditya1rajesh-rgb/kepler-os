// E10 · continuous goal recommendation. "This campaign plausibly delivers ~1,500
// sessions" is the most confident sentence in the product, and it is computed
// from a handful of trailing readings. These tests are about when Kepler is
// allowed to say it at all.
import { describe, expect, it } from 'vitest';
import {
    MIN_SAMPLE,
    buildBrief,
    campaignYields,
    channelHint,
    recommendForGoal,
} from '../src/lib/goalRecommendation.js';

const NOW = new Date('2026-08-09T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const goal = {
    id: 'g1', name: 'Q4 organic pipeline', kind: 'measured',
    measure: 'sessions', target: 12000, endDate: '2026-11-07',
};

const projection = { gap: 2400, daysRemaining: 42, verdict: 'off-pace' };

const campaign = (id, days) => ({ id, title: `Campaign ${id}`, createdAt: daysAgo(days) });
const snap = (id, sessions) => ({ [id]: { metrics: { sessions } } });

describe('campaignYields', () => {
    const campaigns = [campaign('a', 90), campaign('b', 70), campaign('c', 3), campaign('d', 60)];
    const snapshots = { ...snap('a', 800), ...snap('b', 1900), ...snap('c', 50), ...snap('d', 300) };

    it('reads each campaign\'s own level on the goal\'s measure', () => {
        const ys = campaignYields(campaigns, snapshots, { measure: 'sessions', now: NOW });
        expect(ys.map((y) => y.value).sort((a, b) => a - b)).toEqual([300, 800, 1900]);
    });

    it('drops campaigns too young to have produced their level', () => {
        // A three-day-old campaign inherited a 28-day window that mostly predates
        // it. Counting it drags the median down and inflates every "campaigns
        // needed" number that follows.
        const ys = campaignYields(campaigns, snapshots, { measure: 'sessions', now: NOW });
        expect(ys.find((y) => y.campaignId === 'c')).toBeUndefined();
    });

    it('ignores campaigns with no reading rather than counting them as zero', () => {
        const ys = campaignYields([campaign('x', 60)], {}, { measure: 'sessions', now: NOW });
        expect(ys).toEqual([]);
    });
});

describe('recommendForGoal — the refusals', () => {
    it('says nothing numeric about a directional goal', () => {
        const r = recommendForGoal({ goal: { ...goal, kind: 'directional' }, projection, yields: [] });
        expect(r.status).toBe('not-measured');
        expect(r.brief).toBe('');
        expect(r.workings).toEqual([]);
    });

    it('refuses to size against a gap it cannot compute', () => {
        const r = recommendForGoal({ goal, projection: { gap: null, verdict: 'unknown', daysRemaining: 42 }, yields: [] });
        expect(r.status).toBe('no-standing');
        expect(r.headline).toMatch(/not enough measured history/i);
    });

    it('will not estimate from fewer than three measured campaigns', () => {
        const yields = [{ campaignId: 'a', value: 800, days: 90 }, { campaignId: 'b', value: 1900, days: 70 }];
        const r = recommendForGoal({ goal, projection, yields });
        expect(r.status).toBe('insufficient-evidence');
        expect(r.estimate).toBeUndefined();
        // It still states the gap — that is measured — and still offers work.
        expect(r.headline).toContain('2,400');
        expect(r.brief).toContain('2,400');
        expect(r.workings.join(' ')).toMatch(/industry average/i);
        expect(MIN_SAMPLE).toBe(3);
    });

    it('says so plainly when there is nothing to learn from at all', () => {
        const r = recommendForGoal({ goal, projection, yields: [] });
        expect(r.status).toBe('insufficient-evidence');
        expect(r.workings[0]).toMatch(/no campaign/i);
    });

    it('does not ask for work when the goal is already ahead', () => {
        const r = recommendForGoal({ goal, projection: { gap: -500, daysRemaining: 42, verdict: 'on-track' }, yields: [] });
        expect(r.status).toBe('no-gap');
        expect(r.headline).toMatch(/ahead of pace/i);
        expect(r.brief).toBe('');
    });
});

describe('recommendForGoal — the estimate', () => {
    const yields = [
        { campaignId: 'a', value: 800, days: 60 },
        { campaignId: 'b', value: 1900, days: 70 },
        { campaignId: 'c', value: 300, days: 50 },
    ];

    it('sizes the portfolio from the median of the account\'s own campaigns', () => {
        const r = recommendForGoal({ goal, projection, yields });
        expect(r.status).toBe('ok');
        expect(r.estimate.median).toBe(800);
        expect(r.estimate.low).toBe(300);
        expect(r.estimate.high).toBe(1900);
        // 2,400 / 800 = 3
        expect(r.campaignsNeeded.mid).toBe(3);
        // At the best campaign's rate, 2; at the weakest, 8.
        expect(r.campaignsNeeded.low).toBe(2);
        expect(r.campaignsNeeded.high).toBe(8);
    });

    it('shows its working, including that these are trailing levels', () => {
        const r = recommendForGoal({ goal, projection, yields });
        expect(r.workings.join(' ')).toContain('300–1,900');
        expect(r.workings.join(' ')).toContain('median 800');
        expect(r.workings.join(' ')).toMatch(/trailing levels/i);
    });

    it('warns when the window is shorter than a campaign takes to deliver', () => {
        // Median campaign took 60 days; 21 remain. Proposing work that cannot
        // land before the goal resolves is worse than proposing nothing.
        const r = recommendForGoal({ goal, projection: { ...projection, daysRemaining: 21 }, yields });
        expect(r.tooLate).toBe(true);
        expect(r.workings.join(' ')).toMatch(/unlikely to land inside this goal/i);
    });

    it('does not warn when there is time', () => {
        // 90 days left against a 60-day median: the work can land.
        expect(recommendForGoal({ goal, projection: { ...projection, daysRemaining: 90 }, yields }).tooLate).toBe(false);
    });

    it('never asks for fewer than one campaign, however small the gap', () => {
        const r = recommendForGoal({ goal, projection: { ...projection, gap: 12 }, yields });
        expect(r.campaignsNeeded.mid).toBe(1);
    });
});

describe('buildBrief', () => {
    it('carries the gap and the deadline, and never the estimate', () => {
        // The brief becomes the campaign's own goal text. "Should deliver ~800
        // sessions" would read later as a promise Kepler made on its behalf.
        const brief = buildBrief({ goal, gap: 2400, daysRemaining: 42, unit: 'sessions' });
        expect(brief).toContain('2,400 sessions');
        expect(brief).toContain('within 42 days');
        expect(brief).toContain(goal.name);
        expect(brief).not.toMatch(/~|plausibl|estimat/i);
    });
});

describe('channelHint', () => {
    const row = (production, sessions) => ({ production, source: 'Organic', sessions });

    it('names a wing only when it is clearly ahead', () => {
        const hint = channelHint([row('SEO', 3000), row('Outreach', 400), row('Other', 9000)]);
        expect(hint.production).toBe('SEO');
        expect(hint.evidence).toContain('3,000');
    });

    it('stays silent on a near-tie rather than rotating its advice', () => {
        expect(channelHint([row('SEO', 1000), row('Outreach', 900)])).toBeNull();
    });

    it('ignores what Kepler did not produce', () => {
        // Other— rows are real traffic and not a wing anyone can be told to do more of.
        expect(channelHint([row('Other', 9000), row('SEO', 100)])).toBeNull();
    });
});
