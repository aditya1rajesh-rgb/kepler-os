import { describe, expect, it } from 'vitest';
import {
    buildRobots,
    AI_BOTS,
    buildLlmsTxt,
    generateIndexNowKey,
    indexNowKeyFile,
    buildIndexNowPayload,
    buildGeoReadiness,
} from '../src/lib/technicalSeo.js';

describe('buildRobots', () => {
    it('welcomes every AI bot by default and includes the sitemap', () => {
        const txt = buildRobots('https://acme.com/sitemap.xml');
        for (const bot of AI_BOTS) expect(txt).toContain(`User-agent: ${bot}`);
        expect(txt).toContain('Sitemap: https://acme.com/sitemap.xml');
    });
    it('can omit AI-bot blocks', () => {
        const txt = buildRobots('', { aiBots: false });
        expect(txt).not.toContain('GPTBot');
        expect(txt).toContain('User-agent: *');
    });
});

describe('buildLlmsTxt', () => {
    it('produces a spec-shaped llms.txt with title, summary, and links', () => {
        const txt = buildLlmsTxt({
            brandName: 'Acme',
            baseUrl: 'acme.com',
            summary: 'Acme builds widgets.',
            pages: [{ loc: 'https://acme.com/pricing', title: 'Pricing', description: 'Plans' }],
        });
        expect(txt.startsWith('# Acme')).toBe(true);
        expect(txt).toContain('> Acme builds widgets.');
        expect(txt).toContain('Canonical site: https://acme.com');
        expect(txt).toContain('- [Pricing](https://acme.com/pricing): Plans');
    });
    it('handles no pages / no summary gracefully', () => {
        expect(buildLlmsTxt({ brandName: 'Acme' })).toBe('# Acme\n');
    });
});

describe('IndexNow', () => {
    it('generates a 32-hex key', () => {
        const k = generateIndexNowKey();
        expect(k).toMatch(/^[0-9a-f]{32}$/);
        expect(generateIndexNowKey()).not.toBe(k); // random
    });
    it('builds the key file at the expected name', () => {
        const f = indexNowKeyFile('abc123');
        expect(f).toEqual({ name: 'abc123.txt', content: 'abc123\n' });
    });
    it('builds a submission payload with host + keyLocation', () => {
        const { endpoint, body } = buildIndexNowPayload('https://acme.com', 'key1', ['https://acme.com/a', '']);
        expect(endpoint).toBe('https://api.indexnow.org/indexnow');
        expect(body.host).toBe('acme.com');
        expect(body.keyLocation).toBe('https://acme.com/key1.txt');
        expect(body.urlList).toEqual(['https://acme.com/a']); // empties filtered
    });
});

describe('buildGeoReadiness', () => {
    it('reflects the completed content set', () => {
        const blogs = [
            { schema: {}, aeo: { overall: 82, signals: { citationCount: 3 } } },
            { schema: {}, aeo: { overall: 60, signals: { citationCount: 0 } } },
        ];
        const checks = buildGeoReadiness(blogs);
        const by = Object.fromEntries(checks.map((c) => [c.label, c]));
        expect(by['Content published'].done).toBe(true);
        expect(by['Structured schema'].done).toBe(true); // 2/2
        expect(by['Cites real sources'].done).toBe(true); // 1/2 ≥ half(1)
        expect(by['AEO-strong (≥70)'].done).toBe(true);   // 1/2 ≥ half(1)
        expect(by['AI crawlers welcomed'].done).toBe(true);
    });
    it('is all-false-ish with no content (except the always-on crawler line)', () => {
        const checks = buildGeoReadiness([]);
        expect(checks.find((c) => c.label === 'Content published').done).toBe(false);
        expect(checks.find((c) => c.label === 'AI crawlers welcomed').done).toBe(true);
    });
});
