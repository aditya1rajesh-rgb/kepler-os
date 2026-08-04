import { describe, expect, it } from 'vitest';
import {
    expectedCtr,
    pagePath,
    aggregateByPage,
    strikingDistance,
    lowCtr,
    cannibalization,
    deadPages,
    decay,
    buildOpportunities,
} from '../src/lib/seoOperator.js';

describe('expectedCtr', () => {
    it('is monotonically non-increasing across page 1 and tiny on page 2', () => {
        expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5));
        expect(expectedCtr(5)).toBeGreaterThan(expectedCtr(10));
        expect(expectedCtr(15)).toBeLessThanOrEqual(0.01);
    });
    it('handles junk input safely', () => {
        expect(expectedCtr(0)).toBeGreaterThan(0);
        expect(expectedCtr(undefined)).toBeGreaterThan(0);
    });
});

describe('pagePath', () => {
    it('strips origin to a readable path', () => {
        expect(pagePath('https://acme.com/blog/x?a=1')).toBe('/blog/x?a=1');
        expect(pagePath('https://acme.com')).toBe('/');
        expect(pagePath('')).toBe('');
    });
});

describe('strikingDistance', () => {
    it('flags page-2 queries above the impression floor, ranked by impact', () => {
        const rows = [
            { query: 'big', position: 12, impressions: 1000, clicks: 5, ctr: 0.005 },
            { query: 'small', position: 14, impressions: 200, clicks: 1, ctr: 0.005 },
            { query: 'onpage1', position: 4, impressions: 5000, clicks: 300, ctr: 0.06 }, // excluded: page 1
            { query: 'thin', position: 15, impressions: 5, clicks: 0, ctr: 0 },            // excluded: below floor
            { query: 'toodeep', position: 40, impressions: 900, clicks: 0, ctr: 0 },       // excluded: > 20
        ];
        const out = strikingDistance(rows, { minImpressions: 20 });
        expect(out.map((o) => o.title)).toEqual(['big', 'small']);
        expect(out[0].type).toBe('striking_distance');
        expect(out[0].impact).toBeGreaterThan(out[1].impact);
    });
});

describe('lowCtr', () => {
    it('flags page-1 rankers whose CTR is far below expected', () => {
        const rows = [
            { query: 'underperformer', position: 3, impressions: 1000, clicks: 10, ctr: 0.01 }, // expected ~0.10
            { query: 'healthy', position: 3, impressions: 1000, clicks: 100, ctr: 0.10 },        // at expectation → excluded
            { query: 'lowvol', position: 2, impressions: 5, clicks: 0, ctr: 0 },                 // below floor → excluded
        ];
        const out = lowCtr(rows, { minImpressions: 30 });
        expect(out).toHaveLength(1);
        expect(out[0].title).toBe('underperformer');
        expect(out[0].metrics.expectedCtr).toBeGreaterThan(out[0].metrics.ctr);
    });
});

describe('aggregateByPage', () => {
    it('sums clicks/impressions and impression-weights position', () => {
        const rows = [
            { query: 'a', page: 'https://x.com/p', impressions: 100, clicks: 5, position: 10 },
            { query: 'b', page: 'https://x.com/p', impressions: 300, clicks: 15, position: 2 },
        ];
        const [p] = aggregateByPage(rows);
        expect(p.impressions).toBe(400);
        expect(p.clicks).toBe(20);
        expect(p.ctr).toBeCloseTo(0.05, 5);
        // weighted position = (10*100 + 2*300) / 400 = 4
        expect(p.position).toBeCloseTo(4, 5);
    });
});

describe('cannibalization', () => {
    it('flags queries where 2+ own pages compete', () => {
        const rows = [
            { query: 'crm software', page: 'https://x.com/a', impressions: 400, clicks: 8, position: 6 },
            { query: 'crm software', page: 'https://x.com/b', impressions: 300, clicks: 3, position: 9 },
            { query: 'unique', page: 'https://x.com/c', impressions: 500, clicks: 40, position: 2 }, // single page → excluded
        ];
        const out = cannibalization(rows, { minImpressions: 20 });
        expect(out).toHaveLength(1);
        expect(out[0].title).toBe('crm software');
        expect(out[0].metrics.pageCount).toBe(2);
        expect(out[0].metrics.bestPosition).toBe(6);
    });
});

describe('deadPages', () => {
    it('flags high-impression, near-zero-click pages', () => {
        const rows = [
            { page: 'https://x.com/zombie', impressions: 2000, clicks: 1, ctr: 0.0005, position: 8, queries: 12 },
            { page: 'https://x.com/good', impressions: 2000, clicks: 200, ctr: 0.1, position: 3, queries: 5 }, // healthy → excluded
            { page: 'https://x.com/tiny', impressions: 10, clicks: 0, ctr: 0, position: 20, queries: 1 },       // below floor → excluded
        ];
        const out = deadPages(rows, { minImpressions: 50 });
        expect(out).toHaveLength(1);
        expect(out[0].title).toBe('/zombie');
    });
});

describe('decay', () => {
    it('flags queries whose clicks dropped past the threshold vs prior period', () => {
        const current = [
            { query: 'slipping', clicks: 20, impressions: 800, position: 6 },
            { query: 'stable', clicks: 100, impressions: 1000, position: 3 },
        ];
        const prior = [
            { query: 'slipping', clicks: 100, impressions: 900, position: 3 }, // -80%
            { query: 'stable', clicks: 105, impressions: 1000, position: 3 },  // ~flat → excluded
        ];
        const out = decay(current, prior);
        expect(out).toHaveLength(1);
        expect(out[0].title).toBe('slipping');
        expect(out[0].impact).toBe(80);
    });

    it('ignores queries with too little prior signal', () => {
        const out = decay([{ query: 'q', clicks: 0 }], [{ query: 'q', clicks: 2 }], { minPriorClicks: 5 });
        expect(out).toEqual([]);
    });
});

describe('buildOpportunities', () => {
    it('merges all analyses into one impact-ranked list with a summary', () => {
        const res = buildOpportunities({
            queryRows: [
                { query: 'sd', position: 12, impressions: 1000, clicks: 5, ctr: 0.005 },
                { query: 'lowctr', position: 2, impressions: 2000, clicks: 20, ctr: 0.01 },
            ],
            priorQueryRows: [{ query: 'lowctr', clicks: 200, impressions: 2000 }],
            queryPageRows: [
                { query: 'dup', page: 'https://x.com/a', impressions: 400, clicks: 4, position: 7 },
                { query: 'dup', page: 'https://x.com/b', impressions: 300, clicks: 2, position: 9 },
            ],
        }, { minImpressions: 20 });

        expect(res.opportunities.length).toBeGreaterThanOrEqual(3);
        // Sorted by impact descending.
        const impacts = res.opportunities.map((o) => o.impact);
        expect([...impacts]).toEqual([...impacts].sort((a, b) => b - a));
        // Summary counts present.
        expect(Object.values(res.summary).reduce((a, b) => a + b, 0)).toBe(res.opportunities.length);
        expect(typeof res.totalImpact).toBe('number');
    });

    it('returns an empty, safe result with no data', () => {
        const res = buildOpportunities({});
        expect(res.opportunities).toEqual([]);
        expect(res.totalImpact).toBe(0);
    });
});
