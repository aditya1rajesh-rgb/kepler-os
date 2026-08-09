import { useCallback, useEffect, useMemo, useState } from 'react';
import Panel, { PanelHeader } from '../ui/Panel';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import StatusPill from '../ui/StatusPill';
import { sequencesService, findUnresolvableTokens } from '../../services/sequencesService';
import { enrollmentsService } from '../../services/enrollmentsService';
import { repliesService, suppressionService } from '../../services/repliesService';
import { prospectsService } from '../../services/prospectsService';
import { prospectListsService } from '../../services/prospectListsService';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { toUserMessage } from '../../lib/errors';

// The send engine (R1a): approve → enroll → KEPLER sends on schedule via the
// connected CRM. Everything here is a VIEW over the execution tables; the
// invariants live server-side (DB triggers + send-scheduler). Nothing in this
// component can cause a send by itself — only approval + enrollment can, and
// both are explicit operator actions (D3).

const ENROLLMENT_STATUS_LABEL = {
    active: 'Active',
    paused: 'Paused',
    completed: 'Completed',
    stopped_reply: 'Replied',
    stopped_unsub: 'Unsubscribed',
    stopped_bounce: 'Bounced',
    suppressed: 'Suppressed',
    meeting: 'Meeting booked',
};

const REPLY_KIND_LABEL = { reply: 'Reply', ooo: 'Out of office', bounce: 'Bounce', unsub: 'Unsubscribe' };

const prospectName = (p) =>
    [p?.firstName, p?.lastName].filter(Boolean).join(' ') || p?.email || 'Unknown';

// E1 — the silent stop, surfaced.
//
// Editing a sendable sequence resets it to 'draft' (migration 022 trigger) and
// the scheduler then holds every enrollment on it, 30 minutes at a time, for
// ever. Before migration 030 that state was unrepresentable: `held` and a
// never-approved draft were the same row, so this screen showed both as "Not
// approved" and outreach stopped with nothing on screen saying so.
//
// A sequence is HELD when it carries the status it fell from. That is the only
// signal — not enrollment counts, which lag by up to one scheduler window.
const isHeld = (seq) => Boolean(seq.heldFromStatus);

// Only 'active' and 'scheduled' had sends in flight. Falling out of 'approved'
// or 'paused' still needs re-approval, but nothing stopped — don't claim it did.
const wasSending = (seq) => ['active', 'scheduled'].includes(seq.heldFromStatus);

/** Sends the scheduler is actually sitting on for this sequence, right now. */
const heldSendCount = (seq, enrollments) =>
    enrollments.filter((e) => e.sequenceId === seq.id && e.status === 'active' && e.holdReason).length;

/** Oldest hold on the sequence — how long sending has actually been stopped. */
const heldSince = (seq, enrollments) =>
    enrollments
        .filter((e) => e.sequenceId === seq.id && e.status === 'active' && e.heldSince)
        .map((e) => e.heldSince)
        .sort()[0] ?? seq.heldAt;

