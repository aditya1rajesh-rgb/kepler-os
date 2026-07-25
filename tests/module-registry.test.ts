// The whole legacy→canonical redirect table lives in resolveWorkspaceLocation. These
// lock the contract every old URL and deep-link depends on.
import { describe, expect, it } from 'vitest';
import {
    resolveWorkspaceLocation,
    titleFor,
    getParentOf,
    isNavNodeLocked,
    lockHintFor,
} from '../src/constants/moduleRegistry.js';

describe('resolveWorkspaceLocation — legacy top-level redirects', () => {
    it('re-parents Studio tools', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'seo-aeo' }).redirect)
            .toMatchObject({ moduleId: 'studio', subModuleId: 'seo-aeo' });
        expect(resolveWorkspaceLocation({ moduleId: 'social-media' }).redirect)
            .toMatchObject({ moduleId: 'studio', subModuleId: 'social-media' });
        expect(resolveWorkspaceLocation({ moduleId: 'ad-campaigns' }).redirect)
            .toMatchObject({ moduleId: 'studio', subModuleId: 'ad-campaigns' });
    });

    it('re-parents legacy top-level prospecting under Outreach', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'prospecting' }).redirect)
            .toMatchObject({ moduleId: 'outreach', subModuleId: 'prospecting' });
    });

    it('preserves query on legacy redirects (campaign step deep-links)', () => {
        const r = resolveWorkspaceLocation({ moduleId: 'seo-aeo', search: '?campaign=c1&step=s1&brief=b' });
        expect(r.redirect.search).toBe('?campaign=c1&step=s1&brief=b');
    });
});

describe('resolveWorkspaceLocation — Brand Intelligence ?tab=', () => {
    it('converts ?tab=<child> to a subModuleId and strips the param', () => {
        const r = resolveWorkspaceLocation({ moduleId: 'brand-intelligence', search: '?tab=audience' });
        expect(r.redirect).toMatchObject({ moduleId: 'brand-intelligence', subModuleId: 'audience' });
        expect(r.redirect.search).toBe('');
    });
    it('keeps other params while stripping tab', () => {
        const r = resolveWorkspaceLocation({ moduleId: 'brand-intelligence', search: '?tab=audience&icp=42' });
        expect(r.redirect.subModuleId).toBe('audience');
        expect(r.redirect.search).toBe('?icp=42');
    });
    it('bare Brand Intelligence falls to its default child', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'brand-intelligence' }).redirect)
            .toMatchObject({ moduleId: 'brand-intelligence', subModuleId: 'overview' });
    });
    it('renders a valid child directly', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'brand-intelligence', subModuleId: 'competitors' }))
            .toEqual({ moduleId: 'brand-intelligence', subModuleId: 'competitors' });
    });
});

describe('resolveWorkspaceLocation — Outreach context-aware default', () => {
    it('lands on ABM for a plain click', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'outreach' }).redirect.subModuleId).toBe('abm');
    });
    it('lands on Sequences when a campaign/brand deep-link param is present', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'outreach', search: '?campaign=c1' }).redirect.subModuleId).toBe('sequences');
        expect(resolveWorkspaceLocation({ moduleId: 'outreach', search: '?list=l1' }).redirect.subModuleId).toBe('sequences');
        expect(resolveWorkspaceLocation({ moduleId: 'outreach', search: '?icp=i1' }).redirect.subModuleId).toBe('sequences');
    });
});

describe('resolveWorkspaceLocation — parents, flats, unknowns', () => {
    it('bare Studio / Measurement go to their default child', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'studio' }).redirect.subModuleId).toBe('seo-aeo');
        expect(resolveWorkspaceLocation({ moduleId: 'measurement' }).redirect.subModuleId).toBe('performance');
    });
    it('unknown module falls to Dashboard', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'nonsense' }).redirect)
            .toMatchObject({ moduleId: 'overview', subModuleId: null });
    });
    it('flat module renders directly and drops junk subModuleId', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'overview' })).toEqual({ moduleId: 'overview', subModuleId: null });
        expect(resolveWorkspaceLocation({ moduleId: 'campaigns', subModuleId: 'junk' }).redirect)
            .toMatchObject({ moduleId: 'campaigns', subModuleId: null });
    });
    it('an invalid child under a parent redirects to the default child', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'measurement', subModuleId: 'junk' }).redirect.subModuleId).toBe('performance');
    });
});

describe('titleFor', () => {
    it('renames overview to Dashboard', () => {
        expect(titleFor('overview')).toEqual({ crumb: null, title: 'Dashboard' });
    });
    it('returns parent crumb + child title on a child screen', () => {
        expect(titleFor('studio', 'social-media')).toEqual({ crumb: 'Studio', title: 'Social Media' });
    });
});

describe('getParentOf — next-step dot bubbling (with overview collision)', () => {
    it('maps re-parented children to their parents', () => {
        expect(getParentOf('seo-aeo')?.id).toBe('studio');
        expect(getParentOf('prospecting')?.id).toBe('outreach');
        expect(getParentOf('performance')?.id).toBe('measurement');
    });
    it('does NOT treat overview as a child (top-level Dashboard wins)', () => {
        expect(getParentOf('overview')).toBeNull();
    });
});

describe('isNavNodeLocked', () => {
    const noneReady = { seoReady: false, adsReady: false, socialReady: false, outreachReady: false };
    const someReady = { seoReady: true, adsReady: false, socialReady: false, outreachReady: false };

    it('locks a gated leaf by its own gate', () => {
        expect(isNavNodeLocked('seo-aeo', noneReady)).toBe(true);
        expect(isNavNodeLocked('seo-aeo', someReady)).toBe(false);
    });
    it('locks Studio only when ALL its children are locked', () => {
        expect(isNavNodeLocked('studio', noneReady)).toBe(true);
        expect(isNavNodeLocked('studio', someReady)).toBe(false); // seo unlocked
    });
    it('locks Outreach by its own gate and cascades to children', () => {
        expect(isNavNodeLocked('outreach', noneReady)).toBe(true);
        expect(isNavNodeLocked('abm', noneReady)).toBe(true); // inherits outreachReady
        expect(isNavNodeLocked('abm', { outreachReady: true })).toBe(false);
    });
    it('never locks Dashboard, Measurement, or Brand Intelligence', () => {
        expect(isNavNodeLocked('overview', noneReady)).toBe(false);
        expect(isNavNodeLocked('measurement', noneReady)).toBe(false);
        expect(isNavNodeLocked('brand-intelligence', noneReady)).toBe(false);
    });
    it('exposes an unlock hint for gated nodes', () => {
        expect(lockHintFor('seo-aeo')).toMatch(/unlock/i);
        expect(lockHintFor('prospecting')).toMatch(/unlock/i); // inherited from outreach
        expect(lockHintFor('overview')).toBeUndefined();
    });
});
