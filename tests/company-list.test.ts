// CSV/paste company-list parsing for batch ABM research.
import { describe, expect, it } from 'vitest';
import { parseCompanyList, MAX_COMPANIES } from '../src/lib/companyList.js';

describe('parseCompanyList', () => {
    it('parses one company per line (name only)', () => {
        expect(parseCompanyList('Acme\nStripe')).toEqual([
            { name: 'Acme', website: '' },
            { name: 'Stripe', website: '' },
        ]);
    });

    it('parses name,website rows and normalizes the domain', () => {
        expect(parseCompanyList('Acme, https://acme.com/careers\nStripe,stripe.com')).toEqual([
            { name: 'Acme', website: 'acme.com' },
            { name: 'Stripe', website: 'stripe.com' },
        ]);
    });

    it('accepts tab-separated columns', () => {
        expect(parseCompanyList('Acme\tacme.com')).toEqual([{ name: 'Acme', website: 'acme.com' }]);
    });

    it('drops a leading header row', () => {
        expect(parseCompanyList('Company,Website\nAcme,acme.com')).toEqual([{ name: 'Acme', website: 'acme.com' }]);
        expect(parseCompanyList('name\nAcme')).toEqual([{ name: 'Acme', website: '' }]);
    });

    it('does NOT drop a real company that merely starts with a header word', () => {
        expect(parseCompanyList('Company X\nName.com Inc')).toEqual([
            { name: 'Company X', website: '' },
            { name: 'Name.com Inc', website: '' },
        ]);
    });

    it('ignores blank lines and trims whitespace', () => {
        expect(parseCompanyList('\n  Acme  \n\n  Stripe \n')).toEqual([
            { name: 'Acme', website: '' },
            { name: 'Stripe', website: '' },
        ]);
    });

    it('dedupes by lowercased name', () => {
        expect(parseCompanyList('Acme\nacme\nACME')).toEqual([{ name: 'Acme', website: '' }]);
    });

    it('blanks an invalid website but keeps the company', () => {
        expect(parseCompanyList('Acme,not a url')).toEqual([{ name: 'Acme', website: '' }]);
    });

    it('caps the list at MAX_COMPANIES', () => {
        const raw = Array.from({ length: MAX_COMPANIES + 20 }, (_, i) => `Co${i}`).join('\n');
        expect(parseCompanyList(raw)).toHaveLength(MAX_COMPANIES);
    });

    it('respects a custom max', () => {
        expect(parseCompanyList('A\nB\nC\nD', { max: 2 })).toHaveLength(2);
    });

    it('handles empty / non-string input', () => {
        expect(parseCompanyList('')).toEqual([]);
        // @ts-expect-error runtime guard for non-string
        expect(parseCompanyList(null)).toEqual([]);
    });
});
