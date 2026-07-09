import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Telescope,
    Search,
    Megaphone,
    Send,
    AtSign,
    ArrowRight,
    Lock,
    Check,
    Sparkles,
    CircleCheck,
    LoaderCircle,
    Target,
} from '../../lib/icons';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import EmptyState from '../../components/ui/EmptyState';
import CountUp from '../../components/ui/CountUp';
import Ga4Panel from '../../components/overview/Ga4Panel';
import { useActivation } from '../../context/ActivationContext';
import { workspacePath } from '../../constants/routes';
import { isModuleLocked, MODULE_GATES, nextStepModuleId } from '../../lib/activation';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { isoInCurrentWeek } from '../../lib/calendarGrid';
import { feedbackService } from '../../services/feedbackService';
import { brandService } from '../../services/brandService';
import { computeBrandCompleteness } from '../../lib/brandCompleteness';
import './Overview.css';

const TYPE_META = {
    seo: { label: 'SEO & AEO', module: 'seo-aeo' },
    ads: { label: 'Ad Campaigns', module: 'ad-campaigns' },
    outreach: { label: 'Outreach', module: 'outreach' },
    social: { label: 'Social Media', module: 'social-media' },
};

const MODULES = [
    { id: 'brand-intelligence', label: 'Brand Intelligence', icon: Telescope },
    { id: 'seo-aeo', label: 'SEO & AEO', icon: Search },
    { id: 'ad-campaigns', label: 'Ad Campaigns', icon: Megaphone },
    { id: 'outreach', label: 'Outreach', icon: Send },
    { id: 'social-media', label: 'Social Media', icon: AtSign },
];

