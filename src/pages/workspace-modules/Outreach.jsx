import { useEffect, useState } from 'react';
import ContentCard from '../../components/ui/ContentCard';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import SetupRequired from '../../components/workspace/SetupRequired';
import CampaignStepBanner from '../../components/campaigns/CampaignStepBanner';
import RatingControl from '../../components/ui/RatingControl';
import FeedbackInsight from '../../components/ui/FeedbackInsight';
import { useSearchParams } from 'react-router-dom';
import { useWorkspaceConfig } from '../../hooks/useWorkspaceConfig';
import { outreachService } from '../../services/outreachService';
import { contentService } from '../../services/contentService';
import { campaignService } from '../../services/campaignService';
import { feedbackService } from '../../services/feedbackService';
import { integrationService } from '../../services/integrationService';
import { campaignUtm } from '../../lib/tracking';
import { LIFECYCLE_FLOWS } from '../../lib/outreachSkeletons';
import { toUserMessage } from '../../lib/errors';
import '../../styles/module-kepler.css';
import './Outreach.css';

const MODES = [
    { id: 'cold', label: 'Cold Outreach' },
    { id: 'lifecycle', label: 'Lifecycle Flow' },
];
const CHANNELS = [
    { id: 'email', label: 'Email' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'sms', label: 'SMS' },
];
const FLOW_OPTIONS = Object.entries(LIFECYCLE_FLOWS).map(([id, f]) => ({ id, label: f.label }));

const EMPTY_CONFIG = {
    icpId: '',
    goal: '',
    offer: '',
    channels: ['email'],
    touchCount: 5,
    flowType: 'welcome',
};

// Push helpers - map a generated sequence into a Zoho contact + one dated task
// per step. Date math lives here (client-side); the edge fn stays a dumb writer.
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
};
const buildZohoSteps = (sequence, startDate) =>
    (sequence?.steps ?? []).map((s, i) => {
        // Cold steps carry a numeric dayOffset; lifecycle steps don't - space those.
        const offset = typeof s.dayOffset === 'number' ? s.dayOffset : i * 2;
        const description = [
            `${(s.channel || 'email').toUpperCase()}${s.framework ? ` · ${s.framework}` : ''}`,
            s.body,
            s.cta ? `CTA: ${s.cta}` : '',
        ].filter(Boolean).join('\n\n');
        return {
            subject: (s.subject || s.purpose || `Step ${s.stepNumber ?? i + 1}`).slice(0, 120),
            dueDate: addDays(startDate, Math.max(0, offset)),
            description,
        };
    });

