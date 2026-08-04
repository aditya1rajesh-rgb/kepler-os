import { describe, expect, it } from 'vitest';
import {
    CAPABILITIES,
    PLATFORM_CAPABILITY_KEYS,
    resolveCapability,
    resolveCapabilities,
    isCapabilityConfigured,
} from '../src/lib/capabilities.js';

describe('resolveCapability', () => {
    it('returns null for an unknown capability', () => {
        expect(resolveCapability('nope')).toBeNull();
    });

    it('always-on capabilities are configured with no context', () => {
        const g = resolveCapability('grounding');
        expect(g.configured).toBe(true);
        expect(g.alwaysOn).toBe(true);
        expect(g.missing).toEqual([]);
        expect(resolveCapability('page_reader').configured).toBe(true);
    });

    describe('workspace scope', () => {
        it('is unconfigured when the required connector is not connected', () => {
            const c = resolveCapability('gsc_operator', { connectedProviders: [] });
            expect(c.configured).toBe(false);
            expect(c.missing).toEqual(['gsc']);
            expect(c.connectHint).toMatch(/Search Console/i);
        });

        it('is configured when the required connector is connected', () => {
            const c = resolveCapability('gsc_operator', { connectedProviders: ['gsc', 'ga4'] });
            expect(c.configured).toBe(true);
            expect(c.missing).toEqual([]);
        });

        it('ignores platform booleans for a workspace-scoped capability', () => {
            const c = resolveCapability('cms_publish', { platform: { wordpress: true }, connectedProviders: [] });
            expect(c.configured).toBe(false); // wordpress must be a CONNECTED provider, not a platform bool
        });
    });

    describe('platform scope — all mode', () => {
        it('is unconfigured when the secret is absent', () => {
            const c = resolveCapability('serp_metrics', { platform: {} });
            expect(c.configured).toBe(false);
            expect(c.missing).toEqual(['serp_metrics']);
        });

        it('is configured when the secret is present', () => {
            const c = resolveCapability('serp_metrics', { platform: { serp_metrics: true } });
            expect(c.configured).toBe(true);
        });

        it('treats non-true values as absent', () => {
            expect(resolveCapability('serp_metrics', { platform: { serp_metrics: 'yes' } }).configured).toBe(false);
            expect(resolveCapability('serp_metrics', { platform: { serp_metrics: 1 } }).configured).toBe(false);
        });
    });

    describe('platform scope — any mode (ai_visibility)', () => {
        it('is unconfigured when no surface key is present', () => {
            const c = resolveCapability('ai_visibility', { platform: {} });
            expect(c.configured).toBe(false);
            expect(c.missing).toEqual(['visibility_perplexity', 'visibility_openai', 'visibility_anthropic']);
        });

        it('is configured when ANY one surface key is present', () => {
            const c = resolveCapability('ai_visibility', { platform: { visibility_perplexity: true } });
            expect(c.configured).toBe(true);
            expect(c.missing).toEqual([]); // no missing surfaced once satisfied
        });

        it('apify unlocks both ai_overviews and mention_finder', () => {
            const ctx = { platform: { apify: true } };
            expect(resolveCapability('ai_overviews', ctx).configured).toBe(true);
            expect(resolveCapability('mention_finder', ctx).configured).toBe(true);
        });
    });
});

describe('resolveCapabilities', () => {
    it('resolves every declared capability', () => {
        const map = resolveCapabilities({});
        expect(Object.keys(map).sort()).toEqual(Object.keys(CAPABILITIES).sort());
    });

    it('reflects a realistic partial context (GSC connected, no vendor keys)', () => {
        const map = resolveCapabilities({ platform: {}, connectedProviders: ['gsc'] });
        expect(map.gsc_operator.configured).toBe(true);
        expect(map.serp_metrics.configured).toBe(false);
        expect(map.ai_visibility.configured).toBe(false);
        expect(map.grounding.configured).toBe(true); // always on
    });
});

describe('isCapabilityConfigured', () => {
    it('is a boolean convenience over resolveCapability', () => {
        expect(isCapabilityConfigured('grounding')).toBe(true);
        expect(isCapabilityConfigured('serp_metrics', { platform: { serp_metrics: true } })).toBe(true);
        expect(isCapabilityConfigured('serp_metrics')).toBe(false);
        expect(isCapabilityConfigured('unknown')).toBe(false);
    });
});

describe('PLATFORM_CAPABILITY_KEYS', () => {
    it('covers exactly the platform-secret keys referenced by platform capabilities', () => {
        const referenced = new Set();
        for (const cap of Object.values(CAPABILITIES)) {
            if (cap.scope === 'platform' && !cap.alwaysOn) cap.requires.forEach((r) => referenced.add(r));
        }
        expect([...referenced].sort()).toEqual([...PLATFORM_CAPABILITY_KEYS].sort());
    });
});
