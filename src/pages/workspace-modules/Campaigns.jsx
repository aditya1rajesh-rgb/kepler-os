import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Plus,
    Target,
    Search,
    Megaphone,
    Send,
    AtSign,
    ArrowRight,
    ArrowLeft,
    Check,
    SkipForward,
    Undo2,
    Sparkles,
    LoaderCircle,
    Trash2,
    CalendarDays,
    List,
    CalendarClock,
} from '../../lib/icons';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import ModuleScreen from '../../components/layout/ModuleScreen';
import ToolRail, { ToolCard, ToolGroup } from '../../components/layout/ToolRail';
import Tabs from '../../components/ui/Tabs';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import StatusPill from '../../components/ui/StatusPill';
import SetupRequired from '../../components/workspace/SetupRequired';
import CampaignIntake from '../../components/campaign-intake/CampaignIntake';
import { useWorkspaceConfig } from '../../hooks/useWorkspaceConfig';
import { campaignService } from '../../services/campaignService';
import { stepExecutorService } from '../../services/stepExecutorService';
import { strategyService } from '../../services/strategyService';
import { CAMPAIGN_TYPES, CAMPAIGN_TEMPLATES } from '../../lib/campaignPlan';
import { WEEKDAY_LABELS, monthCells, toIso, todayIso, addDays } from '../../lib/calendarGrid';
import { workspacePath } from '../../constants/routes';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { toUserMessage } from '../../lib/errors';
import './Campaigns.css';

const MODULE_META = {
    'seo-aeo': { label: 'SEO & AEO', icon: Search },
    'ad-campaigns': { label: 'Ad Campaigns', icon: Megaphone },
    outreach: { label: 'Outreach', icon: Send },
    'social-media': { label: 'Social Media', icon: AtSign },
};

const CAMPAIGN_STATUS_VARIANT = {
    draft: 'warning',
    active: 'info',
    completed: 'completed',
    archived: '',
};

const STEP_STATUS_VARIANT = {
    pending: 'pending',
    generating: 'info',
    done: 'completed',
    skipped: '',
};

const LIST_TABS = [
    { id: 'active', label: 'Active' },
    { id: 'draft', label: 'Drafts' },
    { id: 'completed', label: 'Past' },
];

const stepCounts = (campaign) => {
    const steps = campaign?.plan?.steps ?? [];
    const done = steps.filter((s) => s.status === 'done').length;
    return { done, total: steps.length };
};

