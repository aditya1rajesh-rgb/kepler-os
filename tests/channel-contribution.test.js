// E5 zone 5 · the production—source compound key. The dangerous number here is
// a contribution share: it is trivially inflated by dividing Kepler's work by
// Kepler's work, and nobody reading "SEO — 62%" can tell which denominator was
// used. These tests pin the denominator, the Other rows, and the caveats.
import { describe, expect, it } from 'vitest';
import {
    buildContribution,
    contributionCaveats,
    contributionKey,
    hasSourceBreakdown,
    normalizeSource,
    productionFor,
    snapshotsToRows,
} from '../src/lib/channelContribution.js';

// id8 is what attribution matches on, so the fixtures need real-shaped ids.
const intake = {
    id: '60e02a76-3920-45d7-893d-7aac11941b2b',
    title: 'Intake 2027',
    plan: { channelMix: ['seo-aeo', 'outreach', 'social-media'] },
};
const seoOnly = {
    id: 'aa11bb22-0000-4000-8000-000000000000',
    title: 'Migration guide push',
    plan: { channelMix: ['seo-aeo'] },
};
const campaigns = [intake, seoOnly];

const utm = (c) => `whatever-slug-${c.id.slice(0, 8)}`;

const row = (campaign, source, medium, sessions, conversions = 0) => ({
    campaign, source, medium, sessions, users: sessions, conversions,
});

describe('normalizeSource', () => {
    it('names the engine on organic search and stays generic without one', () => {
        expect(normalizeSource('google', 'organic')).toBe('Organic Google');
        expect(normalizeSource('(organic)', 'organic')).toBe('Organic');
    });

    it('folds GA4 direct spellings into one Direct', () => {
        expect(normalizeSource('(direct)', '(none)')).toBe('Direct');
        expect(normalizeSource('direct', 'none')).toBe('Direct');
    });

    it('strips domain noise so one platform is one source', () => {
        expect(normalizeSource('linkedin.com', 'referral')).toBe('LinkedIn');
        expect(normalizeSource('lnkd.in', 'referral')).toBe('LinkedIn');
        expect(normalizeSource('l.facebook.com', 'referral')).toBe('Facebook');
    });

    it('says Unknown rather than inventing a source', () => {
        expect(normalizeSource('', '')).toBe('Unknown');
    });
});

describe('productionFor', () => {
    it('is Other for anything Kepler did not tag', () => {
        expect(productionFor(null, 'organic')).toBe('Other');
    });

    it('reads the medium Kepler minted', () => {
        expect(productionFor(intake, 'email')).toBe('Outreach');
        expect(productionFor(intake, 'cpc')).toBe('Paid');
        expect(productionFor(intake, 'paid_social')).toBe('Paid');
        expect(productionFor(intake, 'social')).toBe('Social');
    });

    it('falls back to the mix only when the campaign has one wing', () => {
        expect(productionFor(seoOnly, 'referral')).toBe('SEO');
    });

    it('says Campaign — not a guessed wing — when the mix is ambiguous', () => {
        // Three wings, no usable medium: picking one would be a coin toss.
        expect(productionFor(intake, 'referral')).toBe('Campaign');
        expect(productionFor({ id: 'x', plan: {} }, '')).toBe('Campaign');
    });
});

