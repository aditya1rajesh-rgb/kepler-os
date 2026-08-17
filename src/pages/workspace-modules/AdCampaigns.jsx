import { useEffect, useState } from 'react';
import ContentCard from '../../components/ui/ContentCard';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import ModuleScreen from '../../components/layout/ModuleScreen';
import ToolRail, { ToolCard, ToolGroup } from '../../components/layout/ToolRail';
import EmptyState from '../../components/ui/EmptyState';
import SetupRequired from '../../components/workspace/SetupRequired';
import CampaignStepBanner from '../../components/campaigns/CampaignStepBanner';
import RatingControl from '../../components/ui/RatingControl';
import FeedbackInsight from '../../components/ui/FeedbackInsight';
import GroundedIn from '../../components/ui/GroundedIn';
import CompetitorAdsPanel from '../../components/ad-campaigns/CompetitorAdsPanel';
import { useSearchParams } from 'react-router-dom';
import { useWorkspaceConfig } from '../../hooks/useWorkspaceConfig';
import { adGenerationService } from '../../services/adGenerationService';
import { contentService } from '../../services/contentService';
import { campaignService } from '../../services/campaignService';
import { feedbackService } from '../../services/feedbackService';
import { toUserMessage } from '../../lib/errors';
import '../../styles/module-kepler.css';
import './AdCampaigns.css';

// Generic, non-business UI taxonomy (not customer data). Selections start blank.
const CAMPAIGN_TYPES = [
    { id: 'lead-gen', label: 'Lead Gen' },
    { id: 'event', label: 'Event' },
    { id: 'brand', label: 'Brand Awareness' },
    { id: 'retargeting', label: 'Retargeting' },
    { id: 'launch', label: 'Product Launch' },
];

const PLATFORMS = [
    { id: 'google', label: 'Google Ads' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'meta', label: 'Meta' },
    { id: 'multi', label: 'Multi-platform' },
];

// The per-field character count is built from `fieldStatus`'s keys, which are
// payload field names. `headline` passes as a word by luck; `primaryText` does
// not, and a machine value must never reach the screen.
const FIELD_LABELS = {
    headline: 'Headline',
    primaryText: 'Primary text',
    description: 'Description',
    cta: 'CTA',
    linkDescription: 'Link description',
};
const fieldLabel = (key) =>
    FIELD_LABELS[key]
    ?? String(key)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase());

const EMPTY_CONFIG = {
    name: '',
    type: '',
    icpId: '',
    platform: '',
    goal: '',
    budget: '',
};

