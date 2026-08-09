// E7 · the detectors. A detector's failure mode is not missing a change, it is
// announcing one that did not happen — and "+45% replies" reads identically
// whether it is true or an artefact of two readings on small numbers. These
// tests are almost entirely about the refusals.
import { describe, expect, it } from 'vitest';
import {
    FLOORS,
    detectGoalDrift,
    detectMetricMoves,
    detectOutreachMoves,
    detectSearchMoves,
    detectVisibilityMoves,
    rankEvents,
    searchWindows,
    summariseMovement,
} from '../src/lib/detectors.js';

const NOW = new Date('2026-08-09T06:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const reading = (days, value) => ({ at: daysAgo(days), value });

describe('detectMetricMoves', () => {
    it('reports the move between the last two readings', () => {
        const [e] = detectMetricMoves([reading(21, 2400), reading(14, 2600), reading(7, 2900)], { measure: 'sessions' });
        expect(e.direction).toBe('up');
        expect(e.magnitude).toBe(300);
        expect(e.pct).toBeCloseTo(11.5, 1);
        expect(e.from).toBe(2600);
        expect(e.to).toBe(2900);
        // Which two readings — without it "up 11.5%" cannot be argued with.
        expect(e.comparedTo).toBe(daysAgo(14));
        expect(e.observedAt).toBe(daysAgo(7));
    });

    it('says nothing at all from a single reading', () => {
        // The tempting bug: "new — up 100%". There is no prior, so there is no change.
        expect(detectMetricMoves([reading(7, 2900)], { measure: 'sessions' })).toEqual([]);
        expect(detectMetricMoves([], { measure: 'sessions' })).toEqual([]);
    });

    it('refuses moves that clear only one of the two floors', () => {
        // Big percentage, trivial absolute: 10 → 18 is +80% and irrelevant.
        expect(detectMetricMoves([reading(14, 10), reading(7, 18)], { measure: 'sessions' })).toEqual([]);
        // Big absolute, trivial percentage: 50,000 → 50,030.
        expect(detectMetricMoves([reading(14, 50000), reading(7, 50030)], { measure: 'sessions' })).toEqual([]);
        // Clears both.
        expect(detectMetricMoves([reading(14, 1000), reading(7, 1200)], { measure: 'sessions' })).toHaveLength(1);
    });

    it('reports a fall as loudly as a rise', () => {
        const [e] = detectMetricMoves([reading(14, 3000), reading(7, 2400)], { measure: 'sessions' });
        expect(e.direction).toBe('down');
        expect(e.magnitude).toBe(600);
    });

    it('records that it compared trailing levels, not period totals', () => {
        const [e] = detectMetricMoves([reading(14, 1000), reading(7, 1400)], { measure: 'sessions' });
        expect(e.evidence.basis).toBe('trailing-level');
        expect(e.unit).toBe('sessions');
    });

    it('leaves pct null against a zero base rather than printing an infinity', () => {
        const [e] = detectMetricMoves([reading(14, 0), reading(7, 900)], { measure: 'sessions' });
        expect(e.pct).toBeNull();
        expect(e.magnitude).toBe(900);
    });
});

describe('detectSearchMoves', () => {
    const q = (query, position, impressions = 500) => ({ query, position, impressions, clicks: 10 });

    it('treats a FALLING position number as a gain', () => {
        // Search Console's inversion: 12 → 4 is a climb. Written the obvious way
        // this detector reports every improvement as a decline, and the sentence
        // reads perfectly either way.
        const [e] = detectSearchMoves([q('campus erp', 4)], [q('campus erp', 12)]);
        expect(e.direction).toBe('up');
        expect(e.magnitude).toBe(8);
        expect(e.from).toBe(12);
        expect(e.to).toBe(4);
    });

    it('names crossing onto page one, and off it', () => {
        const [up] = detectSearchMoves([q('a', 8)], [q('a', 14)]);
        expect(up.evidence.enteredPageOne).toBe(true);
        const [down] = detectSearchMoves([q('b', 15)], [q('b', 7)]);
        expect(down.direction).toBe('down');
        expect(down.evidence.leftPageOne).toBe(true);
    });

    it('ignores queries nobody sees and moves too small to mean anything', () => {
        expect(detectSearchMoves([q('a', 4, 10)], [q('a', 12, 10)])).toEqual([]);
        expect(detectSearchMoves([q('a', 4.2)], [q('a', 5.0)])).toEqual([]);
        expect(FLOORS.search.impressions).toBeGreaterThan(0);
    });

    it('says nothing about a query with no prior reading', () => {
        // A query that simply was not in the last pull has not moved.
        expect(detectSearchMoves([q('brand new term', 3)], [q('other', 5)])).toEqual([]);
    });

    it('ranks by impressions × movement and caps the list', () => {
        const current = Array.from({ length: 12 }, (_, i) => q(`term ${i}`, 4, 100 + i * 10));
        const prior = Array.from({ length: 12 }, (_, i) => q(`term ${i}`, 12, 100 + i * 10));
        const events = detectSearchMoves(current, prior);
        expect(events).toHaveLength(5);
        expect(events[0].subject).toBe('term 11'); // most impressions
    });
});

describe('detectVisibilityMoves', () => {
    const row = (prompt, { cited = false, mentioned = false, surface = 'perplexity', status = 'ok' } = {}) =>
        ({ prompt, surface, status, brandCited: cited, brandMentioned: mentioned, competitorMentions: [] });

    it('reports a lost citation, and puts losses first', () => {
        const events = detectVisibilityMoves(
            [row('best campus erp', { mentioned: true }), row('admissions software', { cited: true, mentioned: true })],
            [row('best campus erp', { cited: true, mentioned: true }), row('admissions software', { mentioned: true })],
        );
        expect(events[0].direction).toBe('down');
        expect(events[0].evidence.what).toBe('cited');
        expect(events[1].direction).toBe('up');
    });

    it('reports one event per prompt, citation outranking mention', () => {
        const events = detectVisibilityMoves(
            [row('p', { cited: true, mentioned: true })],
            [row('p', { cited: false, mentioned: false })],
        );
        expect(events).toHaveLength(1);
        expect(events[0].evidence.what).toBe('cited');
    });

    it('ignores rows that were never a real answer', () => {
        // A stub row is "the surface had no key", not "the brand was absent".
        expect(detectVisibilityMoves(
            [row('p', { status: 'stub' })],
            [row('p', { cited: true, status: 'ok' })],
        )).toEqual([]);
    });

    it('says nothing when a prompt is unchanged, or is new this scan', () => {
        expect(detectVisibilityMoves([row('p', { cited: true })], [row('p', { cited: true })])).toEqual([]);
        expect(detectVisibilityMoves([row('new prompt', { cited: true })], [row('p', { cited: true })])).toEqual([]);
    });

    it('keeps prompt and surface separate, so one prompt on two engines is two events', () => {
        const events = detectVisibilityMoves(
            [row('p', { cited: true, surface: 'perplexity' }), row('p', { cited: true, surface: 'openai' })],
            [row('p', { surface: 'perplexity' }), row('p', { surface: 'openai' })],
        );
        expect(events).toHaveLength(2);
        // …and they must SURVIVE storage. Found in the harness: the key was built
        // from the prompt alone, so the unique index kept one engine's change and
        // dropped the other with no error anywhere.
        expect(events[0].dedupeKey).not.toBe(events[1].dedupeKey);
    });
});

describe('detectOutreachMoves', () => {
    it('needs both floors, so 2 replies becoming 3 is not news', () => {
        expect(detectOutreachMoves([reading(14, 2), reading(7, 3)], { metric: 'replied' })).toEqual([]);
        const [e] = detectOutreachMoves([reading(14, 12), reading(7, 20)], { metric: 'replied' });
        expect(e.subject).toBe('Replies');
        expect(e.magnitude).toBe(8);
    });
});

describe('rankEvents + summariseMovement', () => {
    const metricUp = detectMetricMoves([reading(14, 2600), reading(7, 2900)], { measure: 'sessions' })[0];
    const searchUp = detectSearchMoves([{ query: 'campus erp', position: 4, impressions: 900 }], [{ query: 'campus erp', position: 11, impressions: 900 }])[0];
    const visDown = detectVisibilityMoves([{ prompt: 'p', surface: 'openai', status: 'ok', brandCited: false, brandMentioned: true }], [{ prompt: 'p', surface: 'openai', status: 'ok', brandCited: true, brandMentioned: true }])[0];

    it('puts the measure that moved above the things that might explain it', () => {
        expect(rankEvents([visDown, searchUp, metricUp])[0].kind).toBe('metric');
    });

    it('builds a headline with contributors, and marks whether they agree', () => {
        const s = summariseMovement([metricUp, searchUp], { measure: 'sessions' });
        expect(s.headline.kind).toBe('metric');
        expect(s.contributors.map((c) => c.kind)).toEqual(['search']);
        expect(s.aligned).toBe(true);
    });

    it('does not claim alignment when the supporting movement points the other way', () => {
        // Traffic up while visibility fell: both true, not a story about each other.
        const s = summariseMovement([metricUp, visDown], { measure: 'sessions' });
        expect(s.aligned).toBe(false);
    });

    it('returns null when nothing moved — silence is a result', () => {
        expect(summariseMovement([], { measure: 'sessions' })).toBeNull();
    });

    it('never headlines a campaign-scoped number under the goal heading', () => {
        // Seen on screen: "Sessions rose to 2,295" while the account read 8,136 —
        // true of one campaign, and nothing on the line said which.
        const scoped = detectMetricMoves([reading(14, 2100), reading(7, 2295)], { measure: 'sessions', campaignId: 'c1' })[0];
        const s = summariseMovement([scoped, searchUp], { measure: 'sessions' });
        expect(s.headline).toBeNull();
        expect(s.contributors.map((c) => c.kind)).toEqual(['search']);
    });

    it('headlines only the goal\'s own measure, and demotes the others', () => {
        // Also seen on screen: "Revenue rose 5.1%" headlining a SESSIONS goal.
        // True, and read by everyone as the goal having moved.
        const revenue = detectMetricMoves([reading(14, 3170000), reading(7, 3332852)], { measure: 'revenue' })[0];
        const s = summariseMovement([revenue, searchUp], { measure: 'sessions' });
        expect(s.headline).toBeNull();
        expect(s.contributors.map((c) => c.subject)).toContain('Revenue');
    });

    it('still summarises contributors when the measure itself did not move', () => {
        const s = summariseMovement([searchUp], { measure: 'sessions' });
        expect(s.headline).toBeNull();
        expect(s.contributors).toHaveLength(1);
        expect(s.aligned).toBe(false);
    });
});

describe('detectGoalDrift', () => {
    const goal = (verdict) => ({
        goalId: 'g1', name: 'Q4 pipeline', verdict, forecast: 9000, target: 12000,
        observedAt: daysAgo(0),
    });

    it('reports a goal slipping, and calls it down', () => {
        const [e] = detectGoalDrift(goal('off-pace'), 'on-track');
        expect(e.kind).toBe('goal');
        expect(e.direction).toBe('down');
        expect(e.evidence).toMatchObject({ goalId: 'g1', from: 'on-track', to: 'off-pace', toLabel: 'behind' });
    });

    it('reports recovery as up', () => {
        expect(detectGoalDrift(goal('on-track'), 'at-risk')[0].direction).toBe('up');
    });

    it('says nothing when the standing is unchanged', () => {
        expect(detectGoalDrift(goal('at-risk'), 'at-risk')).toEqual([]);
    });

    it('treats a first observation as a baseline, not a change', () => {
        expect(detectGoalDrift(goal('off-pace'), null)).toEqual([]);
    });

    it('never reports movement into or out of unknown', () => {
        // Data arriving or drying up is not the goal slipping, and saying so
        // would blame the user for a missing snapshot.
        expect(detectGoalDrift(goal('unknown'), 'on-track')).toEqual([]);
        expect(detectGoalDrift(goal('off-pace'), 'unknown')).toEqual([]);
    });

    it('keys on the transition, so each slip is its own event', () => {
        const slip = detectGoalDrift(goal('at-risk'), 'on-track')[0];
        const worse = detectGoalDrift(goal('off-pace'), 'at-risk')[0];
        expect(slip.dedupeKey).not.toBe(worse.dedupeKey);
    });

    it('outranks every other kind on the hero', () => {
        const drift = detectGoalDrift(goal('off-pace'), 'on-track')[0];
        const metric = detectMetricMoves([reading(14, 2600), reading(7, 2900)], { measure: 'sessions' })[0];
        expect(rankEvents([metric, drift])[0].kind).toBe('goal');
    });
});

describe('searchWindows', () => {
    it('stamps the window ends, not the moment somebody asked', () => {
        // Found in the harness: stamping "now" gave every manual check a new key,
        // so pressing the button twice stored the same ranking move twice.
        const a = searchWindows({ now: new Date('2026-08-09T09:00:00Z') });
        const b = searchWindows({ now: new Date('2026-08-09T21:30:00Z') });
        expect(a).toEqual(b);
        // Three days back is Search Console's own reporting lag.
        expect(a.observedAt).toBe('2026-08-06T00:00:00.000Z');
        expect(a.comparedTo).toBe('2026-07-09T00:00:00.000Z');
    });

    it('moves on to a new key the next day', () => {
        const today = searchWindows({ now: new Date('2026-08-09T09:00:00Z') });
        const tomorrow = searchWindows({ now: new Date('2026-08-10T09:00:00Z') });
        expect(today.observedAt).not.toBe(tomorrow.observedAt);
    });
});

describe('event identity', () => {
    it('gives the same comparison the same dedupe key, so a re-run is a no-op', () => {
        const a = detectMetricMoves([reading(14, 2600), reading(7, 2900)], { measure: 'sessions' })[0];
        const b = detectMetricMoves([reading(21, 100), reading(14, 2600), reading(7, 2900)], { measure: 'sessions' })[0];
        expect(a.dedupeKey).toBe(b.dedupeKey);
    });

    it('keeps workspace-wide and per-campaign movement apart', () => {
        // Found in the harness: both were keyed "metric|Sessions|<at>|<at>", so
        // the unique index kept one and a real movement vanished with no error.
        const wide = detectMetricMoves([reading(14, 2600), reading(7, 2900)], { measure: 'sessions' })[0];
        const scoped = detectMetricMoves([reading(14, 2600), reading(7, 2900)], { measure: 'sessions', campaignId: 'c1' })[0];
        const other = detectMetricMoves([reading(14, 2600), reading(7, 2900)], { measure: 'sessions', campaignId: 'c2' })[0];
        expect(new Set([wide.dedupeKey, scoped.dedupeKey, other.dedupeKey]).size).toBe(3);
    });

    it('gives a different window a different key', () => {
        const a = detectMetricMoves([reading(14, 2600), reading(7, 2900)], { measure: 'sessions' })[0];
        const b = detectMetricMoves([reading(14, 2600), reading(1, 2900)], { measure: 'sessions' })[0];
        expect(a.dedupeKey).not.toBe(b.dedupeKey);
    });
});
