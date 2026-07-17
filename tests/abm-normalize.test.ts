// ABM pipeline output validators: never trust the model raw - coerce enums,
// clamp fields, never fabricate PII, dedupe + rank contacts.
import { describe, expect, it } from 'vitest';
import {
    normalizeAccount,
    normalizeApolloQuery,
    normalizeContact,
    normalizeContacts,
} from '../src/services/abmNormalize.js';

describe('normalizeAccount', () => {
    it('coerces enums (case-insensitive) and drops invalid ones', () => {
        expect(normalizeAccount({ tier: 'Enterprise', icpFit: 'HIGH' })).toMatchObject({ tier: 'enterprise', icpFit: 'high' });
        expect(normalizeAccount({ tier: 'giant', icpFit: 'perfect' })).toMatchObject({ tier: '', icpFit: '' });
    });

    it('falls back to the searched company name and carries grounding sources', () => {
        const a = normalizeAccount({ companyName: '' }, { companyName: 'Stripe', sources: [{ title: 't', url: 'https://x.com' }] });
        expect(a.companyName).toBe('Stripe');
        expect(a.sources).toHaveLength(1);
        expect(a.status).toBe('researched');
    });

    it('falls back to the caller website hint for the domain, but the model wins', () => {
        expect(normalizeAccount({ domain: '' }, { website: 'https://acme.com/careers' }).domain).toBe('acme.com');
        expect(normalizeAccount({ domain: 'real.io' }, { website: 'ignored.com' }).domain).toBe('real.io');
    });

    it('normalizes tech signals to a bounded string array', () => {
        expect(normalizeAccount({ techSignals: ['Snowflake', '', 42] }).techSignals).toEqual(['Snowflake', '42']);
        expect(normalizeAccount({ techSignals: 'nope' }).techSignals).toEqual([]);
    });

    it('tolerates non-object input', () => {
        expect(normalizeAccount(null)).toMatchObject({ companyName: '', tier: '', icpFit: '' });
    });
});

describe('normalizeApolloQuery', () => {
    it('keeps only valid Apollo seniorities and min,max employee ranges', () => {
        const q = normalizeApolloQuery({ seniorities: ['VP', 'intern', 'director'], employeeRanges: ['1000,5000', 'big', '50'] });
        expect(q.seniorities).toEqual(['vp', 'director']);
        expect(q.employeeRanges).toEqual(['1000,5000']);
    });

    it('strips protocol/path from domains and falls back to the account domain', () => {
        expect(normalizeApolloQuery({ organizationDomains: ['https://acme.com/careers'] }).organizationDomains).toEqual(['acme.com']);
        expect(normalizeApolloQuery({}, { domain: 'fallback.io' }).organizationDomains).toEqual(['fallback.io']);
    });

    it('dedupes titles/seniorities', () => {
        const q = normalizeApolloQuery({ titles: ['CTO', 'CTO'], seniorities: ['vp', 'vp'] });
        expect(q.titles).toEqual(['CTO']);
        expect(q.seniorities).toEqual(['vp']);
    });
});

describe('normalizeContact (blank-PII rule)', () => {
    it('keeps a well-formed email', () => {
        const c = normalizeContact({ firstName: 'A', email: 'a@acme.com' });
        expect(c.email).toBe('a@acme.com');
        expect(c.flags).not.toContain('needs-enrichment');
    });

    it('blanks a malformed / locked email and flags for enrichment', () => {
        expect(normalizeContact({ title: 'CTO', email: 'email_not_unlocked@domain.com' }).email).toBe('');
        expect(normalizeContact({ title: 'CTO', email: 'not-an-email' })).toMatchObject({ email: '' });
        expect(normalizeContact({ title: 'CTO' }).flags).toContain('needs-enrichment');
    });

    it('blanks an implausible phone but keeps a real one', () => {
        expect(normalizeContact({ title: 'CTO', phone: '123' }).phone).toBe('');
        expect(normalizeContact({ title: 'CTO', phone: '+1 (415) 555-2671' }).phone).toBe('+1 (415) 555-2671');
    });

    it('clamps fit score and coerces enums', () => {
        expect(normalizeContact({ title: 'x', fitScore: 250 }).fitScore).toBe(100);
        expect(normalizeContact({ title: 'x', fitScore: -5 }).fitScore).toBe(0);
        expect(normalizeContact({ title: 'x', seniorityTier: 'wizard' }).seniorityTier).toBe('other');
        expect(normalizeContact({ title: 'x', source: 'linkedin' }).source).toBe('research');
    });
});

describe('normalizeContacts (dedupe + rank)', () => {
    it('drops empty rows, dedupes, and ranks by fit score desc', () => {
        const out = normalizeContacts([
            {},
            { firstName: 'Low', title: 'VP', email: 'low@x.com', fitScore: 30 },
            { firstName: 'High', title: 'CTO', email: 'high@x.com', fitScore: 90 },
            { firstName: 'High', title: 'CTO', email: 'high@x.com', fitScore: 90 }, // dupe by email
        ]);
        expect(out.map((c) => c.firstName)).toEqual(['High', 'Low']);
    });

    it('dedupes by externalId even when emails differ', () => {
        const out = normalizeContacts([
            { title: 'CTO', externalId: 'apollo-1', email: 'a@x.com', fitScore: 50 },
            { title: 'CTO', externalId: 'apollo-1', email: 'b@x.com', fitScore: 80 },
        ]);
        expect(out).toHaveLength(1);
    });

    it('handles non-array input', () => {
        expect(normalizeContacts(undefined)).toEqual([]);
    });
});