const AdCampaigns = ({ workspaceId }) => {
    const { loading, personas, readiness } = useWorkspaceConfig(workspaceId);
    const [searchParams] = useSearchParams();
    const [campaignCtx] = useState(() => ({
        campaignId: searchParams.get('campaign') || null,
        stepId: searchParams.get('step') || '',
        brief: searchParams.get('brief') || '',
    }));
    const [config, setConfig] = useState({
        ...EMPTY_CONFIG,
        icpId: searchParams.get('icp') || '',
        goal: searchParams.get('brief') || '',
    });
    const [variants, setVariants] = useState([]);
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [copiedId, setCopiedId] = useState(null);
    const [saved, setSaved] = useState([]);
    const [feedbackVersion, setFeedbackVersion] = useState(0);
    const [targeting, setTargeting] = useState(null);
    // E3 — what the last generation was grounded in (goal / campaign / prior assets).
    const [groundedIn, setGroundedIn] = useState([]);
    const [copiedTargeting, setCopiedTargeting] = useState(false);
    // Competitive grounding brief from the Meta Ad Library read (empty = off).
    const [competitiveContext, setCompetitiveContext] = useState('');

    // Load previously saved campaigns so they're accessible on return.
    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const rows = await contentService.getContentItems(workspaceId, 'ads');
                if (!cancelled) setSaved(rows.filter((r) => r.payload?.variants?.length));
            } catch { /* non-fatal */ }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    const openSaved = (item) => {
        // A saved item always has a title, so the brief must never read "Unnamed
        // campaign" for one: fall back to it when the payload carries no name.
        const stored = item.payload.config ?? {};
        setConfig({ ...EMPTY_CONFIG, ...stored, name: stored.name || item.title || '' });
        setVariants((item.payload.variants ?? []).map((v, i) => ({ ...v, id: v.id ?? `${item.id}-${i}` })));
        setTargeting(item.payload.targeting ?? null);
        setGroundedIn(item.payload.groundedIn ?? []);
        setNotice(`Loaded "${item.title}".`);
    };

    const handleGenerate = async () => {
        setGenerating(true);
        setError('');
        setNotice('');
        const platform = config.platform || 'multi';
        const wantsLinkedIn = platform === 'linkedin' || platform === 'multi';
        const icp = personas.find((p) => p.id === config.icpId) ?? null;
        try {
            const [res, targetingRes] = await Promise.all([
                adGenerationService.generateAdVariants(workspaceId, {
                    platform,
                    objective: config.goal,
                    campaignType: config.type,
                    count: 5,
                    competitiveContext,
                    // E3 — when this generation came from a campaign step, the copy
                    // is grounded in that campaign and the goal above it.
                    campaignId: campaignCtx.campaignId,
                    stepId: campaignCtx.stepId,
                }),
                wantsLinkedIn
                    ? adGenerationService.generateLinkedInTargeting(workspaceId, { icp })
                    : Promise.resolve(null),
            ]);
            if (res.ok) {
                // Tag with stable ids for keys/copy state.
                setVariants(res.variants.map((v, i) => ({ ...v, id: `${Date.now()}-${i}` })));
                setGroundedIn(res.groundedIn ?? []);
            } else {
                setError(res.error || 'Ad generation failed.');
            }
            setTargeting(targetingRes && targetingRes.ok ? targetingRes.targeting : null);
        } catch (err) {
            setError(toUserMessage(err, 'Ad generation failed.'));
        } finally {
            setGenerating(false);
        }
    };

    const handleSaveCampaign = async () => {
        if (variants.length === 0) return;
        setSaving(true);
        setError('');
        try {
            const created = await contentService.createContentItem(workspaceId, 'ads', {
                title: config.name || 'Untitled campaign',
                status: 'completed',
                source: 'ad-generator',
                payload: { config, variants, targeting, groundedIn },
                campaignId: campaignCtx.campaignId,
                campaignStepId: campaignCtx.stepId,
            });
            setSaved((prev) => [created, ...prev]);
            if (campaignCtx.campaignId) {
                await campaignService.updateStep(workspaceId, campaignCtx.campaignId, campaignCtx.stepId, {
                    status: 'done',
                    contentItemId: created.id,
                });
            }
            setNotice(campaignCtx.campaignId ? 'Saved and linked to your campaign.' : 'Campaign saved.');
        } catch (err) {
            setError(toUserMessage(err, 'Could not save the campaign.'));
        } finally {
            setSaving(false);
        }
    };

    const handleCopyVariant = async (variant) => {
        const text = [
            variant.headline && `Headline: ${variant.headline}`,
            variant.primaryText && `Primary text: ${variant.primaryText}`,
            variant.description && `Description: ${variant.description}`,
            variant.cta && `CTA: ${variant.cta}`,
        ].filter(Boolean).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(variant.id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            setError('Copy failed: your browser blocked clipboard access.');
        }
    };

    const handleCopyTargeting = async () => {
        if (!targeting?.adjacentTitles?.length) return;
        try {
            await navigator.clipboard.writeText(targeting.adjacentTitles.map((t) => t.title).join(', '));
            setCopiedTargeting(true);
            setTimeout(() => setCopiedTargeting(false), 2000);
        } catch {
            setError('Copy failed: your browser blocked clipboard access.');
        }
    };

    if (loading) {
        return (
            <div className="ad-campaigns-module module-kepler">
                <EmptyState loading message="Loading…" />
            </div>
        );
    }

    if (!readiness.adsReady) {
        return (
            <div className="ad-campaigns-module module-kepler">
                {/* The nav calls this destination Ad Creative. Check
                    moduleRegistry.js before writing a module name here. */}
                <SetupRequired
                    title="Ad Creative"
                    summary="Campaign briefs are built from your brand context and a target ICP. Complete the prerequisites below to start configuring a campaign."
                    requirements={[
                        { label: 'Saved brand profile (overview, values, or tone)', done: readiness.hasBrandContext, prereq: 'brand' },
                        { label: 'At least one ICP in Brand Intelligence → Audience & ICP', done: readiness.hasIcps, prereq: 'icp' },
                    ]}
                    workspaceId={workspaceId}
                />
            </div>
        );
    }

    const selectedIcp = personas.find((p) => p.id === config.icpId) ?? null;

    return (
        <ModuleScreen
            className="ad-campaigns-module module-kepler"
            moduleKey="ad-campaigns"
            banner={
                <>
                    {campaignCtx.campaignId && (
                        <CampaignStepBanner
                            workspaceId={workspaceId}
                            campaignId={campaignCtx.campaignId}
                            stepId={campaignCtx.stepId}
                            brief={campaignCtx.brief}
                        />
                    )}
                    {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                    {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
                    {variants.length > 0 && <GroundedIn items={groundedIn} />}
                    <FeedbackInsight workspaceId={workspaceId} module="ads" refreshKey={feedbackVersion} />
                </>
            }
            status={
                <>
                    {variants.length > 0 && <span><strong>{variants.length}</strong> variants</span>}
                    {competitiveContext && (
                        <span className="text-mint">Grounded in your Meta Ad Library competitor read</span>
                    )}
                </>
            }
            actions={variants.length > 0 ? (
                <button type="button" className="btn btn-secondary" onClick={handleSaveCampaign} disabled={saving}>
                    {saving ? 'Saving…' : 'Save campaign'}
                </button>
            ) : null}
            /* v3 put this in the header of a near-empty panel a full scroll ABOVE
               the configuration form it submits. In the sticky screen bar it stays
               with the form no matter how far you scroll. */
            primary={
                <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
                    {generating ? 'Generating…' : 'Generate campaign assets'}
                </button>
            }
            railLabel="Research"
            rail={
                <ToolRail>
                    {saved.length > 0 && (
                        <ToolGroup label="Saved">
                            <ToolCard title="Saved campaigns" state={`${saved.length}`} tone="ok">
                                <div className="platform-pills">
                                    {saved.map((item) => (
                                        <button key={item.id} type="button" className="btn btn-ghost btn-sm platform-pill" onClick={() => openSaved(item)}>
                                            {item.title} ({item.payload.variants?.length ?? 0})
                                        </button>
                                    ))}
                                </div>
                            </ToolCard>
                        </ToolGroup>
                    )}
                    <ToolGroup label="Competitor intelligence">
                        <ToolCard title="Meta Ad Library" state={competitiveContext ? 'Grounded' : null} tone="ok">
                            <CompetitorAdsPanel workspaceId={workspaceId} onGroundingChange={setCompetitiveContext} chrome={false} />
                        </ToolCard>
                    </ToolGroup>
                </ToolRail>
            }
        >
            <div className="campaign-builder-layout">
                <Panel className="builder-config-pane">
                    <PanelHeader title="Campaign configuration" meta="Strategy, targets, and placement" />

                    <div className="config-section">
                        <label className="label-text">Campaign Name</label>
                        <input
                            className="intel-input"
                            type="text"
                            placeholder="Name this campaign"
                            value={config.name}
                            onChange={e => setConfig({ ...config, name: e.target.value })}
                        />
                    </div>

                    <div className="config-section">
                        <label className="label-text">Campaign Strategy</label>
                        <div className="type-selector-grid">
                            {CAMPAIGN_TYPES.map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    className={`type-option kepler-tile ${config.type === t.id ? 'kepler-nav-active active' : ''}`}
                                    onClick={() => setConfig({ ...config, type: t.id })}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="config-section">
                        <label className="label-text">Targets & Goals</label>
                        <div className="input-field">
                            <label className="label-text">Target ICP</label>
                            <select
                                className="intel-input"
                                value={config.icpId}
                                onChange={e => setConfig({ ...config, icpId: e.target.value })}
                            >
                                <option value="">Select a saved ICP…</option>
                                {personas.map(p => (
                                    <option key={p.id} value={p.id}>{p.role}</option>
                                ))}
                            </select>
                        </div>
                        <div className="input-field">
                            <label className="label-text">Campaign Goal</label>
                            <input
                                className="intel-input"
                                type="text"
                                placeholder="Define the goal for this campaign"
                                value={config.goal}
                                onChange={e => setConfig({ ...config, goal: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="config-section">
                        <label className="label-text">Placement</label>
                        <div className="platform-pills">
                            {PLATFORMS.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    className={`btn btn-secondary platform-pill ${config.platform === p.id ? 'active' : ''}`}
                                    onClick={() => setConfig({ ...config, platform: p.id })}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="config-section">
                        <label className="label-text">Budget Tier</label>
                        <div className="budget-slider-labels">
                            <span className={`label-text budget-label ${config.budget === 'low' ? 'active' : ''}`} onClick={() => setConfig({ ...config, budget: 'low' })}>Essential</span>
                            <span className={`label-text budget-label ${config.budget === 'mid' ? 'active' : ''}`} onClick={() => setConfig({ ...config, budget: 'mid' })}>Growth</span>
                            <span className={`label-text budget-label ${config.budget === 'high' ? 'active' : ''}`} onClick={() => setConfig({ ...config, budget: 'high' })}>Scale</span>
                        </div>
                        <input
                            type="range"
                            min="1" max="3" step="1"
                            className="premium-range"
                            value={config.budget === 'low' ? 1 : config.budget === 'high' ? 3 : 2}
                            onChange={e => {
                                const val = parseInt(e.target.value);
                                setConfig({ ...config, budget: val === 1 ? 'low' : val === 2 ? 'mid' : 'high' });
                            }}
                        />
                    </div>
                </Panel>

                <Panel className="builder-preview-pane">
                    <PanelHeader title="Campaign preview" meta="Drafting mode" />

                    <section className="structure-preview">
                        <label className="label-text">Brief Summary</label>
                        <div className="structure-tree">
                            <div className="tree-node campaign kepler-tile">
                                <span className="node-label">
                                    Campaign: {config.name || 'Unnamed campaign'}
                                </span>
                            </div>
                            <div className="brief-summary-meta">
                                <span className="label-text">Target ICP: {selectedIcp ? selectedIcp.role : 'Not selected'}</span>
                                <span className="label-text">Goal: {config.goal || 'Not set'}</span>
                                <span className="label-text">Strategy: {CAMPAIGN_TYPES.find(t => t.id === config.type)?.label || 'Not selected'}</span>
                            </div>
                        </div>
                    </section>

                    <section className="variants-preview">
                        <label className="label-text">Ad Variants</label>
                        <div className="variants-grid">
                            {variants.length === 0 && (
                                <EmptyState
                                    loading={generating}
                                    message={generating ? 'Generating ad variants…' : 'No generated assets yet. Use “Generate campaign assets” above.'}
                                />
                            )}
                            {variants.map(variant => {
                                const charLine = Object.entries(variant.fieldStatus ?? {})
                                    .map(([f, s]) => `${fieldLabel(f)} ${s.chars}/${s.limit}${s.withinLimit ? '' : ' ⚠'}`)
                                    .join(' · ');
                                return (
                                    <ContentCard
                                        key={variant.id}
                                        variant="kepler"
                                        type={variant.angle}
                                        status={variant.overLimit ? 'Over limit' : ''}
                                        title={variant.headline || 'Untitled variant'}
                                        actions={[
                                            { label: copiedId === variant.id ? 'Copied!' : 'Copy', onClick: () => handleCopyVariant(variant) },
                                        ]}
                                    >
                                        <div className="ad-copy-area">
                                            {variant.primaryText && <p>{variant.primaryText}</p>}
                                            {variant.description && <p className="label-text">{variant.description}</p>}
                                            {variant.cta && <div className="ad-cta-preview">{variant.cta}</div>}
                                            {variant.rationale && <p className="label-text">{variant.rationale}</p>}
                                            {charLine && <p className="label-text">{charLine}</p>}
                                            <RatingControl
                                                key={variant.id}
                                                label="Rate"
                                                onSubmit={async (rating, improvement) => { await feedbackService.saveFeedback(workspaceId, { module: 'ads', label: variant.angle || config.platform, rating, improvement }); setFeedbackVersion((v) => v + 1); }}
                                            />
                                        </div>
                                    </ContentCard>
                                );
                            })}
                        </div>
                    </section>

                    {targeting && (
                        <section className="targeting-preview">
                            <div className="targeting-head">
                                <label className="label-text">LinkedIn adjacent targeting</label>
                                <button type="button" className="btn btn-secondary" onClick={handleCopyTargeting}>
                                    {copiedTargeting ? 'Copied!' : 'Copy titles'}
                                </button>
                            </div>
                            <p className="label-text targeting-sub">
                                Adjacent roles that influence or fund this purchase. Stack these in Campaign
                                Manager alongside your primary ICP.
                            </p>
                            <ul className="targeting-titles">
                                {targeting.adjacentTitles.map((t, i) => (
                                    <li key={i} className="targeting-title kepler-tile">
                                        <span className="targeting-title-main">
                                            <span className="targeting-title-name">{t.title}</span>
                                            {t.seniority && <span className="targeting-seniority">{t.seniority}</span>}
                                        </span>
                                        {t.why && <span className="targeting-why label-text">{t.why}</span>}
                                    </li>
                                ))}
                            </ul>
                            {targeting.jobFunctions.length > 0 && (
                                <div className="targeting-row">
                                    <span className="label-text">Job functions to layer:</span>
                                    <div className="chip-container">
                                        {targeting.jobFunctions.map((f, i) => (
                                            <span key={i} className="intel-chip">{f}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {targeting.exclusions.length > 0 && (
                                <div className="targeting-row">
                                    <span className="label-text">Exclude:</span>
                                    <div className="chip-container">
                                        {targeting.exclusions.map((e, i) => (
                                            <span key={i} className="intel-chip targeting-exclude">{e}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {targeting.recommendedCombination && (
                                <p className="label-text targeting-combo">
                                    Recommended combination: {targeting.recommendedCombination}
                                </p>
                            )}
                        </section>
                    )}
                </Panel>
            </div>
        </ModuleScreen>
    );
};

export default AdCampaigns;
