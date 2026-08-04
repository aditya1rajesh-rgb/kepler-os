import { describe, expect, it } from 'vitest';
import {
    classifyMoneyType,
    isMoneyKeyword,
    routeAsset,
    routeKeywords,
    MONEY_TYPES,
    MONEY_TYPE_LABELS,
} from '../src/lib/buyIntent.js';

describe('classifyMoneyType', () => {
    const cases = [
        ['notion vs obsidian', 'comparison'],
        ['asana versus monday', 'comparison'],
        ['best hubspot alternatives', 'alternatives'],
        ['salesforce competitors', 'alternatives'],
        ['figma pricing', 'pricing'],
        ['how much does slack cost', 'pricing'],
        ['cheapest crm', 'pricing'],
        ['is ahrefs worth it', 'reviews'],
        ['semrush reviews', 'reviews'],
        ['notion free trial', 'trial'],
        ['linear demo', 'trial'],
        ['canva discount code', 'discount'],
        ['best crm for startups', 'best_for'],
        ['top 10 email tools', 'best_for'],
        ['what is a crm', 'none'],
        ['how to write a cold email', 'none'],
        ['', 'none'],
    ];
    it.each(cases)('classifies %s → %s', (term, expected) => {
        expect(classifyMoneyType(term)).toBe(expected);
    });

    it('prefers comparison over alternatives when both could match', () => {
        expect(classifyMoneyType('hubspot vs salesforce alternatives')).toBe('comparison');
    });
});

describe('isMoneyKeyword', () => {
    it('accepts a string or a keyword object', () => {
        expect(isMoneyKeyword('acme pricing')).toBe(true);
        expect(isMoneyKeyword({ term: 'what is acme' })).toBe(false);
    });
});

describe('routeAsset — publish decisions', () => {
    it('recommends BUILDING for comparison / pricing / trial', () => {
        expect(routeAsset('a vs b').publish).toBe(true);
        expect(routeAsset('acme pricing').recommendation).toBe('single_pricing_page');
        expect(routeAsset('acme free trial').recommendation).toBe('conversion_page');
    });

    it('recommends NOT self-publishing for alternatives + reviews (win off-domain)', () => {
        const alt = routeAsset('acme alternatives');
        expect(alt.publish).toBe(false);
        expect(alt.recommendation).toBe('seek_placement');

        const rev = routeAsset('acme reviews');
        expect(rev.publish).toBe(false);
        expect(rev.recommendation).toBe('off_site_proof');
    });

    it('routes informational queries to a supporting guide (still publish)', () => {
        const r = routeAsset('what is marketing automation');
        expect(r.moneyType).toBe('none');
        expect(r.publish).toBe(true);
        expect(r.recommendation).toBe('build_guide');
    });

    it('always returns action + rationale text', () => {
        for (const t of ['a vs b', 'acme alternatives', 'x reviews', 'what is x']) {
            const r = routeAsset(t);
            expect(r.action).toBeTruthy();
            expect(r.rationale).toBeTruthy();
        }
    });
});

describe('routeKeywords', () => {
    it('splits a list into build vs off-domain and counts money keywords', () => {
        const res = routeKeywords([
            { term: 'a vs b' },          // build
            { term: 'acme pricing' },    // build
            { term: 'acme alternatives' }, // off-domain
            { term: 'acme reviews' },    // off-domain
            { term: 'what is acme' },    // build (guide), not money
        ]);
        expect(res.toBuild).toHaveLength(3);
        expect(res.offDomain).toHaveLength(2);
        expect(res.moneyCount).toBe(4);
        expect(res.routed[0].routing.moneyType).toBe('comparison');
    });
});

describe('label + type coverage', () => {
    it('every money type has a label', () => {
        for (const t of MONEY_TYPES) expect(MONEY_TYPE_LABELS[t]).toBeTruthy();
        expect(MONEY_TYPE_LABELS.none).toBeTruthy();
    });
});
