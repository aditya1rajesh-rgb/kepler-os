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
    // E30 · Studio dissolved; its children are top-level modules again. The
    // three ids never changed, so these URLs resolve directly now.
    it('renders the ex-Studio tools as top-level modules', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'seo-aeo' }).redirect)
            .toMatchObject({ moduleId: 'seo-aeo', subModuleId: 'pipeline' });
        expect(resolveWorkspaceLocation({ moduleId: 'social-media' }))
            .toEqual({ moduleId: 'social-media', subModuleId: null });
        expect(resolveWorkspaceLocation({ moduleId: 'ad-campaigns' }))
            .toEqual({ moduleId: 'ad-campaigns', subModuleId: null });
    });

    it('redirects the dissolved Studio parent to its former children', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'studio', subModuleId: 'social-media' }).redirect)
            .toMatchObject({ moduleId: 'social-media', subModuleId: null });
        expect(resolveWorkspaceLocation({ moduleId: 'studio', subModuleId: 'seo-aeo' }).redirect)
            .toMatchObject({ moduleId: 'seo-aeo', subModuleId: 'pipeline' });
        // A bare /studio goes to what led it.
        expect(resolveWorkspaceLocation({ moduleId: 'studio' }).redirect)
            .toMatchObject({ moduleId: 'seo-aeo', subModuleId: 'pipeline' });
    });

    // E30 · Prospecting made two hops: top-level → Outreach child → folded into
    // Audiences. The oldest URL must still resolve all the way through.
    it('resolves legacy top-level prospecting through to Audiences', () => {
        const r = resolveWorkspaceLocation({ moduleId: 'prospecting' }).redirect;
        expect(r).toMatchObject({ moduleId: 'outreach', subModuleId: 'audiences' });
        expect(r.search).toContain('view=find');
    });

    it('preserves query through the Studio redirect (campaign step deep-links)', () => {
        const r = resolveWorkspaceLocation({ moduleId: 'studio', subModuleId: 'seo-aeo', search: '?campaign=c1&step=s1&brief=b' });
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
    it('lands on Replies for a plain click (E30 — what needs answering)', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'outreach' }).redirect.subModuleId).toBe('replies');
    });
    it('lands on Sequences when a campaign/brand deep-link param is present', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'outreach', search: '?campaign=c1' }).redirect.subModuleId).toBe('sequences');
        expect(resolveWorkspaceLocation({ moduleId: 'outreach', search: '?list=l1' }).redirect.subModuleId).toBe('sequences');
        expect(resolveWorkspaceLocation({ moduleId: 'outreach', search: '?icp=i1' }).redirect.subModuleId).toBe('sequences');
    });
});

// E30 · S6 merged Lists + Saved + Prospecting into Audiences. A retired child
// must land on the screen that ABSORBED it, on the right view — falling through
// to the parent default would put a "Lists" bookmark on Replies, which reads as
// data loss.
describe('resolveWorkspaceLocation — retired Outreach children', () => {
    const cases = [
        ['lists', 'lists'],
        ['saved', 'saved'],
        ['prospecting', 'find'],
    ] as const;

    for (const [retired, view] of cases) {
        it(`sends /outreach/${retired} to Audiences on the ${view} view`, () => {
            const r = resolveWorkspaceLocation({ moduleId: 'outreach', subModuleId: retired }).redirect;
            expect(r).toMatchObject({ moduleId: 'outreach', subModuleId: 'audiences' });
            expect(r.search).toContain(`view=${view}`);
        });
    }

    it('keeps existing query params while adding the view', () => {
        const r = resolveWorkspaceLocation({ moduleId: 'outreach', subModuleId: 'lists', search: '?list=l1' }).redirect;
        expect(r.search).toContain('list=l1');
        expect(r.search).toContain('view=lists');
    });

    it('still renders the four live children directly', () => {
        for (const child of ['replies', 'sequences', 'audiences', 'abm']) {
            expect(resolveWorkspaceLocation({ moduleId: 'outreach', subModuleId: child }))
                .toEqual({ moduleId: 'outreach', subModuleId: child });
        }
    });
});

describe('resolveWorkspaceLocation — parents, flats, unknowns', () => {
    it('bare Studio / Measurement go to their default child', () => {
        expect(resolveWorkspaceLocation({ moduleId: 'seo-aeo' }).redirect.subModuleId).toBe('pipeline');
        // Measurement is flat again — AI Visibility moved to SEO & AEO (E30).
        expect(resolveWorkspaceLocation({ moduleId: 'measurement' })).toEqual({ moduleId: 'measurement', subModuleId: null });
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
        expect(resolveWorkspaceLocation({ moduleId: 'seo-aeo', subModuleId: 'junk' }).redirect.subModuleId).toBe('pipeline');
    });
});

describe('titleFor', () => {
    it('renames overview to Dashboard', () => {
        expect(titleFor('overview')).toEqual({ crumb: null, title: 'Dashboard' });
    });
    it('returns parent crumb + child title on a child screen', () => {
        expect(titleFor('seo-aeo', 'ai-visibility')).toEqual({ crumb: 'SEO & AEO', title: 'AI Visibility' });
    });
});

describe('getParentOf — next-step dot bubbling (with overview collision)', () => {
    it('maps re-parented children to their parents', () => {
        expect(getParentOf('ai-visibility')?.id).toBe('seo-aeo');
        expect(getParentOf('audiences')?.id).toBe('outreach');
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
    it('locks SEO & AEO by its own gate and cascades to children', () => {
        expect(isNavNodeLocked('seo-aeo', noneReady)).toBe(true);
        expect(isNavNodeLocked('ai-visibility', noneReady)).toBe(true); // inherits seoReady
        expect(isNavNodeLocked('ai-visibility', { seoReady: true })).toBe(false);
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
        expect(lockHintFor('audiences')).toMatch(/unlock/i); // inherited from outreach
        expect(lockHintFor('overview')).toBeUndefined();
    });
});