describe('buildContribution', () => {
    const rows = [
        row(utm(intake), 'sendgrid', 'email', 400, 12),
        row(utm(intake), 'linkedin.com', 'paid_social', 300, 6),
        row(utm(seoOnly), 'google', 'organic', 200, 4),
        row('(organic)', 'google', 'organic', 900, 9),
        row('(direct)', '(direct)', '(none)', 200, 2),
    ];

    it('keys every row as production—source', () => {
        const { contributions } = buildContribution(rows, campaigns);
        const keys = contributions.map((c) => c.key);
        expect(keys).toContain('Outreach—Sendgrid');
        expect(keys).toContain('Paid—LinkedIn');
        expect(keys).toContain('SEO—Organic Google');
        expect(keys).toContain('Other—Organic Google');
        expect(keys).toContain('Other—Direct');
    });

    it('keeps what Kepler did not produce as rows, not a footnote', () => {
        const { contributions, totalSessions, attributedSessions, attributedShare } = buildContribution(rows, campaigns);
        expect(totalSessions).toBe(2000);
        expect(attributedSessions).toBe(900);
        expect(attributedShare).toBeCloseTo(0.45, 5);
        const other = contributions.filter((c) => c.production === 'Other');
        expect(other.reduce((s, c) => s + c.sessions, 0)).toBe(1100);
    });

    it('takes share over the WHOLE picture, never over the attributed slice', () => {
        const { contributions } = buildContribution(rows, campaigns);
        const outreach = contributions.find((c) => c.key === 'Outreach—Sendgrid');
        // 400 / 2000 — not 400 / 900, which would read as 44% and flatter Kepler.
        expect(outreach.share).toBeCloseTo(0.2, 5);
        const sum = contributions.reduce((s, c) => s + c.share, 0);
        expect(sum).toBeCloseTo(1, 5);
    });

    it('merges rows that share a key and records the campaigns behind them', () => {
        const merged = buildContribution([
            row(utm(intake), 'sendgrid', 'email', 100),
            row(utm(seoOnly), 'sendgrid', 'email', 50),
        ], campaigns);
        expect(merged.contributions).toHaveLength(1);
        expect(merged.contributions[0].sessions).toBe(150);
        expect(merged.contributions[0].campaignIds).toEqual([intake.id, seoOnly.id]);
    });

    it('sorts by contribution, descending', () => {
        const { contributions } = buildContribution(rows, campaigns);
        expect(contributions[0].key).toBe('Other—Organic Google');
        expect(contributions.map((c) => c.sessions)).toEqual([...contributions.map((c) => c.sessions)].sort((a, b) => b - a));
    });

    it('folds out-of-goal campaigns into Other rather than widening the scope', () => {
        // Drilling from a goal must not credit it with a sibling campaign's work.
        const { contributions, attributedSessions } = buildContribution(rows, campaigns, {
            goalCampaignIds: [seoOnly.id],
        });
        expect(attributedSessions).toBe(200);
        expect(contributions.find((c) => c.key === 'Outreach—Sendgrid')).toBeUndefined();
        expect(contributions.find((c) => c.key === 'Other—Sendgrid').sessions).toBe(400);
    });

    it('returns null share and null attributed share on cold start, never 0', () => {
        const empty = buildContribution([], campaigns);
        expect(empty.contributions).toEqual([]);
        expect(empty.attributedShare).toBeNull();
        expect(empty.totalSessions).toBe(0);
    });
});

describe('snapshotsToRows', () => {
    it('fans a stored bySource map back out into rows', () => {
        const rows = snapshotsToRows([{
            campaignId: intake.id,
            metrics: {
                sessions: 700, users: 700, conversions: 18,
                bySource: {
                    'sendgrid|email': { sessions: 400, users: 400, conversions: 12 },
                    'linkedin.com|paid_social': { sessions: 300, users: 300, conversions: 6 },
                },
            },
        }]);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ campaignId: intake.id, source: 'sendgrid', medium: 'email', sessions: 400 });
    });

    it('keeps pre-source snapshots as one Unknown row instead of dropping them', () => {
        // Dropping them would shrink the total that every share is taken over,
        // which inflates every remaining row.
        const rows = snapshotsToRows([{ campaignId: null, metrics: { sessions: 500, conversions: 5 } }]);
        expect(rows).toEqual([{ campaignId: null, source: '', medium: '', sessions: 500, users: 0, conversions: 5 }]);
        const { contributions } = buildContribution(rows, campaigns);
        expect(contributions[0].key).toBe('Other—Unknown');
        expect(contributions[0].sessions).toBe(500);
    });

    it('reports whether any snapshot carries the split', () => {
        expect(hasSourceBreakdown([{ metrics: { sessions: 1 } }])).toBe(false);
        expect(hasSourceBreakdown([{ metrics: { bySource: { 'google|organic': { sessions: 1 } } } }])).toBe(true);
    });

    it('matches snapshots by id, not by utm string', () => {
        const rows = snapshotsToRows([{
            campaignId: seoOnly.id,
            metrics: { bySource: { 'google|organic': { sessions: 120, conversions: 3 } } },
        }]);
        const { contributions, attributedSessions } = buildContribution(rows, campaigns);
        expect(contributions[0].key).toBe('SEO—Organic Google');
        expect(attributedSessions).toBe(120);
    });
});

describe('contributionCaveats', () => {
    it('always states the organic gap — it never stops being true', () => {
        const ids = contributionCaveats({ paidConnected: true }).map((c) => c.id);
        expect(ids).toEqual(['organic-unattributable']);
    });

    it('says paid is missing entirely rather than charting around it', () => {
        const ids = contributionCaveats({ paidConnected: false }).map((c) => c.id);
        expect(ids).toContain('no-paid');
    });

    it('flags snapshots taken before the source dimension existed', () => {
        const ids = contributionCaveats({ paidConnected: true, hasSourceBreakdown: false }).map((c) => c.id);
        expect(ids).toContain('no-source');
    });
});

describe('contributionKey', () => {
    it('uses an em dash so the two halves never read as one word', () => {
        expect(contributionKey('SEO', 'Organic')).toBe('SEO—Organic');
    });
});
