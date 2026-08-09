// E22 · the ICP targeting block. It exists so S8's renditions can produce
// firmographic targeting, so the contract that matters is: only values a
// platform could actually select survive, and what a platform cannot use is
// reported rather than dropped in silence.
import { describe, expect, it } from 'vitest';
import {
    COMPANY_SIZE_BANDS,
    EMPTY_ICP_TARGETING,
    INDUSTRIES,
    PLATFORM_TARGETING_SUPPORT,
    describeTargeting,
    hasTargeting,
    normalizeTargeting,
    targetingCompleteness,
    targetingForPlatform,
} from '../src/lib/icpTargeting.js';
import { icpDraftToPayload, icpPayloadToDraft, icpPayloadToPersona } from '../src/lib/icpContracts.js';

const full = {
    companySizeBand: '201-500',
    industry: 'education',
    revenueBand: '10m-50m',
    geographyTargets: ['India', 'Singapore'],
};

describe('normalizeTargeting', () => {
    it('accepts taxonomy values and expands industry to id + label', () => {
        const t = normalizeTargeting(full);
        expect(t.companySizeBand).toBe('201-500');
        expect(t.industry).toEqual({ id: 'education', label: 'Education' });
        expect(t.revenueBand).toBe('10m-50m');
        expect(t.geographyTargets).toEqual(['India', 'Singapore']);
    });

    it('drops values outside the taxonomy — a value no platform can select is not targeting', () => {
        const t = normalizeTargeting({ companySizeBand: '7-9', industry: 'underwater-basket-weaving', revenueBand: 'squillions' });
        expect(t).toMatchObject({ companySizeBand: '', industry: null, revenueBand: '' });
    });

    it('accepts an industry passed as an object (round-trip from storage)', () => {
        expect(normalizeTargeting({ industry: { id: 'software', label: 'stale label' } }).industry)
            .toEqual({ id: 'software', label: 'Software & SaaS' });
    });

    it('parses comma-separated geography, trims, de-dupes case-insensitively', () => {
        expect(normalizeTargeting({ geographyTargets: ' India , india,  Singapore ' }).geographyTargets)
            .toEqual(['India', 'Singapore']);
    });

    it('is total — junk in, empty block out', () => {
        expect(normalizeTargeting(undefined)).toEqual(EMPTY_ICP_TARGETING);
        expect(normalizeTargeting(null)).toEqual(EMPTY_ICP_TARGETING);
        expect(normalizeTargeting('nonsense')).toEqual(EMPTY_ICP_TARGETING);
    });
});

describe('hasTargeting / targetingCompleteness', () => {
    it('tells a usable ICP from a decorative one', () => {
        expect(hasTargeting(EMPTY_ICP_TARGETING)).toBe(false);
        expect(hasTargeting({ companySizeBand: '1-10' })).toBe(true);
        // A value outside the taxonomy is not targeting.
        expect(hasTargeting({ companySizeBand: 'enormous' })).toBe(false);
    });

    it('reports what is filled and what is missing', () => {
        const c = targetingCompleteness({ companySizeBand: '1-10', geographyTargets: ['UK'] });
        expect(c.filled.sort()).toEqual(['companySizeBand', 'geographyTargets']);
        expect(c.missing.sort()).toEqual(['industry', 'revenueBand']);
        expect(c.complete).toBe(false);
        expect(targetingCompleteness(full).complete).toBe(true);
    });
});

describe('targetingForPlatform — the rendition seam', () => {
    it('gives LinkedIn everything', () => {
        const r = targetingForPlatform('linkedin', full);
        expect(Object.keys(r.usable).sort()).toEqual(['companySizeBand', 'geographyTargets', 'industry', 'revenueBand']);
        expect(r.dropped).toEqual([]);
    });

    it('tells Meta what it cannot use rather than dropping it silently', () => {
        const r = targetingForPlatform('meta', full);
        expect(r.dropped.sort()).toEqual(['companySizeBand', 'revenueBand']);
        expect(Object.keys(r.usable).sort()).toEqual(['geographyTargets', 'industry']);
        expect(r.note).toBeTruthy();
    });

    it('is honest that Google Search has no firmographic targeting', () => {
        const r = targetingForPlatform('google', full);
        expect(Object.keys(r.usable)).toEqual(['geographyTargets']);
        expect(r.dropped.sort()).toEqual(['companySizeBand', 'industry', 'revenueBand']);
        expect(r.note).toMatch(/no firmographic targeting/i);
    });

    it('never reports an unset field as dropped', () => {
        const r = targetingForPlatform('google', { geographyTargets: ['UK'] });
        expect(r.dropped).toEqual([]);
    });

    it('returns null for a platform it does not know', () => {
        expect(targetingForPlatform('myspace', full)).toBeNull();
    });
});

describe('describeTargeting', () => {
    it('reads as a sentence fragment for prompts and read-only views', () => {
        expect(describeTargeting(full)).toBe('201–500 employees · Education · $10M–$50M · India, Singapore');
    });
    it('is empty when nothing is set', () => {
        expect(describeTargeting({})).toBe('');
    });
});

describe('ICP contract round-trip', () => {
    it('survives payload → persona details', () => {
        const persona = icpPayloadToPersona({ role: 'Registrar', targeting: full });
        expect(persona.details.targeting.industry).toEqual({ id: 'education', label: 'Education' });
        expect(persona.details.targeting.companySizeBand).toBe('201-500');
    });

    it('survives payload → draft → payload', () => {
        const draft = icpPayloadToDraft({ role: 'Registrar', segment: 'Registrar', targeting: full });
        const payload = icpDraftToPayload(draft);
        expect(payload.targeting).toEqual(normalizeTargeting(full));
    });

    it('gives an ICP with no targeting an empty block, never undefined', () => {
        const persona = icpPayloadToPersona({ role: 'Registrar' });
        expect(persona.details.targeting).toEqual(EMPTY_ICP_TARGETING);
    });
});

describe('the taxonomies themselves', () => {
    it('keeps the Apollo mapping on every size band, so ICP and prospecting agree', () => {
        expect(COMPANY_SIZE_BANDS.every((b) => /^\d+,\d+$/.test(b.apollo))).toBe(true);
    });

    it('has unique ids', () => {
        for (const list of [COMPANY_SIZE_BANDS, INDUSTRIES]) {
            expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
        }
    });

    it('declares support for every field on at least one platform', () => {
        const supported = new Set(Object.values(PLATFORM_TARGETING_SUPPORT).flatMap((p) => p.supports));
        expect([...supported].sort()).toEqual(['companySizeBand', 'geographyTargets', 'industry', 'revenueBand']);
    });
});
