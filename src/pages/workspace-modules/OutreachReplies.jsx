import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import EmptyState from '../../components/ui/EmptyState';
import StatusPill from '../../components/ui/StatusPill';
import Tabs from '../../components/ui/Tabs';
import ModuleScreen from '../../components/layout/ModuleScreen';
import { repliesService, suppressionService } from '../../services/repliesService';
import { enrollmentsService } from '../../services/enrollmentsService';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { toUserMessage } from '../../lib/errors';
import {
    REPLY_KIND_LABEL,
    filterReplies,
    needsResponse,
    oldestUnansweredHours,
    replyCounts,
} from '../../lib/replyTriage';
import '../../styles/module-kepler.css';
import './Outreach.css';

// Outreach / Replies (E16).
//
// `inbox-monitor` has polled every 10 minutes for months — writing replies,
// stopping sequences on answer, suppressing hard bounces. All of that already
// worked. What did not exist was anywhere to ACT on the result: replies were a
// third panel at the bottom of the Send engine sub-tab, showing a name, a
// subject and a timestamp, with no sequence context and no actions. A reply is
// the highest-value recurring event in the product and it had the least
// prominent surface in it.
//
// This screen is the whole of E16: rank the replies, say what each one answers,
// and let the operator resolve it without leaving.

const prospectName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ') || p?.email || 'Unknown';

const OutreachReplies = ({ workspaceId }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [replies, setReplies] = useState([]);
    const [filter, setFilter] = useState('needs-you');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(async () => {
        try {
            setReplies(await repliesService.listWithContext(workspaceId));
            setError('');
        } catch (err) {
            setError(toUserMessage(err, 'Could not load replies.'));
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => { if (!cancelled) await load(); })();
        return () => { cancelled = true; };
    }, [workspaceId, load]);

    const counts = useMemo(() => replyCounts(replies), [replies]);
    const visible = useMemo(() => filterReplies(replies, filter), [replies, filter]);
    const oldestHours = useMemo(() => oldestUnansweredHours(replies), [replies]);

    // Count on the tab, not a bare label — a queue you can't size is a queue you
    // don't open. Kinds with nothing in them are hidden rather than shown at 0.
    const tabs = useMemo(() => ([
        { id: 'needs-you', label: `Needs you${counts.needsYou ? ` (${counts.needsYou})` : ''}` },
        { id: 'all', label: `All (${counts.all})` },
        ...(counts.ooo ? [{ id: 'ooo', label: `Out of office (${counts.ooo})` }] : []),
        ...(counts.bounce ? [{ id: 'bounce', label: `Bounces (${counts.bounce})` }] : []),
        ...(counts.unsub ? [{ id: 'unsub', label: `Unsubscribed (${counts.unsub})` }] : []),
    ]), [counts]);

    const act = async (id, fn, successMsg) => {
        setBusyId(id);
        setError('');
        try {
            await fn();
            if (successMsg) setNotice(successMsg);
            await load();
        } catch (err) {
            setError(toUserMessage(err, 'That action failed.'));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) {
        return <div className="outreach-module module-kepler"><EmptyState loading message="Loading replies…" /></div>;
    }

    return (
        <ModuleScreen
            className="outreach-module module-kepler"
            moduleKey="outreach-replies"
            banner={
                <>
                    {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                    {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
                </>
            }
            status={<Tabs tabs={tabs} activeTab={filter} onTabChange={setFilter} variant="kepler" />}
        >
            <Panel className="module-panel">
                <PanelHeader
                    title="Replies"
                    meta={
                        counts.needsYou > 0 && oldestHours != null
                            ? `${counts.needsYou} waiting on you · oldest ${oldestHours < 1 ? 'under an hour' : `${oldestHours}h`} ago`
                            : 'Detected on your sends every 10 minutes. A reply stops its sequence immediately.'
                    }
                />

                {visible.length === 0 ? (
                    <EmptyState
                        message={
                            filter === 'needs-you' && counts.all > 0
                                ? 'Nothing waiting on you — every reply has been turned into a meeting or closed out.'
                                : 'No replies detected yet. Replies, out-of-office and bounces on your sent sequences land here automatically.'
                        }
                    />
                ) : (
                    <div className="engine-table" role="table">
                        {visible.map((r) => {
                            const enr = r.enrollment;
                            const pending = needsResponse(r);
                            return (
                                <div key={r.id} className="engine-row" role="row">
                                    <div className="engine-row__main">
                                        <span className="engine-row__title">
                                            {prospectName(r.prospect)}
                                            {r.prospect?.company ? ` · ${r.prospect.company}` : ''}
                                        </span>
                                        {/* The subject, labelled honestly — inbox-monitor stores the
                                            subject line, not the body, so this is not the reply text. */}
                                        <span className="label-text">
                                            {r.snippet ? `“${r.snippet}”` : '(no subject)'} · {formatRelativeTime(r.receivedAt)}
                                            {r.source === 'manual' ? ' · logged manually' : ''}
                                        </span>
                                        {/* The context the old panel never showed: what they replied TO. */}
                                        <span className="label-text">
                                            {enr
                                                ? `${enr.sequenceName || 'Sequence'} · step ${enr.currentStep + 1}${enr.status === 'meeting' ? ' · meeting booked' : ''}`
                                                : 'Sequence no longer available'}
                                        </span>
                                    </div>

                                    <StatusPill
                                        status={REPLY_KIND_LABEL[r.kind] ?? r.kind}
                                        variant={pending ? 'warning' : r.kind}
                                    />

                                    <div className="engine-row__actions">
                                        {pending && (
                                            <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                disabled={busyId === r.id || !enr}
                                                onClick={() => act(
                                                    r.id,
                                                    () => enrollmentsService.markMeeting(workspaceId, enr.id),
                                                    'Meeting booked 🎉',
                                                )}
                                            >
                                                Meeting booked
                                            </button>
                                        )}
                                        {enr?.sequenceId && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => navigate(`../sequences`, { relative: 'path' })}
                                            >
                                                Open sequence
                                            </button>
                                        )}
                                        {r.prospect?.email && r.kind !== 'unsub' && (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                disabled={busyId === r.id}
                                                onClick={() => act(
                                                    r.id,
                                                    () => suppressionService.add(workspaceId, r.prospect.email),
                                                    `${r.prospect.email} suppressed permanently.`,
                                                )}
                                            >
                                                Suppress
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Panel>
        </ModuleScreen>
    );
};

export default OutreachReplies;
