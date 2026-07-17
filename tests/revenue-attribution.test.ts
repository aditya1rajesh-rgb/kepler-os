// Closed-loop revenue attribution: won-stage filter, reliable reverse-join first,
// Description id8 substring fallback, and an unattributed bucket.
import { describe, expect, it } from 'vitest';
import { isWonStage, attributeDeals } from '../src/lib/revenueAttribution.js';

const campA = { id: 'aaaaaaaa-0000-0000-0000-000000000000', title: 'Alpha' };
const campB = { id: 'bbbbbbbb-0000-0000-0000-000000000000', title: 'Beta' };
const campaigns = [campA, campB];

describe('isWonStage', () => {
    it('matches Closed Won, bare Won, and is case-insensitive', () => {
        expect(isWonStage('Closed Won')).toBe(true);
        expect(isWonStage('closed won')).toBe(true);
        expect(isWonStage('Won')).toBe(true);
    });
    it('rejects open/empty stages', () => {
        expect(isWonStage('Negotiation')).toBe(false);
        expect(isWonStage('')).toBe(false);
        expect(isWonStage(null)).toBe(false);
    });
    it('honours a custom won-stage list', () => {
        expect(isWonStage('Paid', ['Paid'])).toBe(true);
    });
});

describe('attributeDeals', () => {
    const contactCampaign = new Map([['c1', campA.id]]);

    it('attributes via the reverse-join, sums won amounts, buckets the rest', () => {
        const deals = [
            { stage: 'Closed Won', amount: 1000, contactId: 'c1', description: '' },
            { stage: 'closed won', amount: 500, contactId: 'cX', description: 'ref campaign-bbbbbbbb here' },
            { stage: 'Negotiation', amount: 999, contactId: 'c1', description: '' }, // not won → ignored
            { stage: 'Won', amount: 250, contactId: 'cZ', description: 'no tag' },   // won but unattributable
        ];
        const { byCampaign, wonTotal, attributedCount } = attributeDeals(deals, { contactCampaign, campaigns });
        expect(byCampaign[campA.id]).toMatchObject({ revenue: 1000, wonDeals: 1 });
        expect(byCampaign[campB.id]).toMatchObject({ revenue: 500, wonDeals: 1 });
        expect(byCampaign.__unattributed__).toMatchObject({ revenue: 250, wonDeals: 1 });
        expect(wonTotal).toBe(3);
        expect(attributedCount).toBe(2);
    });

    it('prefers the reverse-join over a conflicting Description tag', () => {
        const deals = [{ stage: 'Won', amount: 42, contactId: 'c1', description: 'campaign-bbbbbbbb' }];
        const { byCampaign } = attributeDeals(deals, { contactCampaign, campaigns });
        expect(byCampaign[campA.id]?.revenue).toBe(42); // c1 → campA wins over the campB tag
        expect(byCampaign[campB.id]).toBeUndefined();
    });

    it('tolerates junk input', () => {
        expect(attributeDeals(undefined, {}).wonTotal).toBe(0);
        expect(attributeDeals([{ stage: 'Won', amount: 'nan' }], {}).byCampaign.__unattributed__.revenue).toBe(0);
    });
});
