import { describe, it, expect } from 'vitest';
import { mergeScoredContacts } from '../src/services/abmNormalize.js';

const cands = [
    { externalId: 'a1', firstName: 'Ari', lastName: 'Balogh', title: 'VP Infra', company: 'Airbnb', linkedinUrl: 'https://linkedin.com/in/aribalogh', seniority: 'vp', email: '' },
    { externalId: 'a2', firstName: 'Jane', lastName: 'Doe', title: 'CTO', company: 'Airbnb', linkedinUrl: 'https://linkedin.com/in/janedoe', seniority: 'c_suite', email: '' },
    { externalId: 'a3', firstName: 'Bob', lastName: 'Junior', title: 'SDR', company: 'Airbnb', linkedinUrl: '', seniority: 'entry', email: '' },
];

describe('mergeScoredContacts (identity comes from Apollo, scoring from the model)', () => {
    it('keeps real Apollo identity + LinkedIn, model supplies only the score', () => {
        const out = mergeScoredContacts(cands, [{ i: 0, keep: true, fitScore: 90, fitReasoning: 'owns infra', confidence: 'high' }], { companyName: 'Airbnb' });
        expect(out).toHaveLength(1);
        expect(out[0].firstName).toBe('Ari');
        expect(out[0].linkedinUrl).toBe('https://linkedin.com/in/aribalogh');
        expect(out[0].fitScore).toBe(90);
        expect(out[0].source).toBe('apollo');
        expect(out[0].email).toBe('');
        expect(out[0].flags).toContain('needs-enrichment');
    });

    it('never fabricates: model-authored name/email/LinkedIn are ignored, phantom indices dropped', () => {
        const scores = [
            { i: 0, keep: true, fitScore: 80, firstName: 'FAKE', email: 'guess@wrong.com', linkedinUrl: 'https://linkedin.com/in/fake' },
            { i: 99, keep: true, fitScore: 100 },
            { firstName: 'Ghost', title: 'CEO', fitScore: 100, keep: true },
        ];
        const out = mergeScoredContacts(cands, scores, {});
        expect(out).toHaveLength(1);
        expect(out[0].firstName).toBe('Ari');
        expect(out[0].email).toBe('');
        expect(out[0].linkedinUrl).toContain('aribalogh');
        expect(out.some((c) => c.firstName === 'Ghost' || c.firstName === 'FAKE')).toBe(false);
    });

    it('resolves by externalId when the index is missing and dedupes', () => {
        const out = mergeScoredContacts(cands, [
            { externalId: 'a2', keep: true, fitScore: 70 },
            { externalId: 'a2', keep: true, fitScore: 65 },
        ], {});
        expect(out).toHaveLength(1);
        expect(out[0].firstName).toBe('Jane');
    });

    it('drops keep:false and returns [] when there are no candidates', () => {
        expect(mergeScoredContacts([], [{ i: 0, keep: true }], {})).toHaveLength(0);
        const out = mergeScoredContacts(cands, [{ i: 0, keep: false }, { i: 1, keep: true, fitScore: 50 }], {});
        expect(out).toHaveLength(1);
        expect(out[0].firstName).toBe('Jane');
    });
});
