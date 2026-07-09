import { useEffect, useState } from 'react';
import ContentCard from '../../components/ui/ContentCard';
import AnalyticsStrip from '../../components/ui/AnalyticsStrip';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import SetupRequired from '../../components/workspace/SetupRequired';
import CampaignStepBanner from '../../components/campaigns/CampaignStepBanner';
import { useWorkspaceConfig } from '../../hooks/useWorkspaceConfig';
import { contentService } from '../../services/contentService';
import { campaignService } from '../../services/campaignService';
import { integrationService } from '../../services/integrationService';
import { keywordResearchService } from '../../services/keywordResearchService';
import { blogPipelineService } from '../../services/blogPipelineService';
import { feedbackService } from '../../services/feedbackService';
import RatingControl from '../../components/ui/RatingControl';
import FeedbackInsight from '../../components/ui/FeedbackInsight';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { workspacePath } from '../../constants/routes';
import { slugify, normalizeBaseUrl, buildSitemap, buildRobots } from '../../lib/technicalSeo';
import { toUserMessage } from '../../lib/errors';
import '../../styles/module-kepler.css';
import './SeoAeo.css';

const COLUMN_STATUSES = [
    { key: 'queue', title: 'Queue' },
    { key: 'generating', title: 'Generating' },
    { key: 'completed', title: 'Completed' },
];

// Turn keyword research output into queue-ready content ideas. Each keyword
// becomes a content idea; the full keyword object is preserved in payload so the
// blog pipeline can use intent/tier/GEO/cluster downstream.
const keywordsToQueueItems = (result, gscByQuery = {}) =>
    (result?.keywords ?? []).map((kw) => {
        // Merge real Search Console metrics when the site already ranks for this term.
        const gsc = gscByQuery[String(kw.term ?? '').toLowerCase().trim()];
        return {
            status: 'queue',
            title: kw.term,
            targetKeyword: kw.term,
            intent: kw.intent,
            source: gsc ? 'keyword-research+gsc' : 'keyword-research',
            payload: {
                tier: kw.tier,
                geo: kw.geo,
                rationale: kw.rationale,
                opportunityScore: kw.opportunityScore,
                metricStatus: gsc ? 'measured' : kw.metricStatus,
                ...(gsc ? { gscMetrics: gsc } : {}),
            },
        };
    });

const downloadText = (filename, text, type = 'text/plain') => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

