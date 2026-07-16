// Send-path invariants (§9.5 / §12). The scheduler core is pure — these tests
// exercise the exact code the edge function runs, no mocks of our own logic.
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONFIG,
    canRetryClaim,
    computeNextSendAt,
    decide,
    deferToWindow,
    isWithinWindow,
    resolveTokens,
    runScheduler,
    textToHtml,
    type Bundle,
    type EnrollmentRow,
    type MessageRow,
    type ProspectRow,
    type SchedulerDb,
    type SendAdapter,
    type SequenceRow,
} from '../supabase/functions/send-scheduler/core.ts';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS = 'ws-1';
// A Wednesday, 10:00 UTC — inside the default Mon–Fri 9–17 UTC window.
const NOW = new Date('2026-07-15T10:00:00Z');

const prospect = (over: Partial<ProspectRow> = {}): ProspectRow => ({
    id: 'p-1',
    first_name: 'Priya',
    last_name: 'Sharma',
    title: 'Head of Growth',
    company: 'Acme Labs',
    email: 'priya@acme.dev',
    ...over,
});

const sequence = (over: Partial<SequenceRow> = {}): SequenceRow => ({
    id: 'seq-1',
    workspace_id: WS,
    mode: 'warm',
    status: 'approved',
    steps: [
        { idx: 0, dayOffset: 0, subject: 'quick question', body: 'Hi {{firstName}}, saw {{company}} is growing.' },
        { idx: 1, dayOffset: 3, subject: 're: quick question', body: 'Thoughts, {{firstName}}?' },
    ],
    send_window: { tz: 'UTC', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
    sending_domain_id: null,
    ...over,
});

const enrollment = (over: Partial<EnrollmentRow> = {}): EnrollmentRow => ({
    id: 'enr-1',
    workspace_id: WS,
    sequence_id: 'seq-1',
    prospect_id: 'p-1',
    status: 'active',
    current_step: 0,
    next_send_at: NOW.toISOString(),
    ...over,
});

const decideArgs = (over: Record<string, unknown> = {}) => ({
    enrollment: enrollment(),
    sequence: sequence(),
    prospect: prospect(),
    suppressed: false,
    domain: null,
    warmSentToday: 0,
    now: NOW,
    config: DEFAULT_CONFIG,
    ...over,
});

// ─── Send window (E2.1 — never 3am, never weekends) ──────────────────────────

describe('send window', () => {
    it('accepts business hours in the window tz', () => {
        expect(isWithinWindow(NOW, { tz: 'UTC', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 })).toBe(true);
    });

    it('rejects 3am and weekends', () => {
        expect(isWithinWindow(new Date('2026-07-15T03:00:00Z'), { tz: 'UTC' })).toBe(false);
        expect(isWithinWindow(new Date('2026-07-18T11:00:00Z'), { tz: 'UTC' })).toBe(false); // Saturday
    });

    it('defers a night send to the next window opening', () => {
        const deferred = deferToWindow(new Date('2026-07-15T03:00:00Z'), { tz: 'UTC' });
        expect(isWithinWindow(deferred, { tz: 'UTC' })).toBe(true);
        expect(deferred.toISOString()).toBe('2026-07-15T09:00:00.000Z');
    });

    it('defers a Saturday send to Monday', () => {
        const deferred = deferToWindow(new Date('2026-07-18T11:00:00Z'), { tz: 'UTC' });
        expect(deferred.getUTCDay()).toBe(1);
        expect(isWithinWindow(deferred, { tz: 'UTC' })).toBe(true);
    });

    it('respects a non-UTC timezone', () => {
        // 05:00 UTC = 10:30 IST — inside an IST business-hours window.
        expect(isWithinWindow(new Date('2026-07-15T05:00:00Z'), { tz: 'Asia/Kolkata' })).toBe(true);
        // 15:00 UTC = 20:30 IST — outside it.
        expect(isWithinWindow(new Date('2026-07-15T15:00:00Z'), { tz: 'Asia/Kolkata' })).toBe(false);
    });
});

// ─── Tokens (§9.4 — resolve or block) ─────────────────────────────────────────

describe('token resolution', () => {
    it('resolves prospect fields, case-insensitive, including fullName', () => {
        const r = resolveTokens('Hi {{firstName}} ({{FULLNAME}}) at {{company}}', prospect());
        expect(r.text).toBe('Hi Priya (Priya Sharma) at Acme Labs');
        expect(r.missing).toEqual([]);
    });

    it('flags unknown tokens and empty fields as missing', () => {
        const r = resolveTokens('{{signal}} and {{title}}', prospect({ title: '' }));
        expect(r.missing).toContain('{{signal}}');
        expect(r.missing).toContain('{{title}}');
    });

    it('escapes HTML in bodies', () => {
        expect(textToHtml('a<b>&\nc')).toBe('a&lt;b&gt;&amp;<br>c');
    });
});

// ─── decide() — the invariant gate ────────────────────────────────────────────

describe('decide', () => {
    it('sends the happy path with resolved copy', () => {
        const d = decide(decideArgs());
        expect(d).toMatchObject({
            action: 'send',
            stepIdx: 0,
            subject: 'quick question',
            body: 'Hi Priya, saw Acme Labs is growing.',
            sendPath: 'crm_zoho',
        });
    });

    it('NEVER sends an unapproved sequence (draft/paused hold; archived stops)', () => {
        for (const status of ['draft', 'paused']) {
            const d = decide(decideArgs({ sequence: sequence({ status }) }));
            expect(d.action).toBe('hold');
        }
        const archived = decide(decideArgs({ sequence: sequence({ status: 'archived' }) }));
        expect(archived.action).toBe('stop');
    });

    it('honors suppression at send time', () => {
        const d = decide(decideArgs({ suppressed: true }));
        expect(d).toMatchObject({ action: 'stop', status: 'suppressed', reason: 'suppression_list' });
    });

    it('blocks cold mode without a verified domain', () => {
        const seq = sequence({ mode: 'cold', sending_domain_id: 'dom-1' });
        expect(decide(decideArgs({ sequence: seq, domain: null })).action).toBe('hold');
        expect(decide(decideArgs({
            sequence: seq,
            domain: { id: 'dom-1', status: 'pending', daily_cap: 10, sent_today: 0, sent_today_date: null },
        })).action).toBe('hold');
    });

    it('defers cold overflow past the domain daily cap (never bursts over)', () => {
        const seq = sequence({ mode: 'cold', sending_domain_id: 'dom-1' });
        const d = decide(decideArgs({
            sequence: seq,
            domain: { id: 'dom-1', status: 'verified', daily_cap: 10, sent_today: 10, sent_today_date: NOW.toISOString().slice(0, 10) },
        }));
        expect(d.action).toBe('defer');
        if (d.action === 'defer') expect(d.until.getTime()).toBeGreaterThan(NOW.getTime());
    });

    it('defers warm sends past the workspace cap', () => {
        const d = decide(decideArgs({ warmSentToday: DEFAULT_CONFIG.warmDailyCap }));
        expect(d.action).toBe('defer');
    });

    it('defers sends landing outside the window', () => {
        const d = decide(decideArgs({ now: new Date('2026-07-15T03:00:00Z') }));
        expect(d).toMatchObject({ action: 'defer', reason: 'outside_window' });
    });

    it('pauses on unresolvable tokens instead of sending them literally', () => {
        const seq = sequence({
            steps: [{ idx: 0, dayOffset: 0, subject: 'hi', body: 'Saw {{signal}} at {{company}}' }],
        });
        const d = decide(decideArgs({ sequence: seq }));
        expect(d).toMatchObject({ action: 'stop', status: 'paused' });
        if (d.action === 'stop') expect(d.reason).toContain('{{signal}}');
    });

    it('completes an enrollment past the last step', () => {
        const d = decide(decideArgs({ enrollment: enrollment({ current_step: 2 }) }));
        expect(d.action).toBe('complete');
    });

    it('skips non-active enrollments (stop-on-reply already applied)', () => {
        const d = decide(decideArgs({ enrollment: enrollment({ status: 'stopped_reply' }) }));
        expect(d.action).toBe('skip');
    });

    it('pauses when the prospect has no email', () => {
        const d = decide(decideArgs({ prospect: prospect({ email: '' }) }));
        expect(d).toMatchObject({ action: 'stop', status: 'paused', reason: 'missing_email' });
    });
});

// ─── Cadence math ─────────────────────────────────────────────────────────────

describe('computeNextSendAt', () => {
    it('schedules the next step from the sent time using the dayOffset gap', () => {
        const next = computeNextSendAt(sequence(), 0, NOW);
        expect(next).not.toBeNull();
        // Gap is 3 days; July 18 is a Saturday, so the window pushes to Monday.
        expect(next!.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 3 * 24 * 3600 * 1000);
        expect(isWithinWindow(next!, sequence().send_window)).toBe(true);
    });

    it('returns null after the final step', () => {
        expect(computeNextSendAt(sequence(), 1, NOW)).toBeNull();
    });
});

// ─── Claim retry policy (idempotency) ────────────────────────────────────────

describe('canRetryClaim', () => {
    const msg = (over: Partial<MessageRow> = {}): MessageRow => ({
        id: 'm-1', status: 'failed', attempt: 1, error: 'timeout',
        updated_at: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(),
        ...over,
    });

    it('never retries a sent message (double-send is impossible)', () => {
        expect(canRetryClaim(msg({ status: 'sent' }), NOW, DEFAULT_CONFIG)).toEqual({ retry: false, exhausted: false });
    });

    it('leaves fresh claims alone (owned by a live run)', () => {
        const fresh = msg({ status: 'queued', updated_at: NOW.toISOString() });
        expect(canRetryClaim(fresh, NOW, DEFAULT_CONFIG).retry).toBe(false);
    });

    it('retries stale transient failures up to maxAttempts, then exhausts', () => {
        expect(canRetryClaim(msg({ attempt: 1 }), NOW, DEFAULT_CONFIG)).toEqual({ retry: true, exhausted: false });
        expect(canRetryClaim(msg({ attempt: 3 }), NOW, DEFAULT_CONFIG)).toEqual({ retry: false, exhausted: true });
    });

    it('retries auth failures indefinitely (hold, never drop — E1.1)', () => {
        expect(canRetryClaim(msg({ attempt: 99, error: 'auth:token expired' }), NOW, DEFAULT_CONFIG).retry).toBe(true);
    });
});

// ─── Integration: runScheduler with an in-memory DB + mock provider ──────────

interface FakeState {
    bundles: Bundle[];
    suppressed: Set<string>;
    messages: Array<Record<string, unknown> & { id: string }>;
    enrollmentPatches: Array<{ id: string; patch: Record<string, unknown> }>;
}

const makeFakeDb = (state: FakeState): SchedulerDb => ({
    dueEnrollments: async () => state.bundles,
    isSuppressed: async (_ws, email) => state.suppressed.has(email),
    warmSentToday: async () => 0,
    getDomain: async () => null,
    claimStep: async ({ enrollment: enr, sequenceId, stepIdx, sendPath, subject }) => {
        const existing = state.messages.find(
            (m) => m.enrollment_id === enr.id && m.step_idx === stepIdx,
        );
        if (existing) {
            return {
                inserted: false,
                existing: {
                    id: existing.id,
                    status: String(existing.status),
                    attempt: Number(existing.attempt ?? 1),
                    error: String(existing.error ?? ''),
                    updated_at: String(existing.updated_at ?? new Date(0).toISOString()),
                },
            };
        }
        const id = `msg-${state.messages.length + 1}`;
        state.messages.push({
            id, enrollment_id: enr.id, sequence_id: sequenceId, step_idx: stepIdx,
            send_path: sendPath, subject, status: 'queued', attempt: 1, error: '',
            updated_at: NOW.toISOString(),
        });
        return { inserted: true, messageId: id };
    },
    rearmClaim: async (messageId, attempt) => {
        const m = state.messages.find((x) => x.id === messageId);
        if (m) Object.assign(m, { status: 'queued', attempt, error: '' });
    },
    finalizeMessage: async (messageId, patch) => {
        const m = state.messages.find((x) => x.id === messageId);
        if (m) Object.assign(m, patch);
    },
    updateEnrollment: async (id, patch) => {
        state.enrollmentPatches.push({ id, patch });
    },
});

const makeMockAdapter = (calls: Array<Record<string, unknown>>, result = { ok: true, providerMessageId: 'z-1' }): SendAdapter => ({
    send: async (args) => {
        calls.push(args as unknown as Record<string, unknown>);
        return result;
    },
});

describe('runScheduler (integration, mock provider)', () => {
    it('PROVES no path sends without approval', async () => {
        const state: FakeState = {
            bundles: [
                { enrollment: enrollment({ id: 'enr-approved' }), sequence: sequence(), prospect: prospect() },
                { enrollment: enrollment({ id: 'enr-draft', prospect_id: 'p-2' }), sequence: sequence({ id: 'seq-2', status: 'draft' }), prospect: prospect({ id: 'p-2', email: 'x@y.dev' }) },
                { enrollment: enrollment({ id: 'enr-edited', prospect_id: 'p-3' }), sequence: sequence({ id: 'seq-3', status: 'draft' }), prospect: prospect({ id: 'p-3', email: 'a@b.dev' }) },
                { enrollment: enrollment({ id: 'enr-replied', status: 'stopped_reply' }), sequence: sequence(), prospect: prospect() },
            ],
            suppressed: new Set(),
            messages: [],
            enrollmentPatches: [],
        };
        const calls: Array<Record<string, unknown>> = [];
        const summary = await runScheduler({
            db: makeFakeDb(state),
            adapters: { crm_zoho: makeMockAdapter(calls) },
            now: NOW,
        });

        // Exactly ONE send — the approved, active enrollment. Draft (including
        // edited-post-approval, which the DB trigger resets to draft) and
        // stopped enrollments never reach the adapter.
        expect(calls).toHaveLength(1);
        expect(summary.sent).toBe(1);
        expect(summary.held).toBe(2);
        const sentMsg = state.messages.find((m) => m.status === 'sent');
        expect(sentMsg).toBeTruthy();
        expect(sentMsg!.enrollment_id).toBe('enr-approved');
    });

    it('logs every send against the enrollment and advances the cadence (E1.4/E2.1)', async () => {
        const state: FakeState = {
            bundles: [{ enrollment: enrollment(), sequence: sequence(), prospect: prospect() }],
            suppressed: new Set(),
            messages: [],
            enrollmentPatches: [],
        };
        const calls: Array<Record<string, unknown>> = [];
        await runScheduler({ db: makeFakeDb(state), adapters: { crm_zoho: makeMockAdapter(calls) }, now: NOW });

        expect(state.messages).toHaveLength(1);
        expect(state.messages[0]).toMatchObject({
            status: 'sent', provider_message_id: 'z-1', step_idx: 0, send_path: 'crm_zoho',
        });
        const advance = state.enrollmentPatches.find((p) => p.id === 'enr-1');
        expect(advance!.patch.current_step).toBe(1);
        expect(typeof advance!.patch.next_send_at).toBe('string');
    });

    it('suppressed recipients are stopped at send time, adapter never called', async () => {
        const state: FakeState = {
            bundles: [{ enrollment: enrollment(), sequence: sequence(), prospect: prospect() }],
            suppressed: new Set(['priya@acme.dev']),
            messages: [],
            enrollmentPatches: [],
        };
        const calls: Array<Record<string, unknown>> = [];
        const summary = await runScheduler({ db: makeFakeDb(state), adapters: { crm_zoho: makeMockAdapter(calls) }, now: NOW });

        expect(calls).toHaveLength(0);
        expect(summary.stopped).toBe(1);
        expect(state.enrollmentPatches[0].patch).toMatchObject({ status: 'suppressed' });
    });

    it('an already-sent claim advances without re-sending (idempotent re-run)', async () => {
        const state: FakeState = {
            bundles: [{ enrollment: enrollment(), sequence: sequence(), prospect: prospect() }],
            suppressed: new Set(),
            messages: [{
                id: 'msg-old', enrollment_id: 'enr-1', step_idx: 0, status: 'sent',
                attempt: 1, error: '', updated_at: NOW.toISOString(),
            }],
            enrollmentPatches: [],
        };
        const calls: Array<Record<string, unknown>> = [];
        await runScheduler({ db: makeFakeDb(state), adapters: { crm_zoho: makeMockAdapter(calls) }, now: NOW });

        expect(calls).toHaveLength(0); // no double-send
        expect(state.enrollmentPatches[0].patch.current_step).toBe(1); // but cadence advances
    });

    it('auth failure holds the enrollment (never drops) and flags the message', async () => {
        const state: FakeState = {
            bundles: [{ enrollment: enrollment(), sequence: sequence(), prospect: prospect() }],
            suppressed: new Set(),
            messages: [],
            enrollmentPatches: [],
        };
        const calls: Array<Record<string, unknown>> = [];
        const summary = await runScheduler({
            db: makeFakeDb(state),
            adapters: { crm_zoho: makeMockAdapter(calls, { ok: false, error: 'token revoked', authError: true } as never) },
            now: NOW,
        });

        expect(summary.held).toBe(1);
        expect(state.messages[0].status).toBe('failed');
        expect(String(state.messages[0].error)).toMatch(/^auth:/);
        // Enrollment stays active, just deferred — resumes on reconnect (E1.1).
        expect(state.enrollmentPatches[0].patch.status).toBeUndefined();
        expect(typeof state.enrollmentPatches[0].patch.next_send_at).toBe('string');
    });

    it('a failed send is never a silent drop — the row records the reason', async () => {
        const state: FakeState = {
            bundles: [{ enrollment: enrollment(), sequence: sequence(), prospect: prospect() }],
            suppressed: new Set(),
            messages: [],
            enrollmentPatches: [],
        };
        await runScheduler({
            db: makeFakeDb(state),
            adapters: { crm_zoho: makeMockAdapter([], { ok: false, error: 'Zoho 500' } as never) },
            now: NOW,
        });
        expect(state.messages[0]).toMatchObject({ status: 'failed', error: 'Zoho 500' });
    });
});
