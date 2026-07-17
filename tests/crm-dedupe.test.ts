// CRM (Zoho) de-duplication of researched contacts.
import { describe, expect, it } from 'vitest';
import { buildCrmIndex, crmMatch } from '../src/lib/crmDedupe.js';

const crm = buildCrmIndex([
    { firstName: 'Priya', lastName: 'Rao', email: 'priya@acme.com', company: 'Acme Inc' },
    { firstName: 'John', lastName: 'Smith', email: '', company: 'Globex' },
    { firstName: 'NoCompany', lastName: 'Person', email: '', company: '' },
]);

describe('crmMatch', () => {
    it('returns "email" on an email match (case-insensitive)', () => {
        expect(crmMatch({ firstName: 'X', lastName: 'Y', email: 'PRIYA@acme.com' }, crm)).toBe('email');
    });

    it('returns "name" on same name + same company (suffix-insensitive), no email', () => {
        expect(crmMatch({ firstName: 'John', lastName: 'Smith', company: 'Globex LLC' }, crm)).toBe('name');
    });

    it('does NOT match a same-named person at a clearly different company', () => {
        expect(crmMatch({ firstName: 'John', lastName: 'Smith', company: 'Initech' }, crm)).toBe('');
    });

    it('flags a same-name match when the researched contact has no company', () => {
        expect(crmMatch({ firstName: 'John', lastName: 'Smith', company: '' }, crm)).toBe('name');
    });

    it('flags a same-name match when the CRM row had no company', () => {
        expect(crmMatch({ firstName: 'NoCompany', lastName: 'Person', company: 'Whatever' }, crm)).toBe('name');
    });

    it('returns "" for an unknown person', () => {
        expect(crmMatch({ firstName: 'Zoe', lastName: 'New', email: 'zoe@new.com', company: 'New' }, crm)).toBe('');
    });

    it('returns "" when there is no index (Zoho not connected)', () => {
        expect(crmMatch({ firstName: 'Priya', lastName: 'Rao', email: 'priya@acme.com' }, null)).toBe('');
    });

    it('email match beats a company mismatch', () => {
        // Same email but different company text still counts as a confident dup.
        expect(crmMatch({ firstName: 'Priya', lastName: 'Rao', email: 'priya@acme.com', company: 'Different' }, crm)).toBe('email');
    });
});
