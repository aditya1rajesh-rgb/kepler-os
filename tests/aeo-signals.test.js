import { describe, expect, it } from 'vitest';
import { computeAeoSignals, stripMarkdown } from '../src/lib/aeoSignals.js';

describe('stripMarkdown', () => {
    it('removes markup and code fences, keeps link text', () => {
        expect(stripMarkdown('## Title\n\nSome [anchor](https://x.com) text.')).toBe('Title Some anchor text.');
        expect(stripMarkdown('```js\ncode\n```\nafter')).toBe('after');
    });
});

describe('computeAeoSignals — Princeton levers', () => {
    it('counts citations (links, bare urls, attributions)', () => {
        const md = 'Per Gartner, adoption rose. See [study](https://a.com) and https://b.com for detail. According to Forrester, more.';
        const s = computeAeoSignals(md);
        expect(s.citationCount).toBeGreaterThanOrEqual(4);
        expect(s.citationDensityPer100Words).toBeGreaterThan(0);
    });

    it('counts stats and quotes', () => {
        const md = 'Revenue grew 37% to $1,200,000 in 2025. The CEO said “this is the fastest growth we have ever recorded here”.';
        const s = computeAeoSignals(md);
        expect(s.statCount).toBeGreaterThanOrEqual(2);
        expect(s.quoteCount).toBe(1);
    });

    it('flags keyword stuffing when one word dominates', () => {
        const stuffed = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 'widget' : `filler${i}`)).join(' ');
        const s = computeAeoSignals(stuffed);
        expect(s.topWord).toBe('widget');
        expect(s.keywordStuffed).toBe(true);
    });

    it('does not flag natural, varied prose', () => {
        const natural = 'Marketing teams face many different challenges across channels, budgets, audiences, and timelines every quarter without any single word dominating the writing here today.';
        const s = computeAeoSignals(natural);
        expect(s.keywordStuffed).toBe(false);
    });

    it('validates title + meta length windows', () => {
        const s = computeAeoSignals('body', { title: 'A'.repeat(50), metaDescription: 'B'.repeat(140) });
        expect(s.titleLengthOk).toBe(true);
        expect(s.metaDescriptionOk).toBe(true);
        const bad = computeAeoSignals('body', { title: 'short', metaDescription: 'short' });
        expect(bad.titleLengthOk).toBe(false);
        expect(bad.metaDescriptionOk).toBe(false);
    });
});