const Outreach = ({ workspaceId }) => {
    const { loading, personas, readiness } = useWorkspaceConfig(workspaceId);
    const [mode, setMode] = useState('cold');
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
    const [sequence, setSequence] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [copiedId, setCopiedId] = useState(null);
    const [saved, setSaved] = useState([]);
    const [feedbackVersion, setFeedbackVersion] = useState(0);
    const [zohoConnected, setZohoConnected] = useState(false);
    const [pushOpen, setPushOpen] = useState(false);
    const [pushRecipient, setPushRecipient] = useState({ firstName: '', lastName: '', email: '' });
    const [pushStartDate, setPushStartDate] = useState(todayISO);
    const [pushing, setPushing] = useState(false);
    const [pushError, setPushError] = useState('');
    const [crmContacts, setCrmContacts] = useState(null);
    const [loadingContacts, setLoadingContacts] = useState(false);

    // Load previously saved sequences so they persist across navigation.
    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const rows = await contentService.getContentItems(workspaceId, 'outreach');
                if (!cancelled) setSaved(rows.filter((r) => r.payload?.sequence?.steps?.length));
            } catch { /* non-fatal */ }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    // Is Zoho connected for this workspace? Gates the "Push to Zoho CRM" action.
    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const st = await integrationService.getStatus(workspaceId, 'zoho');
                if (!cancelled) setZohoConnected(st?.status === 'connected');
            } catch { /* non-fatal - just hide the push action */ }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    const openSaved = (item) => {
        setMode(item.payload.sequence?.mode || 'cold');
        setConfig({ ...EMPTY_CONFIG, ...(item.payload.config ?? {}) });
        setSequence(item.payload.sequence);
        setNotice(`Loaded "${item.title}".`);
    };

    const toggleChannel = (id) => {
        if (id === 'email') return; // email is always on
        setConfig((c) => ({
            ...c,
            channels: c.channels.includes(id) ? c.channels.filter((x) => x !== id) : [...c.channels, id],
        }));
    };

    const handleGenerate = async () => {
        const icp = personas.find((p) => p.id === config.icpId);
        if (!icp) { setError('Select a recipient ICP first.'); return; }
        setGenerating(true);
        setError('');
        setNotice('');
        setSequence(null);
        try {
            const res = await outreachService.generateSequence(workspaceId, {
                mode,
                icp,
                goal: config.goal,
                offer: config.offer,
                channels: config.channels,
                touchCount: Number(config.touchCount),
                flowType: config.flowType,
            });
            if (res.ok) setSequence(res.sequence);
            else setError(res.error || 'Outreach generation failed.');
        } catch (err) {
            setError(toUserMessage(err, 'Outreach generation failed.'));
        } finally {
            setGenerating(false);
        }
    };

    const handleSave = async () => {
        if (!sequence) return;
        setSaving(true);
        setError('');
        try {
            const created = await contentService.createContentItem(workspaceId, 'outreach', {
                title: sequence.name,
                status: 'completed',
                source: `outreach-${mode}`,
                payload: { config, sequence },
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
            setNotice(campaignCtx.campaignId ? 'Saved and linked to your campaign.' : 'Sequence saved.');
        } catch (err) {
            setError(toUserMessage(err, 'Could not save the sequence.'));
        } finally {
            setSaving(false);
        }
    };

    const handleCopy = (step) => {
        const text = [step.subject && `Subject: ${step.subject}`, step.body, step.cta && `CTA: ${step.cta}`]
            .filter(Boolean).join('\n\n');
        navigator.clipboard.writeText(text).then(
            () => { setCopiedId(step.stepNumber); setTimeout(() => setCopiedId(null), 2000); },
            () => setError('Copy failed - your browser blocked clipboard access.'),
        );
    };

    const loadZohoContacts = async () => {
        setLoadingContacts(true);
        setPushError('');
        try {
            const res = await integrationService.fetchFromConnector(workspaceId, 'zoho', { resource: 'contacts' });
            setCrmContacts(res?.result?.items ?? []);
        } catch (err) {
            setPushError(toUserMessage(err, 'Could not load Zoho contacts.'));
        } finally {
            setLoadingContacts(false);
        }
    };

    const pickCrmContact = (id) => {
        const c = (crmContacts ?? []).find((x) => x.id === id);
        if (c) setPushRecipient({ firstName: c.firstName || '', lastName: c.lastName || '', email: c.email || '' });
    };

    const handlePushZoho = async () => {
        if (!sequence) return;
        const contact = {
            firstName: pushRecipient.firstName.trim(),
            lastName: pushRecipient.lastName.trim(),
            email: pushRecipient.email.trim(),
        };
        if (!contact.lastName && !contact.email) {
            setPushError('Enter at least a last name or an email.');
            return;
        }
        setPushing(true);
        setPushError('');
        try {
            const steps = buildZohoSteps(sequence, pushStartDate);
            const res = await integrationService.pushToCrm(workspaceId, 'zoho', {
                contact,
                steps,
                sequenceName: sequence.name,
                // Stamp the campaign so Measurement can attribute this CRM record.
                campaignTag: campaignCtx.campaignId ? campaignUtm({ id: campaignCtx.campaignId }) : '',
            });
            const n = res?.result?.tasksCreated ?? steps.length;
            setPushOpen(false);
            setNotice(`Pushed to Zoho CRM - contact + ${n} task${n === 1 ? '' : 's'} created.`);
        } catch (err) {
            setPushError(toUserMessage(err, 'Could not push to Zoho.'));
        } finally {
            setPushing(false);
        }
    };

    if (loading) {
        return <div className="outreach-module module-kepler"><EmptyState loading message="Loading…" /></div>;
    }

    if (!readiness.outreachReady) {
        return (
            <div className="outreach-module module-kepler">
                <SetupRequired
                    title="Outreach"
                    summary="Outreach sequences target a defined audience. Add at least one ICP so the builder can use a real recipient profile instead of invented data."
                    requirements={[{ label: 'At least one ICP in Brand Intelligence → Audience & ICP', done: readiness.hasIcps, prereq: 'icp' }]}
                    workspaceId={workspaceId}
                />
            </div>
        );
    }

    return (
        <div className="outreach-module module-kepler">
            {campaignCtx.campaignId && (
                <CampaignStepBanner
                    workspaceId={workspaceId}
                    campaignId={campaignCtx.campaignId}
                    stepId={campaignCtx.stepId}
                    brief={campaignCtx.brief}
                />
            )}
            <FeedbackInsight workspaceId={workspaceId} module="outreach" refreshKey={feedbackVersion} />
            <Panel>
                <PanelHeader
                    title="Outreach Sequence Builder"
                    meta="Generate personalized multi-touch sequences grounded in your brand and a saved ICP."
                    action={
                        <div className="module-toolbar module-toolbar--inline">
                            {sequence && (
                                <button type="button" className="btn btn-secondary" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Saving…' : 'Save sequence'}
                                </button>
                            )}
                            {sequence && zohoConnected && (
                                <button type="button" className="btn btn-secondary" onClick={() => { setPushError(''); setCrmContacts(null); setPushOpen(true); }}>
                                    Push to Zoho CRM
                                </button>
                            )}
                            <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
                                {generating ? 'Generating…' : 'Generate sequence'}
                            </button>
                        </div>
                    }
                />
                {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
            </Panel>

            {saved.length > 0 && (
                <Panel className="module-panel">
                    <PanelHeader title="Saved sequences" meta={`${saved.length} saved - click to reopen`} />
                    <div className="platform-pills">
                        {saved.map((item) => (
                            <button key={item.id} type="button" className="btn btn-secondary platform-pill" onClick={() => openSaved(item)}>
                                {item.title} ({item.payload.sequence?.steps?.length ?? 0})
                            </button>
                        ))}
                    </div>
                </Panel>
            )}

            <Panel className="module-panel">
                <PanelHeader title="Sequence configuration" meta="Mode, audience, and goal" />
                <div className="builder-grid">
                    <div className="input-group">
                        <label className="label-text">Mode</label>
                        <div className="platform-pills">
                            {MODES.map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    className={`btn btn-secondary platform-pill ${mode === m.id ? 'active' : ''}`}
                                    onClick={() => { setMode(m.id); setSequence(null); }}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="label-text">Recipient Profile (ICP)</label>
                        <select className="intel-input" value={config.icpId} onChange={(e) => setConfig({ ...config, icpId: e.target.value })}>
                            <option value="">Select a saved ICP…</option>
                            {personas.map((p) => <option key={p.id} value={p.id}>{p.role}</option>)}
                        </select>
                    </div>

                    <div className="input-group">
                        <label className="label-text">Goal</label>
                        <input className="intel-input" type="text" placeholder="e.g. book a 15-min walkthrough" value={config.goal} onChange={(e) => setConfig({ ...config, goal: e.target.value })} />
                    </div>

                    {mode === 'cold' ? (
                        <>
                            <div className="input-group">
                                <label className="label-text">Offer / value to lead with</label>
                                <input className="intel-input" type="text" placeholder="optional - what's the hook?" value={config.offer} onChange={(e) => setConfig({ ...config, offer: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label className="label-text">Channels</label>
                                <div className="platform-pills">
                                    {CHANNELS.map((ch) => (
                                        <button
                                            key={ch.id}
                                            type="button"
                                            className={`btn btn-secondary platform-pill ${config.channels.includes(ch.id) ? 'active' : ''}`}
                                            onClick={() => toggleChannel(ch.id)}
                                            disabled={ch.id === 'email'}
                                        >
                                            {ch.label}{ch.id === 'email' ? ' ✓' : ''}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="input-group">
                                <label className="label-text">Touches</label>
                                <select className="intel-input" value={config.touchCount} onChange={(e) => setConfig({ ...config, touchCount: e.target.value })}>
                                    {[3, 4, 5].map((n) => <option key={n} value={n}>{n} touches</option>)}
                                </select>
                            </div>
                        </>
                    ) : (
                        <div className="input-group">
                            <label className="label-text">Flow type</label>
                            <select className="intel-input" value={config.flowType} onChange={(e) => setConfig({ ...config, flowType: e.target.value })}>
                                {FLOW_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            </Panel>

            {sequence && (sequence.personalizationVariables.length > 0 || sequence.complianceNotes.length > 0) && (
                <Panel className="module-panel">
                    {sequence.personalizationVariables.length > 0 && (
                        <div className="data-section">
                            <label className="data-label">Personalization tokens (fill before sending)</label>
                            <div className="chip-container">
                                {sequence.personalizationVariables.map((v) => (
                                    <span key={v.token} className="intel-chip" title={v.description}>{v.token}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    {sequence.complianceNotes.map((n, i) => (
                        <p key={i} className="brand-intel-module__source-label">⚠ {n}</p>
                    ))}
                </Panel>
            )}

            <Panel className="module-panel">
                <PanelHeader title="Sequence timeline" meta="Multi-touch journey - review and copy each step" />
                <div className="horizontal-timeline-container">
                    {!sequence && (
                        <EmptyState
                            loading={generating}
                            message={generating ? 'Generating sequence…' : 'No sequence yet. Configure above and generate.'}
                        />
                    )}
                    {sequence?.steps.map((step) => {
                        const v = step.validation ?? {};
                        const lenLabel = step.channel === 'email' ? `${v.wordCount ?? 0}w` : `${v.charCount ?? 0} chars`;
                        return (
                            <div key={step.stepNumber} className="touchpoint-wrapper">
                                <div className="day-marker">
                                    <span className="label-text">{step.dayOffset != null ? `Day ${step.dayOffset}` : (step.delay || `Step ${step.stepNumber}`)}</span>
                                </div>
                                <ContentCard
                                    variant="kepler"
                                    title={step.subject || step.purpose || `Step ${step.stepNumber}`}
                                    type={`${step.channel}${step.framework ? ` · ${step.framework}` : ''}`}
                                    status={v.overLength ? 'Over length' : ''}
                                    actions={[{ label: copiedId === step.stepNumber ? 'Copied' : 'Copy', onClick: () => handleCopy(step) }]}
                                    footer={
                                        <div className="tone-note">
                                            <span className="label-text">
                                                {lenLabel}{v.overLength ? ' ⚠' : ''}
                                                {v.bannedFound?.length ? ` · ${v.bannedFound.length} banned ⚠` : ''}
                                                {v.tokens?.length ? ` · ${v.tokens.length} tokens` : ''}
                                            </span>
                                        </div>
                                    }
                                >
                                    <div className="message-box">
                                        {step.previewText && <p className="label-text">{step.previewText}</p>}
                                        {step.body}
                                        {step.cta && <div className="tone-note"><span className="label-text">CTA: {step.cta}</span></div>}
                                    </div>
                                </ContentCard>
                            </div>
                        );
                    })}
                </div>
                {sequence && (
                    <RatingControl
                        key={sequence.name}
                        label="Rate this sequence"
                        onSubmit={async (rating, improvement) => { await feedbackService.saveFeedback(workspaceId, { module: 'outreach', label: sequence.flowType || sequence.mode || '', rating, improvement }); setFeedbackVersion((v) => v + 1); }}
                    />
                )}
            </Panel>

            <Modal
                isOpen={pushOpen}
                onClose={() => { if (!pushing) setPushOpen(false); }}
                title="Push sequence to Zoho CRM"
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setPushOpen(false)} disabled={pushing}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={handlePushZoho} disabled={pushing}>
                            {pushing ? 'Pushing…' : 'Push to Zoho'}
                        </button>
                    </>
                }
            >
                <p className="brand-intel-module__source-label">
                    Creates one Zoho contact and a dated task per step. Personalization tokens (e.g. {'{{firstName}}'}) are pushed as-is for you to fill in Zoho.
                </p>
                <div className="input-group">
                    <label className="label-text">Recipient</label>
                    {crmContacts === null ? (
                        <button type="button" className="btn btn-secondary" onClick={loadZohoContacts} disabled={loadingContacts}>
                            {loadingContacts ? 'Loading…' : 'Pull an existing contact from Zoho'}
                        </button>
                    ) : (
                        <select className="intel-input" defaultValue="" onChange={(e) => pickCrmContact(e.target.value)}>
                            <option value="">{crmContacts.length ? 'Pick a Zoho contact…' : 'No Zoho contacts found - enter one below'}</option>
                            {crmContacts.map((c) => (
                                <option key={c.id} value={c.id}>{[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || c.id}</option>
                            ))}
                        </select>
                    )}
                </div>
                <div className="input-group">
                    <label className="label-text">First name</label>
                    <input className="intel-input" type="text" value={pushRecipient.firstName} onChange={(e) => setPushRecipient((r) => ({ ...r, firstName: e.target.value }))} />
                </div>
                <div className="input-group">
                    <label className="label-text">Last name</label>
                    <input className="intel-input" type="text" value={pushRecipient.lastName} onChange={(e) => setPushRecipient((r) => ({ ...r, lastName: e.target.value }))} />
                </div>
                <div className="input-group">
                    <label className="label-text">Email</label>
                    <input className="intel-input" type="email" placeholder="used to de-dupe the contact in Zoho" value={pushRecipient.email} onChange={(e) => setPushRecipient((r) => ({ ...r, email: e.target.value }))} />
                </div>
                <div className="input-group">
                    <label className="label-text">Start date (day 0)</label>
                    <input className="intel-input" type="date" value={pushStartDate} onChange={(e) => setPushStartDate(e.target.value)} />
                </div>
                {pushError && <p className="brand-intel-module__error" role="alert">{pushError}</p>}
            </Modal>
        </div>
    );
};

export default Outreach;
