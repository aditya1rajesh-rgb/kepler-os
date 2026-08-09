import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from '../../lib/icons';
import ModuleScreen from '../../components/layout/ModuleScreen';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import EmptyState from '../../components/ui/EmptyState';
import GoalHero from '../../components/cockpit/GoalHero';
import NeedsYou from '../../components/cockpit/NeedsYou';
import FunnelSnapshot from '../../components/cockpit/FunnelSnapshot';
import ChannelContribution from '../../components/cockpit/ChannelContribution';
import OtherGoals from '../../components/cockpit/OtherGoals';
import NextWork from '../../components/cockpit/NextWork';
import { cockpitService } from '../../services/cockpitService';
import { changeEventsService } from '../../services/changeEventsService';
import { recommendationService } from '../../services/recommendationService';
import { dashboardService } from '../../services/dashboardService';
import { integrationService } from '../../services/integrationService';
import { MEASURES } from '../../lib/goalFeasibility';
import { workspacePath } from '../../constants/routes';
import { toUserMessage } from '../../lib/errors';
import { useAuth } from '../../context/AuthContext';
import './Dashboard.css';

// The cockpit (E5, roadmap S2) — this screen REPLACES the old dashboard.
//
// THE ADMISSION FILTER, which is the whole design:
//
//   Every card answers one of three questions: what changed since I last looked,
//   what needs me now, or what should I do next. A card that only reports
//   current state does not belong.
//
// That is what keeps this from drifting back into a tile grid. The KPI strip,
// the campaign table and the activity feed that used to live here all failed it:
// they reported, and reporting does not create return. The activity feed's
// actionable half is now the demand queue; its notable half is attached to the
// goal, where movement becomes direction instead of noise.
//
// COLD START IS A DESIGNED STATE, not a fallback. No goal → the screen becomes
// the goal-setting path. No connected data → the funnel says what connecting
// each source would unlock. It degrades into onboarding rather than blankness.

