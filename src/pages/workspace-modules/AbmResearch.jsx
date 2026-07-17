import { useEffect, useRef, useState } from 'react';
import { Telescope, Sparkles } from '../../lib/icons';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import EmptyState from '../../components/ui/EmptyState';
import UploadZone from '../../components/ui/UploadZone';
import FeedbackInsight from '../../components/ui/FeedbackInsight';
import AbmResultCard from '../../components/abm-research/AbmResultCard';
import { abmResearchService } from '../../services/abmResearchService';
import { abmService } from '../../services/abmService';
import { prospectsService } from '../../services/prospectsService';
import { integrationService } from '../../services/integrationService';
import { parseCompanyList, MAX_COMPANIES } from '../../lib/companyList';
import { buildCrmIndex, crmMatch } from '../../lib/crmDedupe';
import { contactMatchKey, toProspectInsert } from '../../lib/abmContact';
import { toUserMessage } from '../../lib/errors';
import '../../styles/module-kepler.css';
import './AbmResearch.css';

// ABM Research sub-module of Outreach: a chat layer (name a company) + a bulk
// layer (upload/paste a list) over a data layer (account brief + validated
// contacts). Single and bulk share ONE paced queue: each turn runs the grounded
// research -> Apollo -> validate pipeline in [[abmResearchService]] and renders a
// self-contained [[AbmResultCard]]. Bulk auto-persists each result (so paid
// research survives mid-run); single is saved on demand from the card. When Zoho
// is connected, a CRM index de-dupes contacts already in the CRM.

