import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ModuleScreen from '../../components/layout/ModuleScreen';
import Panel from '../../components/ui/Panel';
import EmptyState from '../../components/ui/EmptyState';
import { workspacePath } from '../../constants/routes';
import { campaignService } from '../../services/campaignService';
import { WEEKDAY_LABELS, monthCells, toIso, todayIso } from '../../lib/calendarGrid';
import {
    groupByDate,
    monthSummary,
    scheduledStepsAcross,
    unscheduledCount,
} from '../../lib/campaignSchedule';
import { toUserMessage } from '../../lib/errors';
import '../../styles/module-kepler.css';
import './Campaigns.css';

// Campaigns / Calendar (E30, from roadmap S3).
//
// S3 settled that list / board / table are "the same data in different clothes"
// and belong behind a view switcher — but that a calendar is a genuinely
// different job and earns its own nav child: *"what's shipping this month
// across everything" is a scheduling question, not a campaign question.*
//
// A month grid existed already, scoped to one campaign and reachable only by
// opening that campaign and switching its detail view. So the question the
// orchestrator actually asks — across all campaigns — could not be asked at all.

const CampaignsCalendar = ({ workspaceId }) => {
    const navigate = useNavigate();
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [month, setMonth] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });

    const load = useCallback(async () => {
        try {
            setCampaigns(await campaignService.listCampaigns(workspaceId));
            setError('');
        } catch (err) {
            setError(toUserMessage(err, 'Could not load campaigns.'));
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

    const entries = useMemo(() => scheduledStepsAcross(campaigns), [campaigns]);
    const byDate = useMemo(() => groupByDate(entries), [entries]);
    const summary = useMemo(() => monthSummary(entries, month), [entries, month]);
    const undated = useMemo(() => unscheduledCount(campaigns), [campaigns]);

    // Same deep-link contract the campaign detail uses, so a step opened from the
    // calendar lands in the same place with the same context.
    const openStep = (campaign, step) => {
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
        navigate(`${workspacePath(workspaceId, step.module)}?${params.toString()}`);
    };

    const shiftMonth = (delta) =>
        setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

    if (loading) {
        return <div className="campaigns module-kepler"><EmptyState loading message="Loading calendar…" /></div>;
    }

    return (
        <ModuleScreen
            className="campaigns module-kepler"
            moduleKey="campaigns-calendar"
            banner={error ? <p className="brand-intel-module__error" role="alert">{error}</p> : null}
            status={
                <>
                    <span>
                        <strong>{summary.steps}</strong> step{summary.steps === 1 ? '' : 's'}
                        {summary.campaigns > 0 && ` across ${summary.campaigns} campaign${summary.campaigns === 1 ? '' : 's'}`}
                    </span>
                    {summary.done > 0 && <span>{summary.done} done</span>}
                    {/* Undated work is invisible on a calendar by definition. Saying
                        so beats letting an empty month imply there is nothing to do. */}
                    {undated > 0 && <span>{undated} undated</span>}
                </>
            }
        >
            <Panel variant="quiet">
                <div className="campaigns__cal">
                    <div className="campaigns__cal-nav">
                        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
                        <span>{month.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                        <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
                    </div>

                    {entries.length === 0 ? (
                        <EmptyState message="Nothing scheduled yet. Give a campaign's steps dates and they appear here, across every campaign at once." />
                    ) : (
                        <div className="campaigns__cal-grid">
                            {WEEKDAY_LABELS.map((d) => <div key={d} className="campaigns__cal-dow">{d}</div>)}
                            {monthCells(month).map((date, i) => {
                                const iso = date ? toIso(date) : null;
                                const due = iso ? (byDate[iso] ?? []) : [];
                                return (
                                    <div
                                        key={i}
                                        className={`campaigns__cal-cell ${!date ? 'is-blank' : ''} ${iso === todayIso() ? 'is-today' : ''}`}
                                    >
                                        {date && <span className="campaigns__cal-daynum">{date.getDate()}</span>}
                                        {due.map(({ step, campaign }) => (
                                            <button
                                                key={`${campaign.id}:${step.id}`}
                                                type="button"
                                                className={`campaigns__cal-chip campaigns__cal-chip--${step.status}`}
                                                onClick={() => openStep(campaign, step)}
                                                /* The campaign name is the point of a
                                                   cross-campaign view — without it a chip
                                                   is indistinguishable from any other. */
                                                title={`${step.title} · ${campaign.title}`}
                                            >
                                                {step.title}
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Panel>
        </ModuleScreen>
    );
};

export default CampaignsCalendar;
