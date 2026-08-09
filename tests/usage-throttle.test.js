// E4 · view throttling. The whole point of instrumentation is that the numbers
// mean something, so the rule that decides what counts as "a screen was opened"
// is tested rather than assumed.
import { describe, expect, it } from 'vitest';
import { createViewThrottle, DEFAULT_VIEW_WINDOW_MS } from '../src/lib/usageThrottle.js';

const T0 = 1_760_000_000_000;

describe('createViewThrottle', () => {
    it('records the first view of a surface', () => {
        const t = createViewThrottle();
        expect(t.shouldRecord('seo-aeo', T0)).toBe(true);
    });

    it('collapses remounts inside the window to one view', () => {
        const t = createViewThrottle();
        t.shouldRecord('seo-aeo', T0);
        // A tab switch and a save-triggered re-render, seconds apart.
        expect(t.shouldRecord('seo-aeo', T0 + 1000)).toBe(false);
        expect(t.shouldRecord('seo-aeo', T0 + 30_000)).toBe(false);
    });

    it('counts a genuine return after the window as a second view', () => {
        const t = createViewThrottle();
        t.shouldRecord('seo-aeo', T0);
        expect(t.shouldRecord('seo-aeo', T0 + DEFAULT_VIEW_WINDOW_MS + 1)).toBe(true);
    });

    it('tracks surfaces independently — bouncing between two screens records both', () => {
        const t = createViewThrottle();
        expect(t.shouldRecord('campaigns', T0)).toBe(true);
        expect(t.shouldRecord('library', T0 + 500)).toBe(true);
        expect(t.shouldRecord('campaigns', T0 + 900)).toBe(false);
    });

    it('treats sub-tabs as distinct surfaces (that is the granularity asked for)', () => {
        const t = createViewThrottle();
        expect(t.shouldRecord('measurement-organic', T0)).toBe(true);
        expect(t.shouldRecord('measurement-paid', T0 + 100)).toBe(true);
    });

    it('ignores an empty surface rather than recording a nameless view', () => {
        const t = createViewThrottle();
        expect(t.shouldRecord('', T0)).toBe(false);
        expect(t.shouldRecord(undefined, T0)).toBe(false);
    });

    it('honours a custom window', () => {
        const t = createViewThrottle({ windowMs: 1000 });
        t.shouldRecord('x', T0);
        expect(t.shouldRecord('x', T0 + 500)).toBe(false);
        expect(t.shouldRecord('x', T0 + 1001)).toBe(true);
    });
});
