import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ModuleScreen from '../../components/layout/ModuleScreen';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import EmptyState from '../../components/ui/EmptyState';
import StatusPill from '../../components/ui/StatusPill';
import GoalMath from '../../components/goals/GoalMath';
import NextWork from '../../components/cockpit/NextWork';
import { goalsService } from '../../services/goalsService';
import { recommendationService } from '../../services/recommendationService';
import { MEASURES, MEASURE_IDS, goalWindowAdvice } from '../../lib/goalFeasibility';
import { workspacePath } from '../../constants/routes';
import { toUserMessage } from '../../lib/errors';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import '../../styles/module-kepler.css';
import './Goals.css';

// Goals (E2, roadmap S1) — the rung above campaigns.
//
// Mental model borrowed deliberately from issue trackers: goal = epic, campaign
// = the work under it. The user already owns that model, so the screen honours
// its physics — a goal with no campaigns is the empty state, and its primary
// action is "add the work".
//
// The departure from the issue tracker is the right-hand column: theirs is inert
// metadata, this one carries live math.

const today = () => new Date().toISOString().slice(0, 10);
const inNinetyDays = () => new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

const STATUS_VARIANT = { active: 'info', achieved: 'success', missed: 'error', archived: '' };

const Goals = ({ workspaceId }) => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const openId = searchParams.get('goal');

    const [goals, setGoals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const [detail, setDetail] = useState(null);
    const [campaigns, setCampaigns] = useState([]);
    const [checkpoints, setCheckpoints] = useState([]);
    const [projection, setProjection] = useState(null);

    // E10 — the goal asks for work. Loaded with the detail, not behind a button,
    // because a recommendation you have to request is one nobody sees.
    const [recommendation, setRecommendation] = useState(null);
    const [accepting, setAccepting] = useState(false);
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState(null);
    const [proposal, setProposal] = useState(null);

    const load = useCallback(async () => {
        try {
            setGoals(await goalsService.list(workspaceId));
            setError('');
        } catch (err) {
            setError(toUserMessage(err, 'Could not load goals.'));
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

    // Open one goal: its campaigns, its checkpoints, and its math.
    useEffect(() => {
        if (!workspaceId || !openId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const goal = await goalsService.get(workspaceId, openId);
                if (cancelled || !goal) return;
                const [camps, cps, proj] = await Promise.all([
                    goalsService.campaignsFor(workspaceId, goal.id),
                    goal.kind === 'directional' ? goalsService.checkpoints(workspaceId, goal.id) : [],
                    goalsService.projectionFor(workspaceId, goal),
                ]);
                if (cancelled) return;
                setDetail(goal);
                setCampaigns(camps);
                setCheckpoints(cps);
                setProjection(proj);
                const rec = await recommendationService
                    .forGoal(workspaceId, goal, { projection: proj })
                    .catch(() => null);
                if (!cancelled) setRecommendation(rec);
            } catch (err) {
                if (!cancelled) setError(toUserMessage(err, 'Could not open that goal.'));
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId, openId]);

    const openGoal = (id) => setSearchParams(id ? { goal: id } : {});

    const startCreate = () => {
        setDraft({
            name: '', description: '', kind: 'measured', measure: 'sessions',
            target: '', startDate: today(), endDate: inNinetyDays(),
        });
        setProposal(null);
        setCreating(true);
    };

    // The roadmap's mitigation for "users can't articulate a goal": don't ask for
    // a target on a blank field — propose one from the account's own rates, and
    // show the range it might land in.
    //
    // `proposal` is tri-state: null while it is being read, { proposal: null }
    // when the account has no history for this measure, and the result otherwise.
    // That distinction is the difference between "loading" and "we cannot say",
    // and the form says different things for each.
    useEffect(() => {
        if (!creating || !draft || draft.kind !== 'measured' || !draft.measure || !draft.endDate) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const res = await goalsService.proposeFor(workspaceId, draft.measure, {
                    startDate: draft.startDate, endDate: draft.endDate,
                });
                if (!cancelled) setProposal(res);
            } catch {
                if (!cancelled) setProposal({ proposal: null });
            }
        })();
        return () => { cancelled = true; };
        // Deliberately keyed on the FIELDS the proposal depends on, not `draft`
        // itself — otherwise every keystroke in the name field refetches.
    }, [creating, workspaceId, draft?.kind, draft?.measure, draft?.startDate, draft?.endDate]); // eslint-disable-line react-hooks/exhaustive-deps

    const advice = useMemo(
        () => (draft ? goalWindowAdvice({ startDate: draft.startDate, endDate: draft.endDate }) : null),
        [draft],
    );

    const saveGoal = async () => {
        if (!draft) return;
        try {
            const goal = await goalsService.create(workspaceId, {
                name: draft.name,
                description: draft.description,
                kind: draft.kind,
                measure: draft.kind === 'measured' ? draft.measure : null,
                target: draft.kind === 'measured' ? Number(draft.target) || null : null,
                startDate: draft.startDate,
                endDate: draft.endDate,
                // Keep WHY it was thought reachable, so the forecast can be argued
                // with months later when the rates have moved.
                feasibilityBasis: proposal?.proposal
                    ? { proposed: proposal.proposal.suggested, range: proposal.proposal.range, confidence: proposal.proposal.confidence, basis: proposal.proposal.basis }
                    : {},
                baseline: {},
            });
            setCreating(false);
            setDraft(null);
            setNotice(`“${goal.name}” created. Add the work that will move it.`);
            await load();
            openGoal(goal.id);
        } catch (err) {
            setError(toUserMessage(err, 'Could not create the goal.'));
        }
    };

    const acceptRecommendation = async () => {
        if (!detail || !recommendation?.brief) return;
        setAccepting(true);
        setError('');
        try {
            const res = await recommendationService.accept(workspaceId, {
                goal: detail,
                brief: recommendation.brief,
            });
            if (!res.ok) { setError(res.error); return; }
            navigate(`${workspacePath(workspaceId, 'campaigns', 'all')}?campaign=${res.campaign.id}`);
        } catch (err) {
            setError(toUserMessage(err, 'Could not plan a campaign against this goal.'));
        } finally {
            setAccepting(false);
        }
    };

    const toggleCheckpoint = async (cp) => {
        try {
            await goalsService.toggleCheckpoint(workspaceId, cp.id, !cp.doneAt);
            setCheckpoints(await goalsService.checkpoints(workspaceId, detail.id));
        } catch (err) {
            setError(toUserMessage(err, 'Could not update that checkpoint.'));
        }
    };

    if (loading) return <div className="goals module-kepler"><EmptyState loading message="Loading goals…" /></div>;

    // ── Detail ───────────────────────────────────────────────────────────────
    if (openId && detail && detail.id === openId) {
        return (
            <ModuleScreen
                className="goals module-kepler"
                moduleKey="goal-detail"
                banner={
                    <>
                        <button type="button" className="campaigns__back" onClick={() => openGoal(null)}>← All goals</button>
                        {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                    </>
                }
                status={<StatusPill status={detail.status} variant={STATUS_VARIANT[detail.status]} />}
                primary={
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => navigate(`${workspacePath(workspaceId, 'campaigns')}?new=1&goal=${detail.id}`)}
                    >
                        + New campaign
                    </button>
                }
            >
                <div className="goal-detail">
                    <div className="goal-detail__canvas">
                        <Panel variant="quiet">
                            <h2 className="goal-detail__title">{detail.name}</h2>
                            {detail.description && <p className="goal-detail__desc">{detail.description}</p>}
                        </Panel>

                        <Panel className="module-panel">
                            <PanelHeader
                                title="Campaigns"
                                meta={campaigns.length ? `${campaigns.length} laddering to this goal` : 'The work under this goal'}
                            />
                            {campaigns.length === 0 ? (
                                /* A goal with no campaigns IS the empty state, and its
                                   primary action is "add the work" — per S1. */
                                <EmptyState message="No campaigns yet. A goal moves when there is work under it — start one from the button above." />
                            ) : (
                                <div className="engine-table" role="table">
                                    {campaigns.map((c) => {
                                        const steps = Array.isArray(c.plan?.steps) ? c.plan.steps : [];
                                        const done = steps.filter((s) => s.status === 'done').length;
                                        return (
                                            <div key={c.id} className="engine-row" role="row">
                                                <div className="engine-row__main">
                                                    <span className="engine-row__title">{c.title}</span>
                                                    <span className="label-text">
                                                        {done}/{steps.length} steps · {c.status}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => navigate(`${workspacePath(workspaceId, 'campaigns')}?campaign=${c.id}`)}
                                                >
                                                    Open
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Panel>

                        {detail.kind === 'measured' && (
                            <NextWork
                                recommendation={recommendation}
                                goalName={detail.name}
                                accepting={accepting}
                                onAccept={acceptRecommendation}
                                onPlanManually={() => navigate(`${workspacePath(workspaceId, 'campaigns', 'all')}?new=1&goal=${detail.id}`)}
                            />
                        )}

                        {detail.kind === 'directional' && (
                            <Panel className="module-panel">
                                <PanelHeader title="Checkpoints" meta="How a directional goal shows progress" />
                                {checkpoints.length === 0 ? (
                                    <EmptyState message="No checkpoints yet. Define the milestones that would mean this goal is being met." />
                                ) : (
                                    <ul className="goal-checkpoints">
                                        {checkpoints.map((cp) => (
                                            <li key={cp.id}>
                                                <label>
                                                    <input type="checkbox" checked={Boolean(cp.doneAt)} onChange={() => toggleCheckpoint(cp)} />
                                                    <span className={cp.doneAt ? 'is-done' : ''}>{cp.label}</span>
                                                </label>
                                                {cp.doneAt && <span className="label-text">{formatRelativeTime(cp.doneAt)}</span>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Panel>
                        )}
                    </div>

                    <aside className="goal-detail__rail">
                        <GoalMath goal={detail} projection={projection} />
                    </aside>
                </div>
            </ModuleScreen>
        );
    }

    // ── List ─────────────────────────────────────────────────────────────────
    return (
        <ModuleScreen
            className="goals module-kepler"
            moduleKey="goals"
            banner={
                <>
                    {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                    {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
                </>
            }
            status={goals.length ? <span><strong>{goals.length}</strong> active</span> : null}
            primary={<button type="button" className="btn btn-primary" onClick={startCreate}>New goal</button>}
        >
            {creating && draft && (
                <Panel className="module-panel">
                    <PanelHeader title="New goal" meta="Goals resolve — an end date is required" />
                    <div className="builder-grid">
                        <div className="input-group">
                            <label className="label-text" htmlFor="goal-name">Name</label>
                            <input id="goal-name" className="intel-input" value={draft.name}
                                placeholder="e.g. 1,200 conversions by 31 March"
                                onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                        </div>

                        <div className="input-group">
                            <label className="label-text">Kind</label>
                            <div className="platform-pills">
                                {[
                                    { id: 'measured', label: 'Measured' },
                                    { id: 'directional', label: 'Directional' },
                                ].map((k) => (
                                    <button key={k.id} type="button"
                                        className={`btn btn-secondary platform-pill ${draft.kind === k.id ? 'active' : ''}`}
                                        onClick={() => setDraft({ ...draft, kind: k.id })}>
                                        {k.label}
                                    </button>
                                ))}
                            </div>
                            <p className="brand-intel-module__source-label">
                                {draft.kind === 'measured'
                                    ? 'Bound to a measure Kepler can read. Gets a forecast and a gap.'
                                    : 'Free text — organises campaigns and tracks checkpoints, but gets no forecast. You can attach a measure later.'}
                            </p>
                        </div>

                        {draft.kind === 'measured' && (
                            <div className="input-group">
                                <label className="label-text" htmlFor="goal-measure">Measure</label>
                                <select id="goal-measure" className="intel-input" value={draft.measure}
                                    onChange={(e) => setDraft({ ...draft, measure: e.target.value })}>
                                    {MEASURE_IDS.map((id) => <option key={id} value={id}>{MEASURES[id].label}</option>)}
                                </select>
                            </div>
                        )}

                        <div className="input-group">
                            <label className="label-text" htmlFor="goal-start">Start</label>
                            <input id="goal-start" type="date" className="intel-input" value={draft.startDate}
                                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label className="label-text" htmlFor="goal-end">End</label>
                            <input id="goal-end" type="date" className="intel-input" value={draft.endDate}
                                onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
                        </div>

                        {draft.kind === 'measured' && (
                            <div className="input-group">
                                <label className="label-text" htmlFor="goal-target">Target</label>
                                <input id="goal-target" className="intel-input" type="number" value={draft.target}
                                    placeholder={proposal?.proposal ? String(proposal.proposal.suggested) : 'e.g. 1200'}
                                    onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
                                {/* Propose, never demand. On a cold start this says so
                                    plainly rather than inventing a number. */}
                                <div className="goal-proposal">
                                    {proposal === null && <span className="label-text">Reading your rates…</span>}
                                    {proposal?.proposal && (
                                        <>
                                            <button type="button" className="btn btn-secondary btn-sm"
                                                onClick={() => setDraft({ ...draft, target: String(proposal.proposal.suggested) })}>
                                                Use {new Intl.NumberFormat().format(proposal.proposal.suggested)}
                                            </button>
                                            <span className="label-text">
                                                At your current pace you'd reach{' '}
                                                {new Intl.NumberFormat().format(proposal.proposal.range.low)}–
                                                {new Intl.NumberFormat().format(proposal.proposal.range.high ?? proposal.proposal.range.mid)}
                                                {' '}({proposal.proposal.confidence} confidence)
                                            </span>
                                        </>
                                    )}
                                    {proposal && !proposal.proposal && (
                                        <span className="label-text">
                                            No history for this measure yet — set a target yourself and Kepler will track against it.
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Advisory, never blocking — scaffold, not cage. */}
                    {advice && (
                        <p className={advice.level === 'error' ? 'brand-intel-module__error' : 'brand-intel-module__source-label'}>
                            {advice.message}
                        </p>
                    )}

                    <div className="intel-action-row">
                        <button type="button" className="btn btn-primary" onClick={saveGoal}
                            disabled={!draft.name.trim() || advice?.level === 'error'}>
                            Create goal
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => { setCreating(false); setDraft(null); }}>
                            Cancel
                        </button>
                    </div>
                </Panel>
            )}

            <Panel className="module-panel">
                <PanelHeader title="Goals" meta="Everything ladders to one of these" />
                {goals.length === 0 ? (
                    <EmptyState message="No goals yet. A goal is what campaigns and assets ladder to — without one, generated work has nothing to serve." />
                ) : (
                    <div className="engine-table" role="table">
                        {goals.map((g) => (
                            <div key={g.id} className="engine-row" role="row">
                                <div className="engine-row__main">
                                    <span className="engine-row__title">
                                        {g.isPrimary && <span className="goal-primary-dot" title="Primary goal">★</span>}
                                        {g.name}
                                    </span>
                                    <span className="label-text">
                                        {g.kind === 'measured'
                                            ? `${MEASURES[g.measure]?.label ?? g.measure} · target ${new Intl.NumberFormat().format(g.target ?? 0)}`
                                            : 'Directional'}
                                        {' · ends '}{g.endDate}
                                    </span>
                                </div>
                                <StatusPill status={g.status} variant={STATUS_VARIANT[g.status]} />
                                <div className="engine-row__actions">
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openGoal(g.id)}>Open</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Panel>
        </ModuleScreen>
    );
};

export default Goals;