let turnCounter = 0;
const PACE_MS = 12000;   // >=12s/company keeps us <=5/min = <=15 AI calls/min (ai-proxy limit)
const FIT_THRESHOLD = 60; // "save all qualifying" cutoff
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const AbmResearch = ({ workspaceId }) => {
    const [transcript, setTranscript] = useState([]); // { id, query, website?, status, result?, error? }
    const [pending, setPending] = useState(false);
    const [text, setText] = useState('');
    const [bulkText, setBulkText] = useState('');
    const [feedbackVersion, setFeedbackVersion] = useState(0);
    const [crmIndex, setCrmIndex] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [savingBulk, setSavingBulk] = useState(false);
    const logRef = useRef(null);
    const cancelRef = useRef(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
    }, [transcript, pending]);

    // Load a Zoho CRM index once (if connected) so contacts already in the CRM
    // can be de-duplicated. Best-effort — dedupe silently disables on any failure.
    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const st = await integrationService.getStatus(workspaceId, 'zoho');
                if (cancelled || st?.status !== 'connected') return;
                const res = await integrationService.fetchFromConnector(workspaceId, 'zoho', { resource: 'contacts-all' });
                if (!cancelled) setCrmIndex(buildCrmIndex(res?.result?.items ?? []));
            } catch { /* dedupe is best-effort */ }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    const parsed = parseCompanyList(bulkText);
    const remaining = transcript.filter((e) => e.status === 'queued' || e.status === 'loading').length;
    const doneEntries = transcript.filter((e) => e.status === 'done' && e.result);
    const failedCount = transcript.filter((e) => e.status === 'error').length;

    // Run a list of companies through the pipeline sequentially, paced under the
    // rate limit, cancellable. autoPersist=true saves each result immediately.
    const runCompanies = async (companies, autoPersist) => {
        if (pending || !companies.length) return;
        cancelRef.current = false;
        const items = companies.map((c) => ({
            id: ++turnCounter, query: c.name, website: c.website || '', status: 'queued',
        }));
        setTranscript((t) => [...t, ...items]);
        setPending(true);
        setError('');
        setNotice('');

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (cancelRef.current) {
                setTranscript((t) => t.map((e) => (e.id === item.id ? { ...e, status: 'cancelled' } : e)));
                continue;
            }
            setTranscript((t) => t.map((e) => (e.id === item.id ? { ...e, status: 'loading' } : e)));
            const started = Date.now();
            try {
                const res = await abmResearchService.researchAccount(workspaceId, { companyName: item.query, website: item.website });
                if (res.ok) {
                    let result = res;
                    if (autoPersist) {
                        try {
                            const saved = await abmService.saveResearch(workspaceId, { account: res.account, contacts: res.contacts });
                            result = { account: saved.account, contacts: saved.contacts, sources: res.sources, apolloUsed: res.apolloUsed, persisted: true };
                        } catch { /* keep the unsaved result if persistence fails */ }
                    }
                    setTranscript((t) => t.map((e) => (e.id === item.id ? { ...e, status: 'done', result } : e)));
                } else {
                    setTranscript((t) => t.map((e) => (e.id === item.id ? { ...e, status: 'error', error: res.error } : e)));
                }
            } catch (err) {
                setTranscript((t) => t.map((e) => (e.id === item.id ? { ...e, status: 'error', error: err.message } : e)));
            }
            // Pace between companies (skip after the last one / when cancelled).
            if (i < items.length - 1 && !cancelRef.current) {
                const elapsed = Date.now() - started;
                if (elapsed < PACE_MS) await wait(PACE_MS - elapsed);
            }
        }
        setPending(false);
    };

    const runSingle = () => {
        const q = text.trim();
        if (!q || pending) return;
        setText('');
        runCompanies([{ name: q, website: '' }], false);
    };

    const runBulk = () => {
        if (!parsed.length || pending) return;
        setBulkText('');
        runCompanies(parsed, true);
    };

    const retryFailed = () => {
        const failed = transcript.filter((e) => e.status === 'error').map((e) => ({ name: e.query, website: e.website }));
        if (failed.length) runCompanies(failed, true);
    };

    const onFile = (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting the same file
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setBulkText(String(reader.result ?? ''));
        reader.onerror = () => setError('Could not read that file.');
        reader.readAsText(file);
    };

    // Batch convenience: push every qualifying (fit >= threshold, not a CRM email
    // duplicate) contact across all completed results into the prospect list.
    const saveAllQualifying = async () => {
        const seen = new Set();
        const picks = [];
        for (const e of doneEntries) {
            for (const c of e.result.contacts ?? []) {
                if ((c.fitScore ?? 0) < FIT_THRESHOLD) continue;
                if (crmMatch(c, crmIndex) === 'email') continue;
                const k = contactMatchKey(c);
                if (seen.has(k)) continue;
                seen.add(k);
                picks.push(toProspectInsert(c, e.result.account));
            }
        }
        if (!picks.length) { setNotice(`No contacts at or above ${FIT_THRESHOLD} fit to save.`); return; }
        setSavingBulk(true); setError(''); setNotice('');
        try {
            const created = await prospectsService.save(workspaceId, picks);
            setNotice(created.length
                ? `Saved ${created.length} contact${created.length === 1 ? '' : 's'} (fit ≥ ${FIT_THRESHOLD}) to your prospect list.`
                : 'Those contacts are already in your prospect list.');
        } catch (err) {
            setError(toUserMessage(err, 'Could not bulk-save to the prospect list.'));
        } finally { setSavingBulk(false); }
    };

    return (
        <div className="abm-research-module module-kepler">
            <Panel>
                <PanelHeader
                    title="ABM Research"
                    meta="Research a target account, classify it against your ICP, and surface validated contacts."
                />
                <FeedbackInsight workspaceId={workspaceId} module="abm" refreshKey={feedbackVersion} />
            </Panel>

            {/* Bulk research */}
            <Panel className="module-panel abm-bulk">
                <PanelHeader
                    title="Bulk research"
                    meta={`Upload a .csv/.txt or paste a list — one company per line (name, or name,website). Up to ${MAX_COMPANIES} per run.`}
                    action={doneEntries.length > 0 && (
                        <button type="button" className="btn btn-secondary" onClick={saveAllQualifying} disabled={savingBulk || pending}>
                            {savingBulk ? 'Saving…' : `Save qualifying (fit ≥ ${FIT_THRESHOLD}) to prospects`}
                        </button>
                    )}
                />
                <input ref={fileInputRef} type="file" accept=".csv,.txt" hidden onChange={onFile} />
                <UploadZone
                    title="Upload a company list (.csv / .txt)"
                    subtitle="or paste below — a header row and duplicates are handled for you"
                    onBrowse={() => fileInputRef.current?.click()}
                />
                <textarea
                    className="intel-input abm-bulk__paste"
                    rows={4}
                    placeholder={'Acme Corp\nGlobex, globex.com\nInitech'}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    disabled={pending}
                />
                <div className="module-toolbar module-toolbar--inline">
                    <button type="button" className="btn btn-primary" onClick={runBulk} disabled={pending || !parsed.length}>
                        <Telescope size={16} strokeWidth={1.8} /> {pending ? 'Researching…' : `Research ${parsed.length || ''} compan${parsed.length === 1 ? 'y' : 'ies'}`}
                    </button>
                    {pending && (
                        <button type="button" className="btn btn-secondary" onClick={() => { cancelRef.current = true; }}>
                            Cancel
                        </button>
                    )}
                    {!pending && failedCount > 0 && (
                        <button type="button" className="btn btn-secondary" onClick={retryFailed}>Retry {failedCount} failed</button>
                    )}
                </div>
                {pending && remaining > 0 && (
                    <p className="brand-intel-module__source-label" role="status">
                        Researching… {remaining} remaining (~{Math.ceil((remaining * PACE_MS) / 60000)} min). You can keep this tab open.
                    </p>
                )}
                {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
            </Panel>

            {/* Chat + results */}
            <Panel className="module-panel abm-chat">
                <div className="abm-chat__log" ref={logRef} role="log" aria-live="polite">
                    <div className="abm-msg abm-msg--assistant">
                        <div className="abm-bubble abm-bubble--assistant abm-bubble--intro">
                            <span className="abm-bubble__eyebrow font-section">
                                <Sparkles size={13} strokeWidth={1.8} /> ABM analyst
                            </span>
                            <p className="abm-bubble__content">
                                Name a company below (or bulk-upload a list above) and I'll research it live, grade the ICP
                                fit against your saved brand &amp; ICP, and pull the leaders worth pitching.
                            </p>
                        </div>
                    </div>

                    {transcript.length === 0 && (
                        <EmptyState message="No research yet. Enter a company below or upload a list above." />
                    )}

                    {transcript.map((e) => (
                        <div key={e.id} className="abm-turn">
                            <div className="abm-msg abm-msg--user">
                                <div className="abm-bubble abm-bubble--user">{e.query}</div>
                            </div>
                            {(e.status === 'queued' || e.status === 'loading') && (
                                <div className="abm-msg abm-msg--assistant">
                                    <div className="abm-bubble abm-bubble--assistant abm-typing" aria-label="Researching">
                                        <span /><span /><span />
                                    </div>
                                </div>
                            )}
                            {e.status === 'cancelled' && <p className="abm-note">Cancelled — not researched.</p>}
                            {e.status === 'error' && <p className="brand-intel-module__error" role="alert">{e.error}</p>}
                            {e.status === 'done' && (
                                <AbmResultCard
                                    workspaceId={workspaceId}
                                    result={e.result}
                                    readOnly={!!e.result.persisted}
                                    crmIndex={crmIndex}
                                    onFeedback={() => setFeedbackVersion((v) => v + 1)}
                                />
                            )}
                        </div>
                    ))}
                </div>

                <div className="abm-composer">
                    <input
                        className="intel-input abm-composer__input"
                        type="text"
                        placeholder="Company name or website, e.g. Localiza or stripe.com"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSingle(); } }}
                        disabled={pending}
                    />
                    <button type="button" className="btn btn-primary" onClick={runSingle} disabled={pending || !text.trim()}>
                        <Telescope size={16} strokeWidth={1.8} /> Research
                    </button>
                </div>
            </Panel>
        </div>
    );
};

export default AbmResearch;
