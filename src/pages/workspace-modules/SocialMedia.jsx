import { useEffect, useMemo, useState } from 'react';
import Tabs from '../../components/ui/Tabs';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import ModuleScreen from '../../components/layout/ModuleScreen';
import EmptyState from '../../components/ui/EmptyState';
import SetupRequired from '../../components/workspace/SetupRequired';
import CampaignStepBanner from '../../components/campaigns/CampaignStepBanner';
import CarouselPreview from '../../components/social/CarouselPreview';
import RatingControl from '../../components/ui/RatingControl';
import FeedbackInsight from '../../components/ui/FeedbackInsight';
import { useSearchParams } from 'react-router-dom';
import { useWorkspaceConfig } from '../../hooks/useWorkspaceConfig';
import { socialService } from '../../services/socialService';
import { contentService } from '../../services/contentService';
import { campaignService } from '../../services/campaignService';
import { feedbackService } from '../../services/feedbackService';
import { integrationService } from '../../services/integrationService';
import { channelHistoryService } from '../../services/channelHistoryService';
import { eventService } from '../../services/eventService';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { SOCIAL_PLATFORM_SPECS } from '../../lib/socialSpecs';
import { WEEKDAY_LABELS, todayIso, monthCells, toIso } from '../../lib/calendarGrid';
import { toUserMessage } from '../../lib/errors';
import '../../styles/module-kepler.css';
import './SocialMedia.css';

const PLATFORM_OPTS = Object.entries(SOCIAL_PLATFORM_SPECS).map(([id, s]) => ({ id, label: s.label }));
const WEEK_OPTS = [{ v: 2, l: '2 weeks' }, { v: 4, l: '1 month' }, { v: 6, l: '6 weeks' }];