const OutreachEngine = ({ workspaceId, zohoConnected, refreshKey = 0 }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [sequences, setSequences] = useState([]);
    const [enrollments, setEnrollments] = useState([]);
    const [replies, setReplies] = useState([]);
    const [counts, setCounts] = useState({ sends: 0, replies: 0, meetings: 0 });

    // Review & approve modal
    const [reviewSeq, setReviewSeq] = useState(null);
    const [reviewSteps, setReviewSteps] = useState([]);
    const [approving, setApproving] = useState(false);
    const [reviewError, setReviewError] = useState('');

    // Enroll modal
    const [enrollSeq, setEnrollSeq] = useState(null);
    const [prospects, setProspects] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [enrolling, setEnrolling] = useState(false);
    const [enrollError, setEnrollError] = useState('');
    const [lists, setLists] = useState([]);
    const [enrollListId, setEnrollListId] = useState('');

    const load = useCallback(async () => {
        try {
            const [seqs, enrs, reps, cts, lls] = await Promise.all([
                sequencesService.list(workspaceId),
                enrollmentsService.list(workspaceId),
                repliesService.list(workspaceId),
                repliesService.activityCounts(workspaceId),
                prospectListsService.listLists(workspaceId),
            ]);
            setSequences(seqs);
            setEnrollments(enrs);
            setReplies(reps);
            setCounts(cts);
            setLists(lls);
            setError('');
        } catch (err) {
            setError(toUserMessage(err, 'Could not load the send engine.'));
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => { if (!cancelled) await load(); })();
        return () => { cancelled = true; };
    }, [workspaceId, load, refreshKey]);

    const unresolvable = useMemo(() => findUnresolvableTokens(reviewSteps), [reviewSteps]);

    // E1 rollup. Sequences that were mid-flight when they were edited come
    // first — those are the ones where sends are piling up behind a hold.
    const heldSequences = useMemo(
        () => sequences.filter(isHeld).sort((a, b) => Number(wasSending(b)) - Number(wasSending(a))),
        [sequences],
    );
    const stoppedCount = heldSequences.filter(wasSending).length;

    const openReview = (seq) => {
        setReviewSeq(seq);
        setReviewSteps(seq.steps.map((s) => ({ ...s })));
        setReviewError('');
    };

    const handleApprove = async () => {
        if (!reviewSeq) return;
        setApproving(true);
        setReviewError('');
        // E1: the save and the approval are two statements, and the edit trigger
        // fires on the first. If the second fails, the sequence is left demoted
        // and holding — the exact silent stop this epic exists to end. Track
        // which half landed so the error can say what actually happened.
        let editLanded = false;
        const wasLive = isHeld(reviewSeq) || ['approved', 'active', 'scheduled'].includes(reviewSeq.status);
        try {
            const edited = JSON.stringify(reviewSteps) !== JSON.stringify(reviewSeq.steps);
            if (edited) {
                await sequencesService.updateSteps(workspaceId, reviewSeq.id, reviewSteps);
                editLanded = true;
            }
            await sequencesService.approve(workspaceId, reviewSeq.id);
            setReviewSeq(null);
            setNotice(
                isHeld(reviewSeq)
                    ? `"${reviewSeq.name}" re-approved — held sends resume in the next scheduler window.`
                    : `"${reviewSeq.name}" approved — enroll prospects to schedule sends.`,
            );
            await load();
        } catch (err) {
            const base = toUserMessage(err, 'Approval failed.');
            setReviewError(
                editLanded && wasLive
                    ? `${base} Your edits were saved, which withdrew approval — this sequence is NOT sending until you approve it again.`
                    : base,
            );
            // Reload regardless: if the edit landed, the row's state changed and
            // the screen must show it rather than the state from before.
            if (editLanded) await load();
        } finally {
            setApproving(false);
        }
    };

    const openEnroll = async (seq) => {
        setEnrollSeq(seq);
        setEnrollError('');
        setSelectedIds(new Set());
        setEnrollListId(seq.targetListId || '');
        try {
            const rows = (await prospectsService.list(workspaceId)).filter((p) => p.email);
            setProspects(rows);
            // If the sequence was built for a list, preselect its emailed members.
            if (seq.targetListId) {
                const members = await prospectListsService.listMembers(workspaceId, seq.targetListId);
                const availIds = new Set(rows.map((p) => p.id));
                setSelectedIds(new Set(members.filter((m) => m.email && availIds.has(m.id)).map((m) => m.id)));
            }
        } catch (err) {
            setEnrollError(toUserMessage(err, 'Could not load prospects.'));
        }
    };

    // Preselect the checkbox list from a chosen list's emailed members.
    const onEnrollListChange = async (listId) => {
        setEnrollListId(listId);
        if (!listId) { setSelectedIds(new Set()); return; }
        try {
            const members = await prospectListsService.listMembers(workspaceId, listId);
            const availIds = new Set(prospects.map((p) => p.id));
            setSelectedIds(new Set(members.filter((m) => m.email && availIds.has(m.id)).map((m) => m.id)));
        } catch (err) {
            setEnrollError(toUserMessage(err, 'Could not load that list.'));
        }
    };

    const handleEnroll = async () => {
        if (!enrollSeq || selectedIds.size === 0) return;
        setEnrolling(true);
        setEnrollError('');
        try {
            const chosen = prospects.filter((p) => selectedIds.has(p.id));
            const res = await enrollmentsService.enroll(workspaceId, enrollSeq.id, chosen);
            const skipped = res.skipped.suppressed + res.skipped.alreadyEnrolled + res.skipped.missingEmail;
            setEnrollSeq(null);
            setNotice(
                `${res.enrolled} enrolled in "${enrollSeq.name}"` +
                (skipped ? ` · ${skipped} skipped (${res.skipped.suppressed} suppressed, ${res.skipped.alreadyEnrolled} already enrolled, ${res.skipped.missingEmail} missing email)` : '') +
                '. First sends go out in the next scheduler window.',
            );
            await load();
        } catch (err) {
            setEnrollError(toUserMessage(err, 'Enrollment failed.'));
        } finally {
            setEnrolling(false);
        }
    };

    const act = async (fn, successMsg) => {
        try {
            await fn();
            if (successMsg) setNotice(successMsg);
            await load();
        } catch (err) {
            setError(toUserMessage(err, 'That action failed.'));
        }
    };

    if (loading) return <EmptyState loading message="Loading send engine…" />;

    return (
        <div className="outreach-engine">
            {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
            {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
            {!zohoConnected && (
                <Panel className="module-panel">
                    <p className="brand-intel-module__source-label">
                        ⚠ Connect Zoho CRM (Integrations) to send. Approved sequences hold — nothing is dropped — and sends start once connected.
                    </p>
                </Panel>
            )}

            {/* E1 · the stop, said out loud. Rolled up here as well as shown on
                each row, because the whole failure was that a stopped sequence
                looked like an ordinary draft you had not got round to yet. */}
            {heldSequences.length > 0 && (
                <Panel className="module-panel engine-hold-banner">
                    <p className="engine-hold-banner__title" role="alert">
                        {stoppedCount > 0
                            ? `${stoppedCount} sequence${stoppedCount === 1 ? ' has' : 's have'} stopped sending`
                            : `${heldSequences.length} sequence${heldSequences.length === 1 ? '' : 's'} need${heldSequences.length === 1 ? 's' : ''} re-approval`}
                    </p>
                    <p className="brand-intel-module__source-label">
                        Editing the copy withdraws approval — what you approved is no longer what would send, so nothing goes out until you approve it again. Nothing is dropped: held sends resume from where they stopped.
                    </p>
                    <div className="platform-pills">
                        {heldSequences.map((seq) => {
                            const n = heldSendCount(seq, enrollments);
                            return (
                                <button
                                    key={seq.id}
                                    type="button"
                                    className="btn btn-secondary btn-sm platform-pill"
                                    onClick={() => openReview(seq)}
                                >
                                    {seq.name}{n > 0 ? ` · ${n} waiting` : ''}
                                </button>
                            );
                        })}
                    </div>
                </Panel>
            )}

            <div className="engine-counters">
                {[
                    { label: 'Sends', value: counts.sends },
                    { label: 'Replies', value: counts.replies },
                    { label: 'Meetings', value: counts.meetings },
                ].map((c) => (
                    <div key={c.label} className="kepler-tile engine-counter">
                        <span className="engine-counter__value">{c.value}</span>
                        <span className="label-text">{c.label}</span>
                    </div>
                ))}
            </div>

            <Panel className="module-panel">
                <PanelHeader
                    title="Executable sequences"
                    meta="Nothing sends without your approval — editing an approved sequence withdraws it, and the row says so."
                />
                {sequences.length === 0 ? (
                    <EmptyState message="No executable sequences yet. Generate one in the Builder tab, then choose 'Prepare for sending'." />
                ) : (
                    <div className="engine-table" role="table">
                        {sequences.map((seq) => {
                            const seqEnrollments = enrollments.filter((e) => e.sequenceId === seq.id);
                            const held = isHeld(seq);
                            const holdCount = held ? heldSendCount(seq, enrollments) : 0;
                            return (
                                <div key={seq.id} className="engine-row" role="row">
                                    <div className="engine-row__main">
                                        <span className="engine-row__title">{seq.name}</span>
                                        <span className="label-text">
                                            {seq.steps.length} email step{seq.steps.length === 1 ? '' : 's'} · {seq.mode}
                                            {seqEnrollments.length ? ` · ${seqEnrollments.length} enrolled` : ''}
                                        </span>
                                        {/* E1: the evidence, on the object it describes — what it
                                            was, when it stopped, and what is waiting because of it. */}
                                        {held && (
                                            <span className="engine-row__hold" role="status">
                                                {wasSending(seq)
                                                    ? `Was ${seq.heldFromStatus} — sending stopped ${formatRelativeTime(heldSince(seq, enrollments))} when the copy was edited.`
                                                    : `Was ${seq.heldFromStatus} — the copy was edited ${formatRelativeTime(seq.heldAt)}, so approval no longer covers it.`}
                                                {holdCount > 0 && ` ${holdCount} send${holdCount === 1 ? '' : 's'} waiting.`}
                                            </span>
                                        )}
                                    </div>
                                    <StatusPill
                                        status={held ? 'Needs re-approval' : (seq.status === 'draft' ? 'Not approved' : seq.status)}
                                        variant={held ? 'warning' : (seq.status === 'draft' ? 'draft' : undefined)}
                                    />
                                    <div className="engine-row__actions">
                                        {(seq.status === 'draft') && (
                                            <button type="button" className="btn btn-primary" onClick={() => openReview(seq)}>
                                                {held ? 'Review & re-approve' : 'Review & approve'}
                                            </button>
                                        )}
                                        {['approved', 'active', 'scheduled'].includes(seq.status) && (
                                            <>
                                                <button type="button" className="btn btn-primary" onClick={() => openEnroll(seq)}>
                                                    Enroll prospects
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => act(() => sequencesService.pause(workspaceId, seq.id), `"${seq.name}" paused — no further sends.`)}
                                                >
                                                    Pause
                                                </button>
                                            </>
                                        )}
                                        {seq.status === 'paused' && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={() => act(() => sequencesService.resume(workspaceId, seq.id), `"${seq.name}" resumed.`)}
                                            >
                                                Resume
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="btn btn-ghost"
                                            onClick={() => act(() => sequencesService.archive(workspaceId, seq.id))}
                                        >
                                            Archive
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Panel>

            <Panel className="module-panel">
                <PanelHeader title="Enrollments" meta="Every prospect × sequence, with the next scheduled touch" />
                {enrollments.length === 0 ? (
                    <EmptyState message="No enrollments yet. Approve a sequence, then enroll prospects." />
                ) : (
                    <div className="engine-table" role="table">
                        {enrollments.map((e) => (
                            <div key={e.id} className="engine-row" role="row">
                                <div className="engine-row__main">
                                    <span className="engine-row__title">
                                        {prospectName(e.prospect)}
                                        {e.prospect?.company ? ` · ${e.prospect.company}` : ''}
                                    </span>
                                    <span className="label-text">
                                        {e.sequenceName} · step {Math.min(e.currentStep + 1, 99)}
                                        {/* E1: "next: 14:30" on a held enrollment is a lie — the
                                            scheduler will only push it another 30 minutes. Say what
                                            is really happening instead. */}
                                        {e.status === 'active' && e.holdReason
                                            ? ` · held since ${formatRelativeTime(e.heldSince)}`
                                            : (e.status === 'active' && e.nextSendAt
                                                ? ` · next: ${new Date(e.nextSendAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
                                                : '')}
                                        {e.stopReason ? ` · ${e.stopReason.replace(/_/g, ' ')}` : ''}
                                    </span>
                                </div>
                                <StatusPill
                                    status={e.status === 'active' && e.holdReason ? 'Held' : (ENROLLMENT_STATUS_LABEL[e.status] ?? e.status)}
                                    variant={e.status === 'active' && e.holdReason ? 'warning' : e.status}
                                />
                                <div className="engine-row__actions">
                                    {e.status === 'active' && (
                                        <>
                                            <button type="button" className="btn btn-secondary" onClick={() => act(() => enrollmentsService.pause(workspaceId, e.id))}>
                                                Pause
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={() => act(
                                                    () => enrollmentsService.markRepliedElsewhere(workspaceId, e),
                                                    'Marked replied — remaining touches cancelled.',
                                                )}
                                            >
                                                Replied elsewhere
                                            </button>
                                        </>
                                    )}
                                    {e.status === 'paused' && (
                                        <button type="button" className="btn btn-secondary" onClick={() => act(() => enrollmentsService.resume(workspaceId, e.id))}>
                                            Resume
                                        </button>
                                    )}
                                    {['stopped_reply', 'active'].includes(e.status) && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => act(() => enrollmentsService.markMeeting(workspaceId, e.id), 'Meeting booked 🎉')}
                                        >
                                            Meeting booked
                                        </button>
                                    )}
                                    {e.prospect?.email && e.status !== 'suppressed' && (
                                        <button
                                            type="button"
                                            className="btn btn-ghost"
                                            onClick={() => act(
                                                () => suppressionService.add(workspaceId, e.prospect.email),
                                                `${e.prospect.email} suppressed permanently.`,
                                            )}
                                        >
                                            Suppress
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Panel>

            <Panel className="module-panel">
                <PanelHeader title="Inbox" meta="Replies, out-of-office, and bounces detected on your sends" />
                {replies.length === 0 ? (
                    <EmptyState message="No replies yet. Detected replies stop their sequence instantly and land here." />
                ) : (
                    <div className="engine-table" role="table">
                        {replies.map((r) => (
                            <div key={r.id} className="engine-row" role="row">
                                <div className="engine-row__main">
                                    <span className="engine-row__title">{prospectName(r.prospect)}</span>
                                    <span className="label-text">
                                        {r.snippet || '(no subject)'} · {formatRelativeTime(r.receivedAt)}
                                        {r.source === 'manual' ? ' · logged manually' : ''}
                                    </span>
                                </div>
                                <StatusPill status={REPLY_KIND_LABEL[r.kind] ?? r.kind} variant={r.kind} />
                            </div>
                        ))}
                    </div>
                )}
            </Panel>

            <Modal
                isOpen={Boolean(reviewSeq)}
                onClose={() => { if (!approving) setReviewSeq(null); }}
                title={`${reviewSeq && isHeld(reviewSeq) ? 'Review & re-approve' : 'Review & approve'} — ${reviewSeq?.name ?? ''}`}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setReviewSeq(null)} disabled={approving}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleApprove}
                            disabled={approving || unresolvable.length > 0}
                        >
                            {approving ? 'Approving…' : 'Approve & schedule'}
                        </button>
                    </>
                }
            >
                {reviewSeq && isHeld(reviewSeq) && (
                    <p className="engine-hold-banner__title" role="status">
                        {wasSending(reviewSeq)
                            ? `This sequence was ${reviewSeq.heldFromStatus} and stopped sending ${formatRelativeTime(heldSince(reviewSeq, enrollments))}, when its copy was edited.`
                            : `This sequence was ${reviewSeq.heldFromStatus} until its copy was edited ${formatRelativeTime(reviewSeq.heldAt)}.`}
                        {' '}Approving below covers what you see now.
                    </p>
                )}
                <p className="brand-intel-module__source-label">
                    This is the identity gate: what you approve here is exactly what sends. {'{{firstName}}'}, {'{{lastName}}'}, {'{{fullName}}'}, {'{{company}}'}, {'{{title}}'} and {'{{email}}'} fill automatically per prospect — every other token must be edited out before approval.
                </p>
                {unresolvable.length > 0 && (
                    <p className="brand-intel-module__error" role="alert">
                        Unresolvable tokens: {unresolvable.join(', ')} — edit them into real copy below.
                    </p>
                )}
                {reviewSteps.map((step, i) => (
                    <div key={i} className="engine-review-step">
                        <label className="label-text">Day {step.dayOffset} · step {i + 1}</label>
                        <input
                            className="intel-input"
                            type="text"
                            value={step.subject}
                            onChange={(e) => setReviewSteps((prev) => prev.map((s, j) => (j === i ? { ...s, subject: e.target.value } : s)))}
                        />
                        <textarea
                            className="intel-textarea"
                            rows={5}
                            value={step.body}
                            onChange={(e) => setReviewSteps((prev) => prev.map((s, j) => (j === i ? { ...s, body: e.target.value } : s)))}
                        />
                    </div>
                ))}
                {reviewError && <p className="brand-intel-module__error" role="alert">{reviewError}</p>}
            </Modal>

            <Modal
                isOpen={Boolean(enrollSeq)}
                onClose={() => { if (!enrolling) setEnrollSeq(null); }}
                title={`Enroll prospects — ${enrollSeq?.name ?? ''}`}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setEnrollSeq(null)} disabled={enrolling}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleEnroll}
                            disabled={enrolling || selectedIds.size === 0}
                        >
                            {enrolling ? 'Enrolling…' : `Enroll ${selectedIds.size || ''}`.trim()}
                        </button>
                    </>
                }
            >
                <p className="brand-intel-module__source-label">
                    Suppressed and already-enrolled prospects are skipped automatically. Sends go out inside business hours ({Intl.DateTimeFormat().resolvedOptions().timeZone}), starting with step 1.
                </p>
                {lists.length > 0 && (
                    <div className="input-group">
                        <label className="label-text">Preselect from a list (optional)</label>
                        <select className="intel-input" value={enrollListId} onChange={(e) => onEnrollListChange(e.target.value)}>
                            <option value="">— none —</option>
                            {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.memberCount})</option>)}
                        </select>
                    </div>
                )}
                {prospects.length === 0 ? (
                    <EmptyState message="No prospects with an email address. Add prospects (with emails) in the Prospecting panel first." />
                ) : (
                    <div className="engine-prospect-list">
                        {prospects.map((p) => (
                            <label key={p.id} className="engine-prospect-item">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(p.id)}
                                    onChange={() => setSelectedIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                                        return next;
                                    })}
                                />
                                <span>
                                    {prospectName(p)}
                                    <span className="label-text"> · {p.company || '—'} · {p.email}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                )}
                {enrollError && <p className="brand-intel-module__error" role="alert">{enrollError}</p>}
            </Modal>
        </div>
    );
};

export default OutreachEngine;
