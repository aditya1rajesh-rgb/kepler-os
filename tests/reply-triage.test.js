// E16 · reply triage. "What needs me" is the whole value of the Replies screen,
// so the rule that decides it is tested rather than trusted.
import { describe, expect, it } from 'vitest';
import {
    filterReplies,
    needsResponse,
    oldestUnansweredHours,
    replyCounts,
} from '../src/lib/replyTriage.js';

const reply = (over = {}) => ({
    id: 'r1',
    kind: 'reply',
    receivedAt: '2026-08-09T09:00:00Z',
    enrollment: { id: 'e1', status: 'stopped_reply', currentStep: 1, sequenceName: 'CIOs' },
    ...over,
});

describe('needsResponse', () => {
    it('flags a genuine reply that has not become a meeting', () => {
        expect(needsResponse(reply())).toBe(true);
    });

    it('clears once the reply became a meeting', () => {
        expect(needsResponse(reply({ enrollment: { status: 'meeting' } }))).toBe(false);
    });

    it('ignores bounces and unsubscribes — the scheduler already handled them', () => {
        expect(needsResponse(reply({ kind: 'bounce' }))).toBe(false);
        expect(needsResponse(reply({ kind: 'unsub' }))).toBe(false);
    });

    it('ignores out-of-office — the sequence reschedules itself', () => {
        expect(needsResponse(reply({ kind: 'ooo' }))).toBe(false);
    });

    it('still flags a reply whose sequence was archived (enrollment gone)', () => {
        // enrollment_id is ON DELETE SET NULL — the prospect still replied to you.
        expect(needsResponse(reply({ enrollment: null }))).toBe(true);
    });

    it('does not throw on a malformed reply', () => {
        expect(needsResponse(undefined)).toBe(false);
        expect(needsResponse({})).toBe(false);
    });
});

describe('replyCounts', () => {
    it('counts each kind and the actionable subset', () => {
        const c = replyCounts([
            reply({ id: '1' }),
            reply({ id: '2', enrollment: { status: 'meeting' } }),
            reply({ id: '3', kind: 'ooo' }),
            reply({ id: '4', kind: 'bounce' }),
            reply({ id: '5', kind: 'unsub' }),
        ]);
        expect(c).toMatchObject({ all: 5, needsYou: 1, reply: 2, ooo: 1, bounce: 1, unsub: 1 });
    });

    it('is zero-safe on an empty inbox', () => {
        expect(replyCounts([])).toMatchObject({ all: 0, needsYou: 0 });
    });
});

describe('filterReplies', () => {
    const rows = [
        reply({ id: '1' }),
        reply({ id: '2', kind: 'bounce' }),
        reply({ id: '3', enrollment: { status: 'meeting' } }),
    ];

    it('defaults to what needs a human', () => {
        expect(filterReplies(rows).map((r) => r.id)).toEqual(['1']);
    });

    it('passes everything through on all', () => {
        expect(filterReplies(rows, 'all')).toHaveLength(3);
    });

    it('filters by kind', () => {
        expect(filterReplies(rows, 'bounce').map((r) => r.id)).toEqual(['2']);
    });
});

describe('oldestUnansweredHours', () => {
    const NOW = new Date('2026-08-09T12:00:00Z').getTime();

    it('measures from the oldest UNANSWERED reply, not the oldest reply', () => {
        const rows = [
            reply({ id: 'old-but-handled', receivedAt: '2026-08-01T12:00:00Z', enrollment: { status: 'meeting' } }),
            reply({ id: 'pending', receivedAt: '2026-08-09T09:00:00Z' }),
        ];
        expect(oldestUnansweredHours(rows, NOW)).toBe(3);
    });

    it('returns null when nothing is waiting', () => {
        expect(oldestUnansweredHours([reply({ enrollment: { status: 'meeting' } })], NOW)).toBeNull();
        expect(oldestUnansweredHours([], NOW)).toBeNull();
    });

    it('ignores unparseable timestamps rather than reporting NaN hours', () => {
        expect(oldestUnansweredHours([reply({ receivedAt: 'not-a-date' })], NOW)).toBeNull();
    });
});