const SocialMedia = ({ workspaceId }) => {
    const { loading, brand, readiness } = useWorkspaceConfig(workspaceId);
    const [searchParams] = useSearchParams();
    const [view, setView] = useState('planner');
    const [viewMode, setViewMode] = useState('calendar');
    const [items, setItems] = useState([]);          // content_items (type social) with payload.date
    const [selected, setSelected] = useState(null);  // the item open in the generator
    const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

    const [campaignCtx] = useState(() => ({
        campaignId: searchParams.get('campaign') || null,
        stepId: searchParams.get('step') || '',
        brief: searchParams.get('brief') || '',
    }));
    const [cfg, setCfg] = useState({ startDate: todayIso(), weeks: 4, postsPerWeek: 3, platforms: ['linkedin'], topic: searchParams.get('topic') || searchParams.get('brief') || '', voice: 'company' });
    const [generating, setGenerating] = useState(false);
    const [savingId, setSavingId] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [editBody, setEditBody] = useState('');
    const [carousel, setCarousel] = useState(null);
    const [busyCarousel, setBusyCarousel] = useState(false);
    const [copied, setCopied] = useState(false);
    const [feedbackVersion, setFeedbackVersion] = useState(0);
    const [linkedin, setLinkedin] = useState({ configured: false, connected: false });
    const [metaPages, setMetaPages] = useState({ configured: false, connected: false, pageSelected: false });
    const [publishing, setPublishing] = useState(false);
    const [published, setPublished] = useState(null); // { url } after a successful publish
    const [history, setHistory] = useState([]);
    const [historyPulling, setHistoryPulling] = useState(false);
    const [pagePick, setPagePick] = useState({ options: [], value: '', busy: false });

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const rows = await contentService.getContentItems(workspaceId, 'social');
                if (!cancelled) setItems(rows.filter((r) => r.payload?.date && r.payload?.post));
            } catch (err) {
                if (!cancelled) setError(toUserMessage(err, 'Could not load the calendar.'));
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    // Publisher availability (LinkedIn, Meta Pages): configured client env + connected.
    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            if (integrationService.isOAuthConfigured('linkedin')) {
                try {
                    const st = await integrationService.getStatus(workspaceId, 'linkedin');
                    if (!cancelled) setLinkedin({ configured: true, connected: st?.status === 'connected' });
                } catch { if (!cancelled) setLinkedin({ configured: true, connected: false }); }
            }
            if (integrationService.isOAuthConfigured('meta-pages')) {
                try {
                    const st = await integrationService.getStatus(workspaceId, 'meta-pages');
                    if (!cancelled) {
                        setMetaPages({
                            configured: true,
                            connected: st?.status === 'connected',
                            pageSelected: Boolean(st?.propertyUrl),
                        });
                    }
                } catch { if (!cancelled) setMetaPages({ configured: true, connected: false, pageSelected: false }); }
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    // Load stored account history when the tab opens.
    useEffect(() => {
        if (!workspaceId || view !== 'history') return undefined;
        let cancelled = false;
        channelHistoryService.list(workspaceId)
            .then((rows) => { if (!cancelled) setHistory(rows); })
            .catch(() => { /* surfaced on pull instead */ });
        return () => { cancelled = true; };
    }, [workspaceId, view]);

    const postsByDate = useMemo(() => {
        const map = {};
        for (const it of items) (map[it.payload.date] ??= []).push(it);
        return map;
    }, [items]);

    const reset = () => { setError(''); setNotice(''); };

    const togglePlatform = (id) =>
        setCfg((c) => ({ ...c, platforms: c.platforms.includes(id) ? c.platforms.filter((x) => x !== id) : [...c.platforms, id] }));

    const handleRunCalendar = async () => {
        if (cfg.platforms.length === 0) { setError('Select at least one platform.'); return; }
        setGenerating(true); reset();
        try {
            const res = await socialService.generateContentCalendar(workspaceId, cfg);
            if (!res.ok) { setError(res.error || 'Calendar generation failed.'); return; }
            const rows = res.posts.map((p) => ({
                title: (p.hook || `${p.platform} post`).slice(0, 80),
                status: 'completed',
                source: 'social-calendar',
                payload: { date: p.date, platform: p.platform, kind: 'post', post: p },
                campaignId: campaignCtx.campaignId,
                campaignStepId: campaignCtx.stepId,
            }));
            const created = await contentService.createContentItems(workspaceId, 'social', rows);
            setItems((prev) => [...created, ...prev]);
            setViewMonth(new Date(`${cfg.startDate}T00:00:00`));
            if (campaignCtx.campaignId && created.length) {
                await campaignService.updateStep(workspaceId, campaignCtx.campaignId, campaignCtx.stepId, {
                    status: 'done',
                    contentItemId: created[0].id,
                });
            }
            setNotice(`Generated ${created.length} posts across your calendar.${res.partial ? ' Some slots were skipped - re-run to fill them.' : ''}${campaignCtx.campaignId ? ' Linked to your campaign.' : ''}`);
        } catch (err) {
            setError(toUserMessage(err, 'Calendar generation failed.'));
        } finally {
            setGenerating(false);
        }
    };

    const openPost = (item) => {
        setSelected(item);
        setEditBody(item.payload.post.body || '');
        setCarousel(item.payload.carousel || null);
        setCopied(false);
        setPublished(null);
        setView('generator');
    };

    const handleSavePost = async () => {
        if (!selected) return;
        setSavingId(selected.id); reset();
        try {
            const platform = selected.payload.platform;
            const limit = SOCIAL_PLATFORM_SPECS[platform]?.charLimit ?? null;
            const post = { ...selected.payload.post, body: editBody, validation: { charCount: editBody.length, limit, overLimit: limit ? editBody.length > limit : false } };
            const payload = { ...selected.payload, post, ...(carousel ? { carousel } : {}) };
            const updated = await contentService.updateContentItem(workspaceId, selected.id, { payload, title: (post.hook || editBody).slice(0, 80) });
            const next = updated ?? { ...selected, payload };
            setSelected(next);
            setItems((prev) => prev.map((i) => (i.id === selected.id ? next : i)));
            setNotice('Saved.');
        } catch (err) {
            setError(toUserMessage(err, 'Could not save.'));
        } finally {
            setSavingId(null);
        }
    };

    const handleDeletePost = async (item) => {
        try {
            await contentService.deleteContentItem(workspaceId, item.id);
            setItems((prev) => prev.filter((i) => i.id !== item.id));
            if (selected?.id === item.id) { setSelected(null); setView('planner'); }
        } catch (err) {
            setError(toUserMessage(err, 'Could not remove the post.'));
        }
    };

    const handleGenerateCarousel = async () => {
        if (!selected) return;
        setBusyCarousel(true); reset();
        try {
            const res = await socialService.generateCarousel(workspaceId, { topic: selected.payload.post.hook || selected.title });
            if (res.ok) setCarousel(res.carousel);
            else setError(res.error || 'Carousel generation failed.');
        } catch (err) {
            setError(toUserMessage(err, 'Carousel generation failed.'));
        } finally {
            setBusyCarousel(false);
        }
    };

    // The post as it would be published/copied: edited body + hashtags.
    const postText = () => {
        const p = selected?.payload?.post;
        if (!p) return '';
        return `${editBody}${p.hashtags?.length ? `\n\n${p.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}` : ''}`;
    };

    const copyPost = () => {
        const text = postText();
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => setError('Copy blocked by browser.'));
    };

    const connectPublisher = (provider) => {
        try { window.location.href = integrationService.buildAuthUrl(workspaceId, provider); }
        catch (err) { setError(toUserMessage(err, 'Could not start the connect flow.')); }
    };

    // Publish the open post to its platform's connected account.
    const publishPost = async (provider, payload, label) => {
        const text = postText();
        if (!text.trim()) { setError('Nothing to publish - the post is empty.'); return; }
        setPublishing(true); reset(); setPublished(null);
        try {
            const res = await integrationService.publish(workspaceId, provider, { ...payload, text });
            setPublished({ url: res?.postUrl || '' });
            setNotice(`Published to ${label}.`);
            eventService.log(workspaceId, 'social.published', { title: `Published to ${label}`, entityType: 'social', meta: { provider, postUrl: res?.postUrl || '' } }).catch(() => {});
        } catch (err) {
            setError(toUserMessage(err, `Could not publish to ${label}.`));
        } finally {
            setPublishing(false);
        }
    };

    const pullHistory = async () => {
        setHistoryPulling(true); reset();
        try {
            const r = await channelHistoryService.pull(workspaceId, 'meta-pages');
            setHistory(await channelHistoryService.list(workspaceId));
            setNotice(`Pulled ${r.pulled} post${r.pulled === 1 ? '' : 's'} from your connected accounts.`);
        } catch (err) {
            setError(toUserMessage(err, 'Could not pull account history.'));
        } finally {
            setHistoryPulling(false);
        }
    };

    const loadPageOptions = async () => {
        setPagePick((p) => ({ ...p, busy: true }));
        try {
            const res = await integrationService.listProperties(workspaceId, 'meta-pages');
            setPagePick({ options: res?.properties ?? [], value: '', busy: false });
        } catch (err) {
            setPagePick({ options: [], value: '', busy: false });
            setError(toUserMessage(err, 'Could not list your Facebook Pages.'));
        }
    };

    const choosePage = async (pageId) => {
        if (!pageId) return;
        setPagePick((p) => ({ ...p, value: pageId, busy: true }));
        try {
            await integrationService.setProperty(workspaceId, pageId, 'meta-pages');
            setMetaPages((m) => ({ ...m, pageSelected: true }));
            setNotice('Facebook Page selected.');
        } catch (err) {
            setError(toUserMessage(err, 'Could not select that Page.'));
        } finally {
            setPagePick((p) => ({ ...p, busy: false }));
        }
    };

    const renderHistory = () => (
        <Panel className="module-panel">
            <PanelHeader
                title="Account history"
                meta="Your real published posts and their engagement — the ground truth for what works"
                action={metaPages.connected ? (
                    <button type="button" className="btn btn-primary" onClick={pullHistory} disabled={historyPulling || !metaPages.pageSelected}>
                        {historyPulling ? 'Pulling…' : 'Pull history'}
                    </button>
                ) : metaPages.configured ? (
                    <button type="button" className="btn btn-primary" onClick={() => connectPublisher('meta-pages')}>Connect Facebook & Instagram</button>
                ) : null}
            />
            {!metaPages.configured && (
                <p className="cockpit__intel-hint">Facebook & Instagram isn't configured on this build yet (Meta app + env pending). LinkedIn history isn't available — LinkedIn restricts reading personal-profile posts; it arrives with the company-Pages tier.</p>
            )}
            {metaPages.connected && !metaPages.pageSelected && (
                <div className="brief-section">
                    <label className="label-text">Choose the Facebook Page to publish from and read history for:</label>
                    {pagePick.options.length === 0 ? (
                        <button type="button" className="btn btn-secondary" onClick={loadPageOptions} disabled={pagePick.busy}>{pagePick.busy ? 'Loading…' : 'List my Pages'}</button>
                    ) : (
                        <select className="intel-input" value={pagePick.value} onChange={(e) => choosePage(e.target.value)} disabled={pagePick.busy}>
                            <option value="">Select a Page…</option>
                            {pagePick.options.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                    )}
                </div>
            )}
            {history.length === 0 ? (
                <EmptyState message={metaPages.connected ? 'No history pulled yet — hit "Pull history" to import your posts and their engagement.' : 'Connect Facebook & Instagram to import your past posts and see what actually performed.'} />
            ) : (
                <ul className="measurement-list">
                    {history.map((p) => (
                        <li key={p.id} className="measurement-row">
                            <div className="measurement-row__head">
                                <div className="measurement-row__main">
                                    <span className="measurement-row__title">{(p.text || '(no text)').slice(0, 120)}{p.text?.length > 120 ? '…' : ''}</span>
                                    <span className="measurement-row__sub">
                                        {p.channel === 'instagram' ? 'Instagram' : 'Facebook'}{p.mediaType ? ` · ${p.mediaType}` : ''}{p.postedAt ? ` · ${formatRelativeTime(p.postedAt)}` : ''}
                                    </span>
                                </div>
                                <div className="measurement-row__metrics">
                                    <span><strong>{p.metrics?.likes ?? 0}</strong> likes</span>
                                    <span><strong>{p.metrics?.comments ?? 0}</strong> comments</span>
                                    {p.channel === 'facebook' && <span><strong>{p.metrics?.shares ?? 0}</strong> shares</span>}
                                </div>
                                {p.url && <a className="campaigns__step-link" href={p.url} target="_blank" rel="noreferrer">View ↗</a>}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );

    if (loading) return <div className="social-media-module module-kepler"><EmptyState loading message="Loading…" /></div>;
    if (!readiness.socialReady) {
        return (
            <div className="social-media-module module-kepler">
                <SetupRequired
                    title="Social Media"
                    summary="Social content is generated against your brand voice and identity. Save a brand profile so posts reflect real brand data instead of placeholders."
                    requirements={[{ label: 'Saved brand profile (overview, values, or tone)', done: readiness.hasBrandContext, prereq: 'brand' }]}
                    workspaceId={workspaceId}
                />
            </div>
        );
    }

    /* The form "Run calendar" submits. It briefly lived in the tool rail while
       its own button sat in the screen bar — a primary action whose inputs are
       behind a toggle is incoherent, so it is back on the canvas, compact and
       above the calendar it produces. */
    const plannerSetup = (
        <Panel variant="quiet" className="planner-setup">
            <PanelHeader title="Calendar setup" meta={`${cfg.weeks}w · ${cfg.postsPerWeek}/wk`} />
            <div className="builder-grid">
                    <div className="input-group">
                        <label className="label-text">Start date</label>
                        <input className="intel-input" type="date" value={cfg.startDate} onChange={(e) => setCfg({ ...cfg, startDate: e.target.value })} />
                    </div>
                    <div className="input-group">
                        <label className="label-text">Timeline</label>
                        <select className="intel-input" value={cfg.weeks} onChange={(e) => setCfg({ ...cfg, weeks: Number(e.target.value) })}>
                            {WEEK_OPTS.map((w) => <option key={w.v} value={w.v}>{w.l}</option>)}
                        </select>
                    </div>
                    <div className="input-group">
                        <label className="label-text">Posts / week</label>
                        <select className="intel-input" value={cfg.postsPerWeek} onChange={(e) => setCfg({ ...cfg, postsPerWeek: Number(e.target.value) })}>
                            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    <div className="input-group">
                        <label className="label-text">Platforms</label>
                        <div className="platform-pills">
                            {PLATFORM_OPTS.map((p) => (
                                <button key={p.id} type="button" className={`btn btn-secondary platform-pill ${cfg.platforms.includes(p.id) ? 'active' : ''}`} onClick={() => togglePlatform(p.id)}>{p.label}</button>
                            ))}
                        </div>
                    </div>
                    <div className="input-group">
                        <label className="label-text">Voice</label>
                        <div className="platform-pills">
                            {[{ id: 'company', l: 'Company page' }, { id: 'founder', l: 'Founder' }, { id: 'mix', l: 'Mix' }].map((v) => (
                                <button key={v.id} type="button" className={`btn btn-secondary platform-pill ${cfg.voice === v.id ? 'active' : ''}`} onClick={() => setCfg({ ...cfg, voice: v.id })}>{v.l}</button>
                            ))}
                        </div>
                    </div>
                    <div className="input-group">
                        <label className="label-text">Monthly theme (optional)</label>
                        <input className="intel-input" placeholder="e.g. AI cost control for engineering leaders" value={cfg.topic} onChange={(e) => setCfg({ ...cfg, topic: e.target.value })} />
                    </div>
            </div>
        </Panel>
    );

    const renderPlanner = () => (
        <div className="planner-view">
            {plannerSetup}
            {viewMode === 'calendar' ? (
                <div className="calendar-grid kepler-tile">
                    {WEEKDAY_LABELS.map((d) => <div key={d} className="calendar-day-header">{d}</div>)}
                    {monthCells(viewMonth).map((date, i) => {
                        const iso = date ? toIso(date) : null;
                        const dayPosts = iso ? (postsByDate[iso] ?? []) : [];
                        return (
                            <div key={i} className={`calendar-cell ${!date ? 'inactive' : ''}`}>
                                {date && <span className="day-num">{date.getDate()}</span>}
                                {dayPosts.map((it) => (
                                    <div key={it.id} className="post-micro-card" onClick={() => openPost(it)}>
                                        <p className="micro-copy">{SOCIAL_PLATFORM_SPECS[it.payload.platform]?.label}: {it.payload.post.hook || it.title}</p>
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="list-view">
                    {items.length === 0 && <EmptyState message="No posts planned yet. Run a calendar above." />}
                    {[...items].sort((a, b) => a.payload.date.localeCompare(b.payload.date)).map((it) => (
                        <div key={it.id} className="post-list-card kepler-tile">
                            <div className="post-main">
                                <div className="platform-badge">{SOCIAL_PLATFORM_SPECS[it.payload.platform]?.label}{it.payload.post.voice ? ` · ${it.payload.post.voice}` : ''}</div>
                                <p className="post-copy-preview">{it.payload.post.hook || it.title}</p>
                                <span className="post-date text-muted">{it.payload.date}</span>
                            </div>
                            <div className="post-status-area">
                                <button type="button" className="btn-design-studio" onClick={() => openPost(it)}>Design Studio</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderGenerator = () => {
        if (!selected) return <EmptyState message="Select a post from the planner to open it here." />;
        const post = selected.payload.post;
        const limit = SOCIAL_PLATFORM_SPECS[selected.payload.platform]?.charLimit;
        const over = limit && editBody.length > limit;
        return (
            <div className="generator-view">
                <div className="generator-grid">
                    <Panel className="design-brief-pane">
                        <PanelHeader title="Post" meta={`${SOCIAL_PLATFORM_SPECS[selected.payload.platform]?.label}${post.voice ? ` · ${post.voice}` : ''} · ${selected.payload.date}${post.angle ? ` · ${post.angle}` : ''}`} />
                        <div className="brief-section">
                            <label className="label-text">Copy {limit ? `(${editBody.length}/${limit}${over ? ' ⚠' : ''})` : ''}</label>
                            <textarea className="intel-textarea" style={{ minHeight: 220 }} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                        </div>
                        {post.cta && <p className="label-text">CTA: {post.cta}</p>}
                        {post.hashtags?.length > 0 && (
                            <div className="chip-container">{post.hashtags.map((h, i) => <span key={i} className="intel-chip">{h.startsWith('#') ? h : `#${h}`}</span>)}</div>
                        )}
                        <div className="generator-actions">
                            <button type="button" className="btn btn-primary" onClick={handleSavePost} disabled={savingId === selected.id}>{savingId === selected.id ? 'Saving…' : 'Save'}</button>
                            <button type="button" className="btn btn-secondary" onClick={copyPost}>{copied ? 'Copied!' : 'Copy'}</button>
                            {(() => {
                                const platform = selected.payload.platform;
                                if (published?.url) {
                                    return <a className="btn btn-secondary" href={published.url} target="_blank" rel="noreferrer">View live post ↗</a>;
                                }
                                if (platform === 'linkedin' && linkedin.configured) {
                                    return linkedin.connected
                                        ? <button type="button" className="btn btn-secondary" onClick={() => publishPost('linkedin', {}, 'LinkedIn')} disabled={publishing}>{publishing ? 'Publishing…' : 'Publish to LinkedIn'}</button>
                                        : <button type="button" className="btn btn-secondary" onClick={() => connectPublisher('linkedin')}>Connect LinkedIn</button>;
                                }
                                if (platform === 'facebook' && metaPages.configured) {
                                    if (!metaPages.connected) return <button type="button" className="btn btn-secondary" onClick={() => connectPublisher('meta-pages')}>Connect Facebook</button>;
                                    if (!metaPages.pageSelected) return <button type="button" className="btn btn-secondary" onClick={() => { setView('history'); loadPageOptions(); }}>Pick a Page first</button>;
                                    return <button type="button" className="btn btn-secondary" onClick={() => publishPost('meta-pages', { channel: 'facebook' }, 'Facebook')} disabled={publishing}>{publishing ? 'Publishing…' : 'Publish to Facebook'}</button>;
                                }
                                if (platform === 'instagram' && metaPages.configured) {
                                    // IG's API requires hosted media - honest state until media upload ships.
                                    return <button type="button" className="btn btn-secondary" disabled title="Instagram needs a hosted image or video - publishing lands with media upload.">Instagram: needs media</button>;
                                }
                                return null;
                            })()}
                            <button type="button" className="btn-destructive" onClick={() => handleDeletePost(selected)}>Delete</button>
                        </div>
                        <RatingControl
                            key={selected.id}
                            label="Rate this post"
                            onSubmit={async (rating, improvement) => { await feedbackService.saveFeedback(workspaceId, { module: 'social', label: `${selected.payload.platform}/${post.voice || 'company'}`, rating, improvement }); setFeedbackVersion((v) => v + 1); }}
                        />
                    </Panel>

                    <Panel className="design-preview-pane">
                        <PanelHeader
                            title="Carousel design"
                            meta="On-brand HTML slides"
                            action={<button type="button" className="btn btn-secondary" onClick={handleGenerateCarousel} disabled={busyCarousel}>{busyCarousel ? 'Designing…' : (carousel ? 'Regenerate' : 'Generate carousel')}</button>}
                        />
                        {carousel ? (
                            <CarouselPreview slides={carousel.slides} colorIdentity={brand?.colorIdentity ?? {}} />
                        ) : (
                            <p className="module-empty-state">Generate an on-brand carousel for this post (optional).</p>
                        )}
                    </Panel>
                </div>
            </div>
        );
    };

    return (
        <ModuleScreen
            className="social-media-module module-kepler"
            moduleKey={`social-${view}`}
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
                    <FeedbackInsight workspaceId={workspaceId} module="social" refreshKey={feedbackVersion} />
                </>
            }
            /* v3 stacked THREE chrome rows before content: a panel holding the
               sub-view tabs, then a row with two view toggles, then a count.
               They are all screen controls, so they share one row. */
            status={
                <>
                    <Tabs
                        tabs={[
                            { id: 'planner', label: 'Content Planner' },
                            { id: 'generator', label: 'Design Generator' },
                            { id: 'history', label: 'Account History' },
                        ]}
                        activeTab={view}
                        onTabChange={setView}
                        variant="kepler"
                    />
                    {view === 'planner' && (
                        <>
                            <div className="view-toggle kepler-tile">
                                <button type="button" className={viewMode === 'calendar' ? 'active' : ''} onClick={() => setViewMode('calendar')}>Calendar</button>
                                <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>List</button>
                            </div>
                            {viewMode === 'calendar' && (
                                <div className="view-toggle kepler-tile">
                                    <button type="button" onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
                                    <span className="social-month">{viewMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                                    <button type="button" onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month">›</button>
                                </div>
                            )}
                            <span>{items.length} posts planned</span>
                        </>
                    )}
                </>
            }
            primary={view === 'planner' ? (
                <button type="button" className="btn btn-primary" onClick={handleRunCalendar} disabled={generating}>
                    {generating ? 'Generating calendar…' : 'Run calendar'}
                </button>
            ) : null}
        >
            <div className="studio-viewport">
                {view === 'planner' ? renderPlanner() : view === 'history' ? renderHistory() : renderGenerator()}
            </div>
        </ModuleScreen>
    );
};

export default SocialMedia;