const Campaigns = ({ workspaceId }) => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { readiness } = useWorkspaceConfig(workspaceId);
    const activeId = searchParams.get('campaign');

    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [listTab, setListTab] = useState('active');

    const [detail, setDetail] = useState(null);
    const [detailState, setDetailState] = useState('loading'); // loading | ready | missing
    const [assets, setAssets] = useState([]);
    const [execBusyId, setExecBusyId] = useState(null); // stepId currently auto-executing
    const [execErrors, setExecErrors] = useState({}); // stepId → error message
    const [detailView, setDetailView] = useState('plan'); // plan | calendar
    const [calMonth, setCalMonth] = useState(() => new Date());

    const [showIntake, setShowIntake] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [goal, setGoal] = useState('');
    const [type, setType] = useState('launch');
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const [eventModalOpen, setEventModalOpen] = useState(false);
    const [eventName, setEventName] = useState('');
    const [eventDate, setEventDate] = useState('');

    const canCreate = readiness.hasBrandContext && readiness.hasIcps;

    // Reload the campaign list. Used by event handlers (after create/delete/back).
    const loadList = async () => {
        try {
            const rows = await campaignService.listCampaigns(workspaceId);
            setCampaigns(rows);
        } catch {
            setCampaigns([]);
        } finally {
            setLoading(false);
        }
    };

    // Load the list on mount / workspace change - setState only after the await
    // tick (cancellable IIFE), matching the codebase load-on-mount pattern.
    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const rows = await campaignService.listCampaigns(workspaceId);
                if (!cancelled) setCampaigns(rows);
            } catch {
                if (!cancelled) setCampaigns([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    // Palette / deep-link "New campaign": ?new=1 opens the conversational intake once.
    useEffect(() => {
        if (searchParams.get('new') === '1') {
            setShowIntake(true);
            const next = new URLSearchParams(searchParams);
            next.delete('new');
            setSearchParams(next, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    // Load / refresh the detail campaign when ?campaign changes (e.g. returning
    // from a specialist that generated a step). No-op in list view.
    useEffect(() => {
        if (!workspaceId || !activeId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const [c, a] = await Promise.all([
                    campaignService.getCampaign(workspaceId, activeId),
                    campaignService.getCampaignAssets(workspaceId, activeId),
                ]);
                if (cancelled) return;
                if (c) { setDetail(c); setAssets(a); setDetailState('ready'); }
                else { setDetail(null); setDetailState('missing'); }
            } catch {
                if (!cancelled) { setDetail(null); setDetailState('missing'); }
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId, activeId]);

    const openDetail = (id) => {
        setDetail(null);
        setDetailState('loading');
        setSearchParams({ campaign: id });
    };
    const backToList = () => {
        setSearchParams({});
        loadList();
    };

    const visibleCampaigns = useMemo(
        () => campaigns.filter((c) => (listTab === 'completed'
            ? c.status === 'completed' || c.status === 'archived'
            : c.status === listTab)),
        [campaigns, listTab],
    );

    const handleGenerate = async () => {
        if (!goal.trim()) { setError('Describe the campaign goal first.'); return; }
        setGenerating(true);
        setError('');
        try {
            const res = await strategyService.generateCampaignPlan(workspaceId, { goal, campaignType: type });
            if (!res.ok) { setError(res.error || 'Could not generate a plan.'); return; }
            const created = await campaignService.createCampaign(workspaceId, {
                title: res.title,
                goal,
                campaignType: type,
                plan: res.plan,
                source: 'strategy-engine',
            });
            setModalOpen(false);
            setShowIntake(false);
            setGoal('');
            setType('launch');
            await loadList();
            openDetail(created.id);
        } catch (err) {
            setError(toUserMessage(err));
        } finally {
            setGenerating(false);
        }
    };

    // Event-anchored campaign: KEPLER plans the marketing around a user's event
    // (steps scheduled relative to the event date - build-up before, follow-up after).
    const handleGenerateEvent = async () => {
        if (!eventName.trim() || !eventDate) { setError('Add an event name and date.'); return; }
        setGenerating(true);
        setError('');
        try {
            const res = await strategyService.generateCampaignPlan(workspaceId, {
                goal: `Support the event "${eventName}" (on ${eventDate}) with a coordinated marketing push.`,
                campaignType: 'launch',
                anchorLabel: eventName,
                anchorDate: eventDate,
            });
            if (!res.ok) { setError(res.error || 'Could not build the event plan.'); return; }
            // Pre-schedule steps around the event date using their offsets.
            const anchor = new Date(`${eventDate}T00:00:00`);
            const plan = {
                ...res.plan,
                steps: res.plan.steps.map((s) => ({
                    ...s,
                    scheduledDate: Number.isFinite(s.offsetDays) ? toIso(addDays(anchor, s.offsetDays)) : null,
                })),
            };
            const created = await campaignService.createCampaign(workspaceId, {
                title: eventName,
                goal: plan.goal,
                campaignType: plan.campaignType,
                plan,
                source: 'event',
            });
            setEventModalOpen(false);
            setEventName('');
            setEventDate('');
            await loadList();
            openDetail(created.id);
        } catch (err) {
            setError(toUserMessage(err));
        } finally {
            setGenerating(false);
        }
    };

    const buildStepLink = (campaign, step) => {
        const params = new URLSearchParams();
        params.set('campaign', campaign.id);
        params.set('step', step.id);
        if (step.brief) params.set('brief', step.brief);
        const cfg = step.suggestedConfig ?? {};
        if (step.module === 'social-media' || step.module === 'seo-aeo') {
            params.set('topic', cfg.topic || step.title || '');
        }
        if ((step.module === 'ad-campaigns' || step.module === 'outreach') && cfg.icpId) {
            params.set('icp', cfg.icpId);
        }
        return `${workspacePath(workspaceId, step.module)}?${params.toString()}`;
    };

    const confirmPlan = async () => {
        if (!detail) return;
        const updated = await campaignService.updateCampaign(workspaceId, detail.id, { status: 'active' });
        setDetail(updated);
        loadList();
    };

    const changeStepStatus = async (stepId, status) => {
        if (!detail) return;
        const updated = await campaignService.updateStep(workspaceId, detail.id, stepId, { status });
        setDetail(updated);
    };

    // Auto-execute a step in place: generate the asset headlessly, attach it,
    // leave the step pending for review. One at a time — the ai-proxy rate
    // limit (and the user's sanity) don't want four pipelines in parallel.
    const runStep = async (step) => {
        if (!detail || execBusyId) return;
        setExecBusyId(step.id);
        setExecErrors((errs) => ({ ...errs, [step.id]: '' }));
        try {
            const res = await stepExecutorService.executeStep(workspaceId, detail, step);
            if (!res.ok) {
                setExecErrors((errs) => ({ ...errs, [step.id]: res.error }));
            } else {
                if (res.campaign) setDetail(res.campaign);
                setAssets(await campaignService.getCampaignAssets(workspaceId, detail.id));
            }
        } catch (error) {
            setExecErrors((errs) => ({ ...errs, [step.id]: toUserMessage(error, 'Generation failed.') }));
        } finally {
            setExecBusyId(null);
        }
    };

    const setStepDate = async (stepId, iso) => {
        if (!detail) return;
        const updated = await campaignService.updateStep(workspaceId, detail.id, stepId, { scheduledDate: iso || null });
        setDetail(updated);
    };

    // Schedule from today, honoring the strategist's per-step offsetDays (steps that
    // share an offset land on the SAME day - parallel). Falls back to a weekly spread
    // by order for older campaigns whose steps have no offsets. One write.
    const autoSchedule = async () => {
        if (!detail) return;
        // Anchor at the event date for event campaigns; otherwise today.
        const anchor = detail.plan?.anchorDate ? new Date(`${detail.plan.anchorDate}T00:00:00`) : new Date();
        const planSteps = detail.plan?.steps ?? [];
        const hasOffsets = planSteps.some((s) => Number.isFinite(s.offsetDays));
        let weeklyIdx = 0;
        const steps = planSteps.map((s) => {
            if (s.status === 'done' || s.status === 'skipped') return s;
            const days = hasOffsets
                ? (Number.isFinite(s.offsetDays) ? s.offsetDays : 0)
                : (weeklyIdx++ * 7);
            return { ...s, scheduledDate: toIso(addDays(anchor, days)) };
        });
        const updated = await campaignService.updateCampaign(workspaceId, detail.id, {
            plan: { ...detail.plan, steps },
        });
        setDetail(updated);
    };

    const removeCampaign = async (e, id) => {
        e.stopPropagation();
        try {
            await campaignService.deleteCampaign(workspaceId, id);
            await loadList();
        } catch { /* non-fatal */ }
    };

    // ---- Detail (manager desk) ----
    if (activeId) {
        if (!detail || detail.id !== activeId) {
            return (
                <div className="campaigns module-kepler">
                    {detailState === 'missing' ? (
                        <EmptyState message="Campaign not found." action={
                            <button type="button" className="btn btn-secondary" onClick={backToList}>Back to campaigns</button>
                        } />
                    ) : (
                        <EmptyState loading message="Loading campaign…" />
                    )}
                </div>
            );
        }
        const { done, total } = stepCounts(detail);
        const assetByStep = Object.fromEntries(assets.map((a) => [a.campaignStepId, a]));
        const steps = detail.plan?.steps ?? [];
        const stepsByDate = {};
        for (const s of steps) if (s.scheduledDate) (stepsByDate[s.scheduledDate] ??= []).push(s);

        // Linked assets are a record of what the plan produced, not something you
        // act on here — every asset already links back from its own step row. It
        // was a full third Panel in v3.
        const linkedAssetsTool = (
            <ToolGroup label="Output">
                <ToolCard title="Linked assets" state={`${assets.length}`} tone={assets.length ? 'ok' : 'idle'}>
                    {assets.length === 0 ? (
                        <p>No assets generated yet — generate a step from the plan.</p>
                    ) : (
                        <ul className="campaigns__assets">
                            {assets.map((a) => (
                                <li key={a.id} className="campaigns__asset">
                                    <span className="campaigns__asset-title">{a.title || 'Untitled'}</span>
                                    <span className="campaigns__asset-meta">
                                        {MODULE_META[`${a.type === 'seo' ? 'seo-aeo' : a.type === 'ads' ? 'ad-campaigns' : a.type === 'social' ? 'social-media' : a.type}`]?.label ?? a.type}
                                        {' · '}{formatRelativeTime(a.createdAt)}
                                    </span>
                                    <StatusPill status={a.status} variant={a.status === 'completed' ? 'completed' : undefined} />
                                </li>
                            ))}
                        </ul>
                    )}
                </ToolCard>
            </ToolGroup>
        );

        return (
            <ModuleScreen
                className="campaigns module-kepler"
                moduleKey="campaign-detail"
                /* The campaign's identity and progress are screen STATE, so they
                   sit in the bar. v3 gave them a full Panel of their own above
                   the plan — the thing you actually came to work on. */
                status={
                    <>
                        <button type="button" className="campaigns__back" onClick={backToList}>
                            <ArrowLeft size={15} strokeWidth={1.8} /> All campaigns
                        </button>
                        <span className="campaigns__type-chip">
                            {CAMPAIGN_TEMPLATES[detail.campaignType]?.label ?? detail.campaignType}
                        </span>
                        <StatusPill status={detail.status} variant={CAMPAIGN_STATUS_VARIANT[detail.status]} />
                        {detail.plan?.anchorDate && (
                            <span className="campaigns__event-chip">
                                <CalendarClock size={12} strokeWidth={1.8} /> {detail.plan.anchorLabel || 'Event'} · {detail.plan.anchorDate}
                            </span>
                        )}
                        <span className="campaigns__progress">{done}/{total} steps done</span>
                    </>
                }
                primary={detail.status === 'draft' ? (
                    <button type="button" className="btn btn-primary" onClick={confirmPlan}>
                        <Check size={16} strokeWidth={1.9} /> Confirm plan
                    </button>
                ) : null}
                rail={<ToolRail>{linkedAssetsTool}</ToolRail>}
                railLabel="Linked assets"
            >
                {/* What this campaign is FOR. It briefly sat in the rail, which
                    hid the campaign's own definition while you worked its plan. */}
                <Panel variant="quiet" className="campaigns__brief">
                    <h2 className="campaigns__detail-title">{detail.title || detail.goal}</h2>
                    {detail.plan?.strategySummary && (
                        <p className="campaigns__detail-summary">{detail.plan.strategySummary}</p>
                    )}
                    {detail.plan?.successCriteria?.length > 0 && (
                        <ul className="campaigns__criteria">
                            {detail.plan.successCriteria.map((c) => (
                                <li key={c}><Target size={13} strokeWidth={1.8} /> {c}</li>
                            ))}
                        </ul>
                    )}
                </Panel>

                <Panel variant="quiet">
                    <PanelHeader
                        title="Plan"
                        meta={`${done}/${total} steps done`}
                        action={
                            <div className="campaigns__plan-tools">
                                <button
                                    type="button"
                                    className="campaigns__autoschedule"
                                    onClick={autoSchedule}
                                    title="Spread unscheduled steps one week apart, starting today"
                                >
                                    <CalendarClock size={14} strokeWidth={1.8} /> Auto-schedule
                                </button>
                                <div className="campaigns__viewtoggle">
                                    <button type="button" className={detailView === 'plan' ? 'is-active' : ''} onClick={() => setDetailView('plan')} title="List view" aria-label="List view">
                                        <List size={15} strokeWidth={1.8} />
                                    </button>
                                    <button type="button" className={detailView === 'calendar' ? 'is-active' : ''} onClick={() => setDetailView('calendar')} title="Calendar view" aria-label="Calendar view">
                                        <CalendarDays size={15} strokeWidth={1.8} />
                                    </button>
                                </div>
                            </div>
                        }
                    />
                    {detailView === 'calendar' ? (
                        <div className="campaigns__cal">
                            <div className="campaigns__cal-nav">
                                <button type="button" onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
                                <span>{calMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                                <button type="button" onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month">›</button>
                            </div>
                            <div className="campaigns__cal-grid">
                                {WEEKDAY_LABELS.map((d) => <div key={d} className="campaigns__cal-dow">{d}</div>)}
                                {monthCells(calMonth).map((date, i) => {
                                    const iso = date ? toIso(date) : null;
                                    const daydue = iso ? (stepsByDate[iso] ?? []) : [];
                                    return (
                                        <div key={i} className={`campaigns__cal-cell ${!date ? 'is-blank' : ''} ${iso === todayIso() ? 'is-today' : ''} ${iso && iso === detail.plan?.anchorDate ? 'is-event' : ''}`}>
                                            {date && <span className="campaigns__cal-daynum">{date.getDate()}</span>}
                                            {iso && iso === detail.plan?.anchorDate && (
                                                <span className="campaigns__cal-event" title={detail.plan.anchorLabel}>
                                                    ★ {detail.plan.anchorLabel || 'Event'}
                                                </span>
                                            )}
                                            {daydue.map((s) => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    className={`campaigns__cal-chip campaigns__cal-chip--${s.status}`}
                                                    onClick={() => navigate(buildStepLink(detail, s))}
                                                    title={`${s.title} · ${MODULE_META[s.module]?.label ?? s.module}`}
                                                >
                                                    {s.title}
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                    <ol className="campaigns__steps">
                        {steps.map((step) => {
                            const meta = MODULE_META[step.module] ?? { label: step.module, icon: Target };
                            const Icon = meta.icon;
                            const asset = step.contentItemId ? assetByStep[step.id] : null;
                            return (
                                <li key={step.id} className={`campaigns__step campaigns__step--${step.status}`}>
                                    <span className="campaigns__step-order">{step.suggestedOrder}</span>
                                    <span className="campaigns__step-icon"><Icon size={17} strokeWidth={1.7} /></span>
                                    <span className="campaigns__step-body">
                                        <span className="campaigns__step-titlerow">
                                            <span className="campaigns__step-title">{step.title}</span>
                                            <span className="campaigns__step-module">{meta.label}</span>
                                        </span>
                                        {step.brief && <span className="campaigns__step-brief">{step.brief}</span>}
                                        {step.rationale && <span className="campaigns__step-rationale">{step.rationale}</span>}
                                        {execErrors[step.id] && (
                                            <span className="campaigns__step-error" role="alert">{execErrors[step.id]}</span>
                                        )}
                                        {step.status !== 'skipped' && (
                                            <span className="campaigns__step-date">
                                                <CalendarDays size={12} strokeWidth={1.8} />
                                                <input
                                                    type="date"
                                                    value={step.scheduledDate || ''}
                                                    onChange={(e) => setStepDate(step.id, e.target.value)}
                                                />
                                                {step.scheduledDate && (
                                                    <button
                                                        type="button"
                                                        className="campaigns__step-date-clear"
                                                        onClick={() => setStepDate(step.id, null)}
                                                        aria-label="Clear scheduled date"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </span>
                                        )}
                                    </span>
                                    <span className="campaigns__step-right">
                                        <StatusPill status={step.status} variant={STEP_STATUS_VARIANT[step.status]} />
                                        {step.status === 'done' && asset ? (
                                            <button
                                                type="button"
                                                className="campaigns__step-link"
                                                onClick={() => navigate(buildStepLink(detail, step))}
                                            >
                                                View asset <ArrowRight size={14} strokeWidth={1.8} />
                                            </button>
                                        ) : step.status !== 'skipped' && step.contentItemId ? (
                                            // Auto-generated, awaiting human review: approve here or open the draft.
                                            <>
                                                <button
                                                    type="button"
                                                    className="campaigns__step-link"
                                                    onClick={() => navigate(buildStepLink(detail, step))}
                                                >
                                                    Review draft <ArrowRight size={14} strokeWidth={1.8} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary campaigns__step-approve"
                                                    onClick={() => changeStepStatus(step.id, 'done')}
                                                >
                                                    <Check size={14} strokeWidth={2} /> Mark done
                                                </button>
                                            </>
                                        ) : step.status !== 'skipped' ? (
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary campaigns__step-gen"
                                                    onClick={() => runStep(step)}
                                                    disabled={Boolean(execBusyId)}
                                                >
                                                    {execBusyId === step.id
                                                        ? <><LoaderCircle size={15} strokeWidth={1.8} className="campaigns__spin" /> Generating…</>
                                                        : <><Sparkles size={15} strokeWidth={1.8} /> Generate now</>}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="campaigns__step-skip"
                                                    title="Open in module instead"
                                                    onClick={() => navigate(buildStepLink(detail, step))}
                                                >
                                                    <ArrowRight size={14} strokeWidth={1.7} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="campaigns__step-skip"
                                                    title="Skip this step"
                                                    onClick={() => changeStepStatus(step.id, 'skipped')}
                                                >
                                                    <SkipForward size={14} strokeWidth={1.7} />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                type="button"
                                                className="campaigns__step-undo"
                                                onClick={() => changeStepStatus(step.id, 'pending')}
                                            >
                                                <Undo2 size={13} strokeWidth={1.8} /> Undo skip
                                            </button>
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                    )}
                </Panel>
            </ModuleScreen>
        );
    }

    // The quick-form fallback modal, reused by the intake + list views.
    const newCampaignModal = (
        <Modal
            isOpen={modalOpen}
            onClose={() => { if (!generating) setModalOpen(false); }}
            title="Quick plan"
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={generating}>
                        Cancel
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
                        {generating ? (
                            <><LoaderCircle size={16} strokeWidth={1.9} className="campaigns__spin" /> Building plan…</>
                        ) : (
                            <><Sparkles size={16} strokeWidth={1.8} /> Generate plan</>
                        )}
                    </button>
                </>
            }
        >
            <label className="campaigns__field-label">What's the goal?</label>
            <textarea
                className="campaigns__goal-input"
                rows={3}
                placeholder="e.g. Launch our new pricing to existing SMB customers over the next 3 weeks"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
            />
            <label className="campaigns__field-label">Campaign type</label>
            <div className="campaigns__type-grid">
                {CAMPAIGN_TYPES.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        className={`campaigns__type-tile ${type === t.id ? 'is-active' : ''}`}
                        onClick={() => setType(t.id)}
                    >
                        <span className="campaigns__type-tile-label">{t.label}</span>
                        <span className="campaigns__type-tile-desc">{t.description}</span>
                    </button>
                ))}
            </div>
            {error && <p className="campaigns__error" role="alert">{error}</p>}
        </Modal>
    );

    const eventModal = (
        <Modal
            isOpen={eventModalOpen}
            onClose={() => { if (!generating) setEventModalOpen(false); }}
            title="Plan around an event"
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={() => setEventModalOpen(false)} disabled={generating}>
                        Cancel
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleGenerateEvent} disabled={generating}>
                        {generating ? (
                            <><LoaderCircle size={16} strokeWidth={1.9} className="campaigns__spin" /> Building plan…</>
                        ) : (
                            <><CalendarClock size={16} strokeWidth={1.8} /> Plan the event</>
                        )}
                    </button>
                </>
            }
        >
            <p className="campaigns__event-hint">
                Tell KEPLER what's happening and when - it builds a campaign scheduled around the date
                (build-up before, follow-up after), which you can generate step by step.
            </p>
            <label className="campaigns__field-label">Event</label>
            <input
                className="campaigns__goal-input"
                placeholder="e.g. Customer roundtable on automating freight operations"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
            />
            <label className="campaigns__field-label">Date</label>
            <input
                type="date"
                className="campaigns__goal-input campaigns__event-date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
            />
            {error && <p className="campaigns__error" role="alert">{error}</p>}
        </Modal>
    );

    // ---- Conversational intake ----
    if (showIntake) {
        return (
            <ModuleScreen
                className="campaigns module-kepler"
                status={
                    <button type="button" className="campaigns__back" onClick={() => setShowIntake(false)}>
                        <ArrowLeft size={15} strokeWidth={1.8} /> All campaigns
                    </button>
                }
            >
                <Panel variant="quiet" className="campaigns__intake-panel">
                    <div className="campaigns__intake-head">
                        <div>
                            <h2 className="campaigns__heading">New campaign</h2>
                            <p className="campaigns__subheading">Chat with the strategist — it designs a plan grounded in your brand.</p>
                        </div>
                        <button type="button" className="campaigns__quicklink" onClick={() => setModalOpen(true)}>
                            Prefer a quick form?
                        </button>
                    </div>
                    <CampaignIntake
                        workspaceId={workspaceId}
                        onCreated={(c) => { setShowIntake(false); loadList(); openDetail(c.id); }}
                    />
                </Panel>
                {newCampaignModal}
            </ModuleScreen>
        );
    }

    // ---- List view ----
    return (
        <ModuleScreen
            className="campaigns module-kepler"
            /* The tab strip is the screen's own filter, so it sits in the bar
               rather than as a third stacked chrome row. v3 also rendered an
               <h2>Campaigns</h2> here directly beneath the app header's own
               "Campaigns" title, plus a sentence explaining the feature. */
            status={
                <Tabs tabs={LIST_TABS} activeTab={listTab} onTabChange={setListTab} variant="kepler" />
            }
            actions={
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEventModalOpen(true)}
                    disabled={!canCreate}
                    title={canCreate ? '' : 'Complete your brand profile and an ICP first'}
                >
                    <CalendarClock size={16} strokeWidth={1.8} /> Plan around an event
                </button>
            }
            primary={
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowIntake(true)}
                    disabled={!canCreate}
                    title={canCreate ? '' : 'Complete your brand profile and an ICP first'}
                >
                    <Plus size={16} strokeWidth={2} /> Plan with the strategist
                </button>
            }
            banner={!canCreate ? (
                <SetupRequired
                    title="Set up your brand before planning a campaign"
                    summary="The strategist grounds every plan in your brand and audience. Add these to start building campaigns."
                    workspaceId={workspaceId}
                    requirements={[
                        { label: 'Brand profile', done: readiness.hasBrandContext, prereq: 'brand' },
                        { label: 'At least one ICP', done: readiness.hasIcps, prereq: 'icp' },
                    ]}
                />
            ) : null}
        >
            {loading ? (
                <EmptyState loading message="Loading campaigns…" />
            ) : visibleCampaigns.length === 0 ? (
                <EmptyState
                    message={
                        campaigns.length === 0
                            ? 'No campaigns yet — turn a goal into a coordinated, multi-channel plan.'
                            : `No ${listTab === 'completed' ? 'past' : listTab} campaigns.`
                    }
                    /* v3 labelled this "New campaign" — identical to the toolbar
                       button, but it opens the quick form while the toolbar one
                       opens the strategist chat. Two labels, two destinations. */
                    action={canCreate && campaigns.length === 0 ? (
                        <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(true)}>
                            <Plus size={16} strokeWidth={2} /> Create from a quick form
                        </button>
                    ) : null}
                />
            ) : (
                <ul className="campaigns__list">
                    {visibleCampaigns.map((c) => {
                        const { done, total } = stepCounts(c);
                        return (
                            <li key={c.id}>
                                <button type="button" className="pcard campaigns__card" onClick={() => openDetail(c.id)}>
                                    <span className="campaigns__card-top">
                                        <span className="campaigns__type-chip">
                                            {CAMPAIGN_TEMPLATES[c.campaignType]?.label ?? c.campaignType}
                                        </span>
                                        <StatusPill status={c.status} variant={CAMPAIGN_STATUS_VARIANT[c.status]} />
                                    </span>
                                    <span className="campaigns__card-title">{c.title || c.goal}</span>
                                    <span className="campaigns__card-channels">
                                        {(c.plan?.channelMix ?? []).map((m) => (
                                            <span key={m} className="campaigns__channel-chip">
                                                {MODULE_META[m]?.label ?? m}
                                            </span>
                                        ))}
                                    </span>
                                    <span className="campaigns__card-foot">
                                        <span className="campaigns__progress">{done}/{total} steps done</span>
                                        <span className="campaigns__card-time">{formatRelativeTime(c.createdAt)}</span>
                                        <span
                                            className="campaigns__card-delete"
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Delete ${c.title || 'campaign'}`}
                                            onClick={(e) => removeCampaign(e, c.id)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') removeCampaign(e, c.id); }}
                                        >
                                            <Trash2 size={14} strokeWidth={1.7} />
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {newCampaignModal}
            {eventModal}
        </ModuleScreen>
    );
};

export default Campaigns;