const Overview = ({ workspaceId, workspace }) => {
    const navigate = useNavigate();
    const {
        readiness,
        summary,
        recent,
        campaigns,
        campaignSummary,
        activation,
        loading,
        refresh,
        brand,
        icpCount,
        competitorCount,
        fileCount,
    } = useActivation();
    const [rollup, setRollup] = useState({ ratingCount: 0, noteCount: 0, avgRating: 0 });
    const brandCompleteness = useMemo(() => computeBrandCompleteness(brand), [brand]);

    // Pending, scheduled campaign steps falling in the current week - the manager's
    // "what's due" glance across all active campaigns.
    const dueThisWeek = useMemo(() => {
        const out = [];
        for (const c of campaigns ?? []) {
            for (const s of c.plan?.steps ?? []) {
                if (s.status === 'pending' && isoInCurrentWeek(s.scheduledDate)) {
                    out.push({ campaignId: c.id, campaignTitle: c.title || c.goal, step: s });
                }
            }
        }
        return out.sort((a, b) => (a.step.scheduledDate < b.step.scheduledDate ? -1 : 1));
    }, [campaigns]);

    // Freshen when landing on the cockpit - catches brand/ICP edits or generations
    // made elsewhere in the workspace since it was first loaded.
    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        let mounted = true;
        feedbackService
            .getWorkspaceFeedbackRollup(workspaceId)
            .then((r) => {
                if (mounted) setRollup(r);
            })
            .catch(() => {});
        return () => {
            mounted = false;
        };
    }, [workspaceId]);

    // Self-heal the stored score for brands saved before completeness was tracked,
    // so Home cards + the workspace hero reflect reality on next load.
    useEffect(() => {
        if (!brand) return;
        if (brandCompleteness.percent !== (workspace?.brandIntelStatus ?? 0)) {
            brandService.persistBrandCompleteness(workspaceId, brand);
        }
    }, [brand, brandCompleteness.percent, workspace, workspaceId]);

    const goModule = (moduleId) => navigate(workspacePath(workspaceId, moduleId));
    const nextModule = nextStepModuleId(activation);

    const inProgress = summary.byStatus.queue + summary.byStatus.generating;
    const kpiTiles = [
        {
            key: 'assets',
            hero: true,
            icon: Sparkles,
            label: 'Assets created',
            value: summary.total,
            sub: 'in this workspace',
            footLabel: 'Open library',
            onFoot: () => goModule('library'),
        },
        {
            key: 'completed',
            icon: CircleCheck,
            label: 'Completed',
            value: summary.byStatus.completed,
            sub: 'ready to use',
            footLabel: 'Open library',
            onFoot: () => goModule('library'),
        },
        {
            key: 'progress',
            icon: LoaderCircle,
            label: 'In progress',
            value: inProgress,
            sub: inProgress === 0 ? 'nothing generating' : 'generating now',
        },
    ];

    return (
        <div className="cockpit">
            {!activation.isActivated && activation.nextAction ? (
                <Panel className="cockpit__next">
                    <div className="cockpit__next-body">
                        <p className="cockpit__eyebrow">
                            Next step · {activation.completedCount}/{activation.steps.length} done
                        </p>
                        <h3 className="cockpit__next-title font-heading">
                            {activation.nextAction.label}
                        </h3>
                        <p className="cockpit__next-desc">{activation.nextAction.description}</p>
                        <button
                            type="button"
                            className="btn btn-primary cockpit__next-cta"
                            onClick={() => navigate(activation.nextAction.to)}
                        >
                            {activation.nextAction.cta}
                            <ArrowRight size={16} strokeWidth={1.8} />
                        </button>
                    </div>
                    <ol className="cockpit__steps">
                        {activation.steps.map((step, index) => (
                            <li
                                key={step.id}
                                className={[
                                    'cockpit__step',
                                    step.done ? 'cockpit__step--done' : '',
                                    index === activation.currentStepIndex ? 'cockpit__step--current' : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                            >
                                <span className="cockpit__step-marker" aria-hidden="true">
                                    {step.done ? <Check size={14} strokeWidth={2.4} /> : index + 1}
                                </span>
                                <span className="cockpit__step-text">
                                    <span className="cockpit__step-label">{step.label}</span>
                                    <span className="cockpit__step-hint">{step.hint}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                </Panel>
            ) : (
                <Panel className="cockpit__next cockpit__next--ready">
                    <div className="cockpit__next-body">
                        <p className="cockpit__eyebrow">
                            <Sparkles size={14} strokeWidth={1.8} /> Fully set up
                        </p>
                        <h3 className="cockpit__next-title font-heading">
                            {workspace?.name ? `${workspace.name} is ready to create` : 'Ready to create'}
                        </h3>
                        <p className="cockpit__next-desc">
                            Brand intelligence and your audience are in place. Jump into any module below.
                        </p>
                    </div>
                </Panel>
            )}

            <div className="kpi-row">
                {kpiTiles.map((kpi, i) => {
                    const Icon = kpi.icon;
                    return (
                        <article
                            key={kpi.key}
                            className={`pcard kpi-card reveal ${kpi.hero ? 'kpi-card--hero' : ''}`}
                            style={{ '--i': i }}
                        >
                            <div className="kpi-card__top">
                                <span className="kpi-card__icon">
                                    <Icon size={19} strokeWidth={1.7} />
                                </span>
                            </div>
                            <div className="kpi-card__body">
                                <span className="kpi-card__label">{kpi.label}</span>
                                <CountUp value={kpi.value} className="kpi-card__value" />
                                <span className="kpi-card__sub">{kpi.sub}</span>
                            </div>
                            {kpi.footLabel && (
                                <button type="button" className="kpi-card__foot" onClick={kpi.onFoot}>
                                    <span>{kpi.footLabel}</span>
                                    <ArrowRight size={15} strokeWidth={1.8} />
                                </button>
                            )}
                        </article>
                    );
                })}
            </div>

            {activation.isActivated && (
                <Panel className="cockpit__campaigns">
                    <PanelHeader
                        title={campaignSummary.active > 0 ? `Active campaigns · ${campaignSummary.active}` : 'Campaigns'}
                        meta="Coordinated, multi-channel plans across your modules"
                        action={
                            <button type="button" className="dash-chip-btn" onClick={() => goModule('campaigns')}>
                                <Target size={15} strokeWidth={1.8} /> {campaigns.length > 0 ? 'View all' : 'New campaign'}
                            </button>
                        }
                    />
                    {campaigns.length === 0 ? (
                        <p className="cockpit__camp-empty">
                            Turn a goal into a sequenced plan across every module.{' '}
                            <button type="button" className="cockpit__intel-link" onClick={() => goModule('campaigns')}>
                                Start a campaign →
                            </button>
                        </p>
                    ) : (
                        <ul className="cockpit__camp-list">
                            {campaigns.slice(0, 4).map((c) => {
                                const steps = c.plan?.steps ?? [];
                                const done = steps.filter((s) => s.status === 'done').length;
                                return (
                                    <li key={c.id}>
                                        <button
                                            type="button"
                                            className="cockpit__camp-row"
                                            onClick={() => navigate(`${workspacePath(workspaceId, 'campaigns')}?campaign=${c.id}`)}
                                        >
                                            <span className="cockpit__camp-main">
                                                <span className="cockpit__camp-title">{c.title || c.goal}</span>
                                                <span className="cockpit__camp-sub">{done}/{steps.length} steps done</span>
                                            </span>
                                            <span className="cockpit__camp-cta">
                                                Continue <ArrowRight size={15} strokeWidth={1.8} />
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {dueThisWeek.length > 0 && (
                        <div className="cockpit__due">
                            <span className="cockpit__due-label">Due this week</span>
                            <ul className="cockpit__due-list">
                                {dueThisWeek.map(({ campaignId, campaignTitle, step }) => (
                                    <li key={step.id}>
                                        <button
                                            type="button"
                                            className="cockpit__due-row"
                                            onClick={() => navigate(`${workspacePath(workspaceId, 'campaigns')}?campaign=${campaignId}`)}
                                        >
                                            <span className="cockpit__due-dot" aria-hidden="true" />
                                            <span className="cockpit__due-title">{step.title}</span>
                                            <span className="cockpit__due-meta">{campaignTitle}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </Panel>
            )}

            <Panel className="cockpit__intel">
                <PanelHeader
                    title="What KEPLER knows"
                    meta="Compounding intelligence that grounds every generation"
                />
                <div className="cockpit__intel-facts">
                    <div className="cockpit__intel-fact">
                        <span className="cockpit__intel-value font-heading">
                            {brandCompleteness.percent}%
                        </span>
                        <span className="cockpit__intel-label">Brand profile</span>
                    </div>
                    <div className="cockpit__intel-fact">
                        <span className="cockpit__intel-value font-heading">{icpCount}</span>
                        <span className="cockpit__intel-label">ICP{icpCount === 1 ? '' : 's'} defined</span>
                    </div>
                    <div className="cockpit__intel-fact">
                        <span className="cockpit__intel-value font-heading">{competitorCount}</span>
                        <span className="cockpit__intel-label">
                            Competitor{competitorCount === 1 ? '' : 's'}
                        </span>
                    </div>
                    <div className="cockpit__intel-fact">
                        <span className="cockpit__intel-value font-heading">{fileCount}</span>
                        <span className="cockpit__intel-label">
                            File{fileCount === 1 ? '' : 's'} learned from
                        </span>
                    </div>
                </div>
                {brandCompleteness.percent < 100 && (
                    <p className="cockpit__intel-hint">
                        Brand profile is {brandCompleteness.percent}% - add{' '}
                        {brandCompleteness.missing.map((m) => m.label).join(', ')} to reach 100%.{' '}
                        <button
                            type="button"
                            className="cockpit__intel-link"
                            onClick={() =>
                                navigate(`${workspacePath(workspaceId, 'brand-intelligence')}?tab=overview`)
                            }
                        >
                            Complete in Brand Intelligence →
                        </button>
                    </p>
                )}
                <p className="cockpit__intel-feedback">
                    {rollup.ratingCount > 0 ? (
                        <>
                            Learning from <strong>{rollup.ratingCount}</strong> rating
                            {rollup.ratingCount === 1 ? '' : 's'} - <strong>{rollup.noteCount}</strong> note
                            {rollup.noteCount === 1 ? '' : 's'} actively sharpening results
                            {rollup.avgRating ? ` · ${rollup.avgRating.toFixed(1)}★ avg` : ''}.
                        </>
                    ) : (
                        <>
                            Rate outputs in any module to start teaching KEPLER your preferences - your
                            notes shape every future generation.
                        </>
                    )}
                </p>
            </Panel>

            <Ga4Panel workspaceId={workspaceId} />

            <div className="cockpit__cols">
                <Panel>
                    <PanelHeader title="Recent activity" meta="Across every module" />
                    {loading && recent.length === 0 ? (
                        <EmptyState loading message="Loading activity…" />
                    ) : recent.length === 0 ? (
                        <EmptyState message="No content yet - your generated assets will appear here." />
                    ) : (
                        <ul className="cockpit__activity">
                            {recent.map((item) => {
                                const meta = TYPE_META[item.type] ?? {
                                    label: item.type,
                                    module: 'brand-intelligence',
                                };
                                return (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            className="cockpit__activity-row"
                                            onClick={() => goModule(meta.module)}
                                        >
                                            <span className="cockpit__activity-main">
                                                <span className="cockpit__activity-title">
                                                    {item.title || 'Untitled'}
                                                </span>
                                                <span className="cockpit__activity-sub">
                                                    {meta.label} · {item.status}
                                                </span>
                                            </span>
                                            <span className="cockpit__activity-time">
                                                {formatRelativeTime(item.createdAt)}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Panel>

                <Panel>
                    <PanelHeader title="Modules" meta="Jump in - locked modules show what unlocks them" />
                    <ul className="cockpit__modules">
                        {MODULES.map((module) => {
                            const locked = isModuleLocked(module.id, readiness);
                            const isNext = nextModule === module.id;
                            const Icon = module.icon;
                            return (
                                <li key={module.id}>
                                    <button
                                        type="button"
                                        className={`cockpit__module ${isNext ? 'cockpit__module--next' : ''}`}
                                        onClick={() => goModule(module.id)}
                                    >
                                        <Icon
                                            size={18}
                                            strokeWidth={1.6}
                                            className="cockpit__module-icon"
                                        />
                                        <span className="cockpit__module-label">{module.label}</span>
                                        {locked ? (
                                            <span
                                                className="cockpit__module-lock"
                                                title={MODULE_GATES[module.id]?.unmetLabel}
                                            >
                                                <Lock size={13} strokeWidth={1.8} />
                                            </span>
                                        ) : isNext ? (
                                            <span className="cockpit__module-badge">Start here</span>
                                        ) : (
                                            <ArrowRight
                                                size={15}
                                                strokeWidth={1.6}
                                                className="cockpit__module-go"
                                            />
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </Panel>
            </div>
        </div>
    );
};

export default Overview;
