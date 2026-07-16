// Reply/OOO/bounce classification + transitions (E2.2 / E3.1 / E3.3 / E1.5).
import { describe, expect, it } from 'vitest';
import { classifyEmail, transitionFor } from '../supabase/functions/inbox-monitor/classify.ts';

const NOW = new Date('2026-07-15T10:00:00Z');
const base = { prospectEmail: 'priya@acme.dev', operatorEmail: 'me@kepler.dev' };

describe('classifyEmail', () => {
    it('a prospect reply is a reply', () => {
        expect(classifyEmail({ ...base, fromEmail: 'priya@acme.dev', subject: 'Re: quick question' })).toBe('reply');
    });

    it('OOO auto-replies are NOT replies (E3.3)', () => {
        for (const subject of ['Out of Office: quick question', 'Automatic reply: hi', 'On leave until Aug 4']) {
            expect(classifyEmail({ ...base, fromEmail: 'priya@acme.dev', subject })).toBe('ooo');
        }
    });

    it('bounces are detected from daemon senders and NDR subjects', () => {
        expect(classifyEmail({ ...base, fromEmail: 'mailer-daemon@googlemail.com', subject: 'anything' })).toBe('bounce');
        expect(classifyEmail({ ...base, fromEmail: 'postmaster@acme.dev', subject: 'x' })).toBe('bounce');
        expect(classifyEmail({ ...base, fromEmail: 'noreply@relay.dev', subject: 'Undeliverable: quick question' })).toBe('bounce');
    });

    it('our own sends and third parties are ignored', () => {
        expect(classifyEmail({ ...base, fromEmail: 'me@kepler.dev', subject: 'quick question' })).toBe('outbound');
        expect(classifyEmail({ ...base, fromEmail: 'colleague@acme.dev', subject: 'FYI' })).toBe('ignore');
    });

    it('matching is case-insensitive on addresses', () => {
        expect(classifyEmail({ ...base, fromEmail: 'Priya@Acme.dev', subject: 'Re: hello' })).toBe('reply');
    });
});

describe('transitionFor', () => {
    const active = { id: 'enr-1', status: 'active', next_send_at: NOW.toISOString() };

    it('reply cancels remaining touches instantly (E2.2)', () => {
        const t = transitionFor('reply', active, NOW);
        expect(t.enrollmentPatch).toMatchObject({ status: 'stopped_reply', next_send_at: null });
        expect(t.suppress).toBe(false);
    });

    it('bounce stops the enrollment AND suppresses the address (E1.5)', () => {
        const t = transitionFor('bounce', active, NOW);
        expect(t.enrollmentPatch).toMatchObject({ status: 'stopped_bounce' });
        expect(t.suppress).toBe(true);
    });

    it('OOO reschedules +7d instead of stopping (E3.3)', () => {
        const t = transitionFor('ooo', active, NOW);
        expect(t.enrollmentPatch).not.toBeNull();
        const next = new Date(String(t.enrollmentPatch!.next_send_at));
        expect(next.getTime()).toBe(NOW.getTime() + 7 * 24 * 3600 * 1000);
        expect(t.suppress).toBe(false);
    });

    it('OOO never pulls an already-later touch earlier', () => {
        const later = { ...active, next_send_at: new Date(NOW.getTime() + 10 * 24 * 3600 * 1000).toISOString() };
        const t = transitionFor('ooo', later, NOW);
        expect(t.enrollmentPatch!.next_send_at).toBe(later.next_send_at);
    });

    it('late replies on finished enrollments change nothing (but bounces still suppress)', () => {
        const done = { ...active, status: 'completed' };
        expect(transitionFor('reply', done, NOW).enrollmentPatch).toBeNull();
        expect(transitionFor('bounce', done, NOW).suppress).toBe(true);
        expect(transitionFor('bounce', null, NOW).suppress).toBe(true);
    });
});