const Dashboard = ({ workspaceId, workspace }) => {
    const navigate = useNavigate();
    const { displayName } = useAuth();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [detecting, setDetecting] = useState(false);
    const [accepting, setAccepting] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!workspaceId) return;
        try {
            setData(await cockpitService.load(workspaceId));
            setError('');
        } catch (err) {
            setError(toUserMessage(err, 'Could not load your workspace.'));
        }
    }, [workspaceId]);

    // Switching workspace resets to loading during render rather than in an
    // effect — React's documented prop-derived reset, and the same pattern
    // ModuleScreen uses for its rail. An effect would paint the previous
    // workspace's cockpit for one frame first, which is exactly the kind of
    // wrong-but-plausible number this screen must never show.
    const [lastWorkspaceId, setLastWorkspaceId] = useState(workspaceId);
    if (workspaceId !== lastWorkspaceId) {
        setLastWorkspaceId(workspaceId);
        setData(null);
        setLoading(true);
    }

    useEffect(() => {
        let cancelled = false;
        load().finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [load]);

    // Refresh pulls fresh provider metrics first — otherwise "refresh" would
    // re-read the same snapshots and look broken.
    const refresh = async () => {
        setRefreshing(true);
        try {
            await dashboardService.refreshAll(workspaceId, {
                statuses: data?.statuses ?? {},
                // Every campaign, not the hero goal's — the GA4 pull matches utm
                // strings against this list, and a short list would dump other
                // campaigns' traffic into the unattributed bucket.
                campaigns: data?.campaigns ?? [],
            }).catch(() => {});
            await load();
        } finally {
            setRefreshing(false);
        }
    };

    const goTo = (module, child) => navigate(workspacePath(workspaceId, module, child));

    const connect = (connector) => {
        if (!connector) return goTo('integrations');
        try {
            window.location.assign(integrationService.buildAuthUrl(workspaceId, connector));
        } catch {
            goTo('integrations');
        }
    };

    const setPrimary = async (goal) => {
        try {
            await cockpitService.setPrimaryGoal(workspaceId, goal.id);
            await load();
        } catch (err) {
            setError(toUserMessage(err, 'Could not set the primary goal.'));
        }
    };

    // The sparkline beside "what moved" is the goal's own measure, borrowed from
    // the funnel stage that shares its metric. The WORDS come from the detectors
    // (cockpitService.movement); this is only the shape of the line.
    const trend = useMemo(() => {
        if (!data?.hero || data.hero.kind !== 'measured') return null;
        const metricKey = MEASURES[data.hero.measure]?.metricKey;
        return (data.funnel ?? []).find((s) => s.metricKey === metricKey) ?? null;
    }, [data]);

    // E7's manual path. The scheduled function does this daily; the button exists
    // because a feature that only works after an ops task is a feature nobody
    // sees — and because "check now" is what you want the moment you suspect
    // something moved.
    const detectNow = async () => {
        setDetecting(true);
        try {
            await changeEventsService.detectNow(workspaceId);
            await load();
        } catch (err) {
            setError(toUserMessage(err, 'Could not check for changes.'));
        } finally {
            setDetecting(false);
        }
    };

    // E10 — accept the recommendation: plan a campaign against the live gap and
    // create it already parented to the goal. One click, because the whole point
    // is that the goal asks for work and getting to the work is the friction.
    const acceptRecommendation = async () => {
        if (!data?.hero || !data?.recommendation?.brief) return;
        setAccepting(true);
        setError('');
        try {
            const res = await recommendationService.accept(workspaceId, {
                goal: data.hero,
                brief: data.recommendation.brief,
            });
            if (!res.ok) { setError(res.error); return; }
            navigate(`${workspacePath(workspaceId, 'campaigns', 'all')}?campaign=${res.campaign.id}`);
        } catch (err) {
            setError(toUserMessage(err, 'Could not plan a campaign against this goal.'));
        } finally {
            setAccepting(false);
        }
    };

    const firstName = (displayName || 'there').split(' ')[0];

    if (loading) {
        return <div className="cockpit module-kepler"><EmptyState loading message="Loading your workspace…" /></div>;
    }

    const hero = data?.hero ?? null;
    const contribution = data?.contribution ?? null;

    return (
        <ModuleScreen
            moduleKey="cockpit"
            className="cockpit module-kepler"
            status={
                <span className="cockpit__greeting">
                    {hero
                        ? `Hello, ${firstName} — here’s where ${workspace?.name || 'your workspace'} stands.`
                        : `Hello, ${firstName} — ${workspace?.name || 'your workspace'} has no goal yet.`}
                </span>
            }
            actions={
                <button type="button" className="btn btn-ghost" onClick={refresh} disabled={refreshing}>
                    <RefreshCw size={15} strokeWidth={1.8} /> {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
            }
            banner={
                <>
                    {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                    {/* Name the zone that failed rather than letting it render as
                        a convincing "nothing here". */}
                    {data?.failures?.length > 0 && (
                        <p className="brand-intel-module__source-label" role="status">
                            Could not load: {data.failures.join(', ')}. The rest of the screen is current.
                        </p>
                    )}
                </>
            }
            primary={
                hero ? null : (
                    <button type="button" className="btn btn-primary" onClick={() => goTo('goals')}>
                        Set your first goal
                    </button>
                )
            }
        >
            {hero ? (
                <GoalHero
                    goal={hero}
                    projection={data.projection}
                    inferred={data.heroInferred}
                    movement={data.movement}
                    trend={trend}
                    detecting={detecting}
                    onDetect={detectNow}
                    campaignCount={data.goalCampaigns?.length ?? 0}
                    onOpenGoal={(g) => navigate(`${workspacePath(workspaceId, 'goals')}?goal=${g.id}`)}
                    onSetPrimary={setPrimary}
                    onAddCampaign={(g) => navigate(`${workspacePath(workspaceId, 'campaigns', 'all')}?new=1&goal=${g.id}`)}
                />
            ) : (
                /* Cold start: the screen IS the goal-setting path. */
                <Panel className="module-panel">
                    <PanelHeader title="Start with a goal" meta="Everything else ladders to it" />
                    <div className="cockpit-empty">
                        <p className="cockpit-empty__lead">
                            Nothing here can tell you how you are doing until there is something to be doing well against.
                        </p>
                        <p className="cockpit-empty__sub">
                            A goal gives campaigns a parent, gives generated assets something to serve, and gives this
                            screen a number to hold you to. Kepler proposes a target from your own history rather than
                            asking you to guess one.
                        </p>
                        <button type="button" className="btn btn-primary" onClick={() => goTo('goals')}>
                            Set your first goal
                        </button>
                    </div>
                </Panel>
            )}

            <div className="cockpit__row">
                <NeedsYou
                    rows={data?.needsYou ?? []}
                    hasGoal={Boolean(hero)}
                    onGo={(row) => goTo(row.module, row.child)}
                    onNextBest={() => (hero
                        ? navigate(`${workspacePath(workspaceId, 'campaigns', 'all')}?new=1&goal=${hero.id}`)
                        : goTo('goals'))}
                />

                <NextWork
                    recommendation={data?.recommendation}
                    goalName={hero?.name ?? ''}
                    accepting={accepting}
                    onAccept={acceptRecommendation}
                    onPlanManually={() => navigate(
                        `${workspacePath(workspaceId, 'campaigns', 'all')}?new=1${hero ? `&goal=${hero.id}` : ''}`,
                    )}
                />
            </div>

            <FunnelSnapshot stages={data?.funnel ?? []} onConnect={(stage) => connect(stage.connector)} />

            <ChannelContribution
                contribution={contribution}
                caveats={data?.caveats ?? []}
                goalName={hero?.name ?? ''}
                onDrill={(row) => navigate(
                    `${workspacePath(workspaceId, 'measurement')}?channel=${encodeURIComponent(row.key)}${hero ? `&goal=${hero.id}` : ''}`,
                )}
            />

            <OtherGoals
                goals={data?.goals ?? []}
                heroId={hero?.id}
                onOpen={(g) => navigate(`${workspacePath(workspaceId, 'goals')}?goal=${g.id}`)}
                onSetPrimary={setPrimary}
            />
        </ModuleScreen>
    );
};

export default Dashboard;