const SeoAeo = ({ workspaceId }) => {
    const { loading: configLoading, readiness, brand } = useWorkspaceConfig(workspaceId);
    const navigate = useNavigate();

    const [searchParams] = useSearchParams();
    const [campaignCtx] = useState(() => ({
        campaignId: searchParams.get('campaign') || null,
        stepId: searchParams.get('step') || '',
        brief: searchParams.get('brief') || '',
        topic: searchParams.get('topic') || '',
    }));

    const [items, setItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [generatingId, setGeneratingId] = useState(null);
    const [viewItem, setViewItem] = useState(null);
    const [copied, setCopied] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [feedbackVersion, setFeedbackVersion] = useState(0);

    // Google Search Console connection + pulled query rows.
    const [gscStatus, setGscStatus] = useState(null);
    const [gscRows, setGscRows] = useState([]);
    const [gscBusy, setGscBusy] = useState(false);
    const gscConfigured = Boolean(import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID);

    // Load the pipeline on mount. State is set only after the await (in a
    // microtask), never synchronously in the effect body.
    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const data = await contentService.getContentItems(workspaceId, 'seo');
                let list = data;
                // Arriving from a campaign step: seed one queue idea from the brief so
                // there's an immediate, generation-ready starting point (once per step).
                if (campaignCtx.campaignId && campaignCtx.stepId
                    && !data.some((i) => i.campaignStepId === campaignCtx.stepId)) {
                    try {
                        const seed = await contentService.createContentItem(workspaceId, 'seo', {
                            title: (campaignCtx.topic || campaignCtx.brief || 'Campaign content').slice(0, 80),
                            targetKeyword: campaignCtx.topic || '',
                            intent: campaignCtx.brief || '',
                            source: 'campaign-step',
                            campaignId: campaignCtx.campaignId,
                            campaignStepId: campaignCtx.stepId,
                        });
                        list = [seed, ...data];
                    } catch { /* non-fatal */ }
                }
                if (!cancelled) setItems(list);
            } catch (err) {
                if (!cancelled) setError(toUserMessage(err, 'Could not load the content pipeline.'));
            } finally {
                if (!cancelled) setLoadingItems(false);
            }
        })();
        return () => { cancelled = true; };
        // campaignCtx is set once from URL params (stable); safe in deps.
    }, [workspaceId, campaignCtx]);

    // Load the Search Console connection status on mount (cheap; drives the panel).
    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const s = await integrationService.getStatus(workspaceId, 'gsc');
                if (!cancelled) setGscStatus(s);
            } catch { /* non-fatal */ }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    const connectGsc = () => {
        try {
            window.location.href = integrationService.buildAuthUrl(workspaceId);
        } catch (e) {
            setError(e.message);
        }
    };

    const pullGsc = async () => {
        setGscBusy(true);
        setError('');
        setNotice('');
        try {
            const res = await integrationService.query(workspaceId);
            setGscRows(res.rows ?? []);
            const s = await integrationService.getStatus(workspaceId, 'gsc');
            setGscStatus(s);
            setNotice(`Pulled ${res.rows?.length ?? 0} queries from Search Console.`);
        } catch (e) {
            setError(e.message || 'Could not pull Search Console data.');
        } finally {
            setGscBusy(false);
        }
    };

    const addGscToPipeline = async (row) => {
        try {
            const created = await contentService.createContentItem(workspaceId, 'seo', {
                status: 'queue',
                title: row.query,
                targetKeyword: row.query,
                source: 'search-console',
                payload: {
                    metricStatus: 'measured',
                    gscMetrics: { impressions: row.impressions, clicks: row.clicks, ctr: row.ctr, position: row.position },
                    rationale: `Real Search Console data · ${Math.round(row.impressions)} impressions · ${Math.round(row.clicks)} clicks · avg position ${row.position.toFixed(1)}.`,
                },
            });
            setItems((prev) => [created, ...prev]);
            setGscRows((prev) => prev.filter((r) => r.query !== row.query));
        } catch (e) {
            setError(toUserMessage(e, 'Could not add to pipeline.'));
        }
    };

    const disconnectGsc = async () => {
        try {
            await integrationService.disconnect(workspaceId);
            setGscStatus(null);
            setGscRows([]);
        } catch (e) {
            setError(e.message || 'Could not disconnect.');
        }
    };

    const handleGeneratePackage = async () => {
        setGenerating(true);
        setError('');
        setNotice('');
        try {
            const res = await keywordResearchService.generate(workspaceId, { count: 20 });
            if (!res.ok) {
                setError(res.error || 'Keyword research failed.');
                return;
            }
            // Merge real Search Console metrics into AI keywords the site already ranks for.
            const gscByQuery = {};
            for (const r of gscRows) {
                gscByQuery[String(r.query).toLowerCase().trim()] = {
                    impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position,
                };
            }
            const queueItems = keywordsToQueueItems(res.result, gscByQuery);
            if (queueItems.length === 0) {
                setNotice('No keywords were generated. Try enriching the brand profile.');
                return;
            }
            const created = await contentService.createContentItems(workspaceId, 'seo', queueItems);
            setItems((prev) => [...created, ...prev]);
            setNotice(`Added ${created.length} keyword-driven content ideas to the queue.`);
        } catch (err) {
            setError(toUserMessage(err, 'Keyword research failed.'));
        } finally {
            setGenerating(false);
        }
    };

    const handleAddIdea = async () => {
        try {
            const created = await contentService.createContentItem(workspaceId, 'seo', {
                title: 'New content idea',
                source: 'manual',
            });
            setItems((prev) => [created, ...prev]);
        } catch (err) {
            setError(toUserMessage(err, 'Could not add a content idea.'));
        }
    };

    const handleDeleteItem = async (id) => {
        try {
            await contentService.deleteContentItem(workspaceId, id);
            setItems((prev) => prev.filter((i) => i.id !== id));
        } catch (err) {
            setError(toUserMessage(err, 'Could not remove the item.'));
        }
    };

    const setItemStatus = (id, patch) =>
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

    const handleCopy = async (text, label) => {
        try {
            await navigator.clipboard.writeText(text ?? '');
            setCopied(label);
            setTimeout(() => setCopied(''), 2000);
        } catch {
            setError('Copy failed - your browser blocked clipboard access.');
        }
    };

    const handleGenerateBlog = async (item) => {
        setGeneratingId(item.id);
        setError('');
        setNotice('');
        try {
            await contentService.updateContentItem(workspaceId, item.id, { status: 'generating' });
            setItemStatus(item.id, { status: 'generating' });

            const res = await blogPipelineService.generateBlog(workspaceId, { contentItem: item });
            if (res.ok) {
                const payload = { ...item.payload, blog: res.result };
                const updated = await contentService.updateContentItem(workspaceId, item.id, {
                    status: 'completed',
                    title: res.result.title || item.title,
                    payload,
                });
                setItemStatus(item.id, updated ?? { status: 'completed', title: res.result.title || item.title, payload });
                // Completing the campaign-step's blog marks that step done.
                if (campaignCtx.campaignId && item.campaignStepId === campaignCtx.stepId) {
                    await campaignService.updateStep(workspaceId, campaignCtx.campaignId, campaignCtx.stepId, {
                        status: 'done',
                        contentItemId: item.id,
                    });
                }
            } else {
                // Revert to the queue so the idea isn't lost; surface why.
                await contentService.updateContentItem(workspaceId, item.id, { status: 'queue' });
                setItemStatus(item.id, { status: 'queue' });
                setError(res.error || 'Blog generation failed.');
            }
        } catch (err) {
            await contentService.updateContentItem(workspaceId, item.id, { status: 'queue' }).catch(() => {});
            setItemStatus(item.id, { status: 'queue' });
            setError(toUserMessage(err, 'Blog generation failed.'));
        } finally {
            setGeneratingId(null);
        }
    };

    const renderColumn = ({ key, title }) => {
        const columnItems = items.filter((item) => item.status === key);
        return (
            <div key={key} className="pipeline-column kepler-tile">
                <div className="column-header">
                    <div className="header-title"><h3>{title}</h3></div>
                    <span className="brand-intel-module__source-label">{columnItems.length}</span>
                </div>
                <div className="column-cards">
                    {columnItems.length === 0 && (
                        <p className="module-empty-state">No items in this stage yet.</p>
                    )}
                    {columnItems.map((item) => {
                        const isGenerating = generatingId === item.id;
                        const actions = [];
                        if (key === 'queue') {
                            actions.push({ label: 'Generate draft', onClick: () => handleGenerateBlog(item) });
                        }
                        if (key === 'completed') {
                            actions.push({ label: 'View', onClick: () => setViewItem(item) });
                        }
                        if (key !== 'generating') {
                            actions.push({ label: 'Remove', onClick: () => handleDeleteItem(item.id), variant: 'icon-only' });
                        }
                        return (
                            <ContentCard
                                key={item.id}
                                variant="kepler"
                                title={item.title || item.targetKeyword || 'Untitled'}
                                type={item.intent ? `${item.intent} · ${item.payload?.tier ?? ''}`.trim() : 'Content idea'}
                                status={isGenerating ? 'Generating…' : (item.payload?.geo?.isCandidate ? 'GEO' : '')}
                                actions={actions}
                            >
                                <div className="card-meta">
                                    {item.targetKeyword && (
                                        <span className="label-text">Keyword: {item.targetKeyword}</span>
                                    )}
                                    {key === 'completed' && item.payload?.blog?.review?.overall != null && (
                                        <span className="label-text">Score: {item.payload.blog.review.overall}/100 · {item.payload.blog.metrics?.wordCount ?? 0} words</span>
                                    )}
                                    {key !== 'completed' && item.payload?.rationale && (
                                        <span className="label-text">{item.payload.rationale}</span>
                                    )}
                                    {item.payload?.gscMetrics && (
                                        <span className="label-text">
                                            {Math.round(item.payload.gscMetrics.impressions)} impressions · {Math.round(item.payload.gscMetrics.clicks)} clicks · pos {Number(item.payload.gscMetrics.position).toFixed(1)}
                                        </span>
                                    )}
                                    <span className="label-text">Source: {item.source}</span>
                                </div>
                            </ContentCard>
                        );
                    })}
                    {key === 'queue' && (
                        <button type="button" className="add-card-btn module-add-zone" onClick={handleAddIdea}>
                            Add Content Idea
                        </button>
                    )}
                </div>
            </div>
        );
    };

    if (configLoading) {
        return (
            <div className="seo-aeo-module module-kepler">
                <EmptyState loading message="Loading…" />
            </div>
        );
    }

    if (!readiness.seoReady) {
        return (
            <div className="seo-aeo-module module-kepler">
                <SetupRequired
                    title="SEO & AEO"
                    summary="This pipeline builds search and answer-engine content from your brand context and audience. Complete the prerequisites below to begin."
                    requirements={[
                        { label: 'Saved brand profile (overview, values, or tone)', done: readiness.hasBrandContext, prereq: 'brand' },
                        { label: 'At least one ICP in Brand Intelligence → Audience & ICP', done: readiness.hasIcps, prereq: 'icp' },
                    ]}
                    workspaceId={workspaceId}
                />
            </div>
        );
    }

    const stats = COLUMN_STATUSES.map(({ key, title }) => ({
        label: title,
        value: String(items.filter((i) => i.status === key).length),
    }));

    // Technical SEO: derive sitemap + robots from completed blogs anchored to the workspace URL.
    const baseUrl = normalizeBaseUrl(brand?.url);
    const completedBlogs = items.filter((i) => i.status === 'completed' && i.payload?.blog);
    const blogUrlEntries = completedBlogs.map((i) => ({
        loc: `${baseUrl}/blog/${slugify(i.payload.blog.title || i.title)}`,
        lastmod: (i.updatedAt || i.createdAt || '').slice(0, 10) || undefined,
    }));
    const sitemapXml = buildSitemap(baseUrl ? [{ loc: baseUrl }, ...blogUrlEntries] : blogUrlEntries);
    const robotsTxt = buildRobots(baseUrl ? `${baseUrl}/sitemap.xml` : '');

    return (
        <div className="seo-aeo-module module-kepler">
            {campaignCtx.campaignId && (
                <CampaignStepBanner
                    workspaceId={workspaceId}
                    campaignId={campaignCtx.campaignId}
                    stepId={campaignCtx.stepId}
                    brief={campaignCtx.brief}
                />
            )}
            <FeedbackInsight workspaceId={workspaceId} module="blog" refreshKey={feedbackVersion} />
            <Panel>
                <PanelHeader
                    title="SEO & AEO Pipeline"
                    meta="Keyword research → content ideas → drafts, grounded in your brand and audience."
                    action={
                        <div className="module-toolbar module-toolbar--inline">
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleGeneratePackage}
                                disabled={generating}
                            >
                                {generating ? 'Researching keywords…' : 'Generate keyword ideas'}
                            </button>
                        </div>
                    }
                />
                <AnalyticsStrip
                    stats={stats}
                    variant="kepler"
                    className="analytics-strip-kepler--cols-3"
                />
            </Panel>

            {(gscConfigured || gscStatus) && (
                <Panel className="module-panel">
                    <PanelHeader
                        title="Search Console"
                        meta="Real search performance - grounds keywords in what people actually search for."
                        action={
                            gscStatus ? (
                                <div className="module-toolbar module-toolbar--inline">
                                    <button type="button" className="btn btn-secondary" onClick={pullGsc} disabled={gscBusy}>
                                        {gscBusy ? 'Pulling…' : 'Pull latest'}
                                    </button>
                                    <button type="button" className="btn btn-ghost" onClick={disconnectGsc}>Disconnect</button>
                                </div>
                            ) : (
                                <button type="button" className="btn btn-primary" onClick={connectGsc}>
                                    Connect Search Console
                                </button>
                            )
                        }
                    />
                    {gscStatus ? (
                        <>
                            <p className="brand-intel-module__source-label">
                                {gscStatus.status === 'connected' ? 'Connected' : gscStatus.status}
                                {' · '}{gscStatus.propertyUrl || 'no property selected'}
                                {gscStatus.lastSyncAt ? ` · synced ${new Date(gscStatus.lastSyncAt).toLocaleDateString()}` : ''}
                            </p>
                            {gscRows.length > 0 && (
                                <ul className="gsc-rows">
                                    {gscRows.slice(0, 25).map((r) => (
                                        <li key={r.query} className="gsc-row">
                                            <span className="gsc-row__q">{r.query}</span>
                                            <span className="gsc-row__m">
                                                {Math.round(r.impressions)} impr · {Math.round(r.clicks)} clicks · pos {Number(r.position).toFixed(1)}
                                            </span>
                                            <button type="button" className="btn btn-secondary gsc-row__add" onClick={() => addGscToPipeline(r)}>
                                                Add to pipeline
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    ) : (
                        <p className="brand-intel-module__source-label">
                            Connect Google Search Console to pull real queries, impressions, clicks, and positions into your pipeline.
                        </p>
                    )}
                </Panel>
            )}

            {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
            {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}

            <Panel className="module-panel">
                <PanelHeader title="Pipeline board" meta="Queue, generate, and complete content packages" />
                {loadingItems ? (
                    <EmptyState loading message="Loading pipeline…" />
                ) : (
                    <div className="pipeline-container">
                        {COLUMN_STATUSES.map(renderColumn)}
                    </div>
                )}
            </Panel>

            <Panel className="module-panel">
                <PanelHeader
                    title="Technical SEO"
                    meta={baseUrl
                        ? `${blogUrlEntries.length} blog URL${blogUrlEntries.length === 1 ? '' : 's'} · ${baseUrl}`
                        : 'Add a website URL in Brand Intelligence to anchor sitemap URLs'}
                />
                <div className="intel-action-row">
                    <button type="button" className="btn btn-secondary" disabled={!baseUrl} onClick={() => handleCopy(sitemapXml, 'sitemap')}>
                        {copied === 'sitemap' ? 'Copied!' : 'Copy sitemap.xml'}
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={!baseUrl} onClick={() => downloadText('sitemap.xml', sitemapXml, 'application/xml')}>
                        Download sitemap.xml
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={!baseUrl} onClick={() => handleCopy(robotsTxt, 'robots')}>
                        {copied === 'robots' ? 'Copied!' : 'Copy robots.txt'}
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={!baseUrl} onClick={() => downloadText('robots.txt', robotsTxt)}>
                        Download robots.txt
                    </button>
                </div>
                <p className="brand-intel-module__source-label">
                    Per-post JSON-LD schema (BlogPosting + FAQPage) is available via “Copy schema” in each completed blog’s view.
                </p>
            </Panel>

            <Modal
                isOpen={!!viewItem}
                onClose={() => { setViewItem(null); setCopied(''); }}
                title={viewItem?.payload?.blog?.title || viewItem?.title || 'Draft'}
                footer={viewItem?.payload?.blog ? (
                    <div className="intel-action-row">
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleCopy(viewItem.payload.blog.markdown, 'markdown')}
                        >
                            {copied === 'markdown' ? 'Copied!' : 'Copy markdown'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleCopy(JSON.stringify(viewItem.payload.blog.schema ?? {}, null, 2), 'schema')}
                        >
                            {copied === 'schema' ? 'Copied!' : 'Copy schema'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => navigate(`${workspacePath(workspaceId, 'social-media')}?topic=${encodeURIComponent(viewItem.payload.blog.title || viewItem.title || viewItem.targetKeyword || '')}`)}
                        >
                            Create social posts
                        </button>
                    </div>
                ) : null}
            >
                {viewItem?.payload?.blog ? (
                    <div className="form-stack">
                        <p className="brand-intel-module__source-label">
                            {viewItem.payload.blog.review?.overall != null && (
                                <>Quality {viewItem.payload.blog.review.overall}/100 · </>
                            )}
                            {viewItem.payload.blog.aeo?.overall != null && (
                                <>AEO {viewItem.payload.blog.aeo.overall}/100 ({viewItem.payload.blog.aeo.grade}) · </>
                            )}
                            burstiness {viewItem.payload.blog.metrics?.burstiness ?? '-'} ·
                            {' '}{viewItem.payload.blog.metrics?.wordCount ?? 0} words
                        </p>
                        {viewItem.payload.blog.aeo?.recommendations?.length > 0 && (
                            <div className="data-section">
                                <label className="data-label">AEO recommendations</label>
                                <ul className="icp-list">
                                    {viewItem.payload.blog.aeo.recommendations.slice(0, 5).map((r, i) => (
                                        <li key={i}>{r}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {viewItem.payload.blog.metaDescription && (
                            <p className="icp-pain-text">{viewItem.payload.blog.metaDescription}</p>
                        )}
                        <pre className="blog-draft-preview" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                            {viewItem.payload.blog.markdown}
                        </pre>
                        <RatingControl
                            key={viewItem.id}
                            label="Rate this blog"
                            onSubmit={async (rating, improvement) => { await feedbackService.saveFeedback(workspaceId, { module: 'blog', label: viewItem.targetKeyword || '', rating, improvement }); setFeedbackVersion((v) => v + 1); }}
                        />
                    </div>
                ) : (
                    <p className="module-empty-state">No draft available.</p>
                )}
            </Modal>
        </div>
    );
};

export default SeoAeo;
