import { useEffect, useMemo, useRef, useState } from 'react';
import { Telescope, Sparkles, Download } from '../../lib/icons';
import Panel from '../../components/ui/Panel';
import ModuleScreen from '../../components/layout/ModuleScreen';
import EmptyState from '../../components/ui/EmptyState';
import UploadZone from '../../components/ui/UploadZone';
import FeedbackInsight from '../../components/ui/FeedbackInsight';
import SelectionBar from '../../components/ui/SelectionBar';
import AbmResultCard from '../../components/abm-research/AbmResultCard';
import AddToListModal from '../../components/outreach/AddToListModal';
import { abmResearchService } from '../../services/abmResearchService';
import { abmService } from '../../services/abmService';
import { prospectsService } from '../../services/prospectsService';
import { integrationService } from '../../services/integrationService';
import { useBulkSelect } from '../../hooks/useBulkSelect';
import { parseCompanyList, MAX_COMPANIES } from '../../lib/companyList';
import { buildCrmIndex, crmMatch } from '../../lib/crmDedupe';
import { contactMatchKey, toProspectInsert } from '../../lib/abmContact';
import { buildBatchReportHtml, openReport } from '../../lib/abmReport';
import { toUserMessage } from '../../lib/errors';
import { usageService } from '../../services/usageService';
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
    const bulk = useBulkSelect();               // cross-card contact selection
    const [addListOpen, setAddListOpen] = useState(false);
    const [listProspectIds, setListProspectIds] = useState([]);
    const [addingList, setAddingList] = useState(false);
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

    // Every selectable contact across all completed cards (skip confident CRM email
    // dupes — they can't be saved anyway). selKey namespaces by entry so identical
    // names across companies stay distinct. orderedKeys drives "select top N by fit".
    const allRows = useMemo(() => {
        const rows = [];
        for (const e of doneEntries) {
            for (const c of (e.result.contacts ?? [])) {
                if (crmMatch(c, crmIndex) === 'email') continue;
                rows.push({ selKey: `${e.id}::${contactMatchKey(c)}`, contact: c, account: e.result.account, fit: c.fitScore ?? 0 });
            }
        }
        return rows;
    }, [doneEntries, crmIndex]);
    const orderedKeys = useMemo(() => [...allRows].sort((a, b) => b.fit - a.fit).map((r) => r.selKey), [allRows]);

    // Bulk "Add to list": save the selected contacts as prospects (idempotent), then
    // open the existing choose/create-list modal with their prospect ids.
    const addSelectedToList = async () => {
        const chosen = allRows.filter((r) => bulk.selected.has(r.selKey));
        if (!chosen.length) return;
        setAddingList(true); setError(''); setNotice('');
        try {
            const seen = new Set();
            const picks = [];
            for (const r of chosen) {
                const k = contactMatchKey(r.contact);
                if (seen.has(k)) continue;
                seen.add(k);
                picks.push(toProspectInsert(r.contact, r.account));
            }
            await prospectsService.save(workspaceId, picks); // dedupes on external_id
            const all = await prospectsService.list(workspaceId);
            const idByKey = new Map(all.map((p) => [contactMatchKey(p), p.id]));
            const ids = [...new Set(chosen.map((r) => idByKey.get(contactMatchKey(r.contact))).filter(Boolean))];
            if (!ids.length) { setNotice('Those contacts are already in your prospect list.'); return; }
            setListProspectIds(ids);
            setAddListOpen(true);
        } catch (err) {
            setError(toUserMessage(err, 'Could not prepare the contacts for a list.'));
        } finally { setAddingList(false); }
    };

    const downloadAllReport = () => openReport(buildBatchReportHtml(doneEntries.map((e) => e.result)));

    // Run a list of companies through the pipeline sequentially, paced under the
    // rate limit, cancellable. autoPersist=true saves each result immediately.
    const runCompanies = async (companies, autoPersist) => {
        if (pending || !companies.length) return;
        // E4: batch size distinguishes the analyst chat (one company at a time)
        // from bulk research, which the roadmap treats as two different jobs.
        usageService.run(workspaceId, 'abm', 'account_research', { companies: companies.length });
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
                            const saved = await abmService.saveResearch(workspaceId, { account: res.account, contacts: res.contacts, researchBrief: res.researchBrief });
                            result = { account: saved.account, contacts: saved.contacts, sources: res.sources, apolloUsed: res.apolloUsed, note: res.note, researchBrief: res.researchBrief, persisted: true };
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
        // Auto-persist single-company chat research too, so nothing is lost — it's
        // then revisitable under Saved and downloadable as a report.
        runCompanies([{ name: q, website: '' }], true);
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

    /* Bulk research is a second way in, not the main one — the analyst chat is.
       v3 gave it a full panel above the chat, so the screen opened with an
       upload zone and a paste box before you could see any research. */
    /* Bulk research is a main way in, not an aside — it sat in the rail briefly,
       which hid one of the two ways to start work on this screen. It is a
       collapsible strip on the canvas: visible, but subordinate to the chat. */
    const bulkSection = (
        <details className="abm-bulk" open={parsed.length > 0 || pending}>
            <summary className="abm-bulk__summary">
                Bulk research
                {parsed.length > 0 && <span className="abm-bulk__count">{parsed.length} queued</span>}
            </summary>
            <div className="abm-bulk__body">
                <p className="brand-intel-module__source-label">
                    One company per line: name, or name,website. Up to {MAX_COMPANIES} per run.
                </p>
                <input ref={fileInputRef} type="file" accept=".csv,.txt" hidden onChange={onFile} />
                <UploadZone
                    title="Upload a company list (.csv / .txt)"
                    subtitle="or paste below: a header row and duplicates are handled for you"
                    onBrowse={() => fileInputRef.current?.click()}
                />
                <textarea
                    className="intel-input abm-bulk__paste"
                    rows={3}
                    placeholder={'Acme Corp\nGlobex, globex.com\nInitech'}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    disabled={pending}
                />
                <div className="row row--wrap">
                    <button type="button" className="btn btn-secondary" onClick={runBulk} disabled={pending || !parsed.length}>
                        <Telescope size={15} strokeWidth={1.8} /> {pending ? 'Researching…' : `Research ${parsed.length || ''}`}
                    </button>
                    {pending && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { cancelRef.current = true; }}>Cancel</button>
                    )}
                    {!pending && failedCount > 0 && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={retryFailed}>Retry {failedCount} failed</button>
                    )}
                    {doneEntries.length > 0 && (
                        <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={downloadAllReport}>
                                <Download size={14} strokeWidth={1.8} /> Report ({doneEntries.length})
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={saveAllQualifying} disabled={savingBulk || pending}>
                                {savingBulk ? 'Saving…' : `Save qualifying (fit ≥ ${FIT_THRESHOLD})`}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </details>
    );

    return (
        <ModuleScreen
            className="abm-research-module module-kepler mscreen--fill"
            moduleKey="abm"
            banner={
                <>
                    {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                    {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
                    <FeedbackInsight workspaceId={workspaceId} module="abm" refreshKey={feedbackVersion} />
                </>
            }
            status={
                <>
                    {doneEntries.length > 0 && <span><strong>{doneEntries.length}</strong> researched</span>}
                    {pending && remaining > 0 && <span className="text-accent">{remaining} in progress</span>}
                    {failedCount > 0 && !pending && <span className="text-error">{failedCount} failed</span>}
                </>
            }
        >
            {bulkSection}
            {/* Chat + results — the canvas */}
            <Panel variant="quiet" className="abm-chat">
                <SelectionBar
                    total={allRows.length}
                    selectedCount={bulk.size}
                    label="contacts selected"
                    onSelectAll={() => bulk.selectAll(allRows.map((r) => r.selKey))}
                    onSelectN={(n) => bulk.selectTop(n, orderedKeys)}
                    onClear={bulk.clear}
                >
                    <button type="button" className="btn btn-primary" onClick={addSelectedToList} disabled={addingList}>
                        {addingList ? 'Adding…' : `Add ${bulk.size} to list`}
                    </button>
                </SelectionBar>
                <div className="abm-chat__log" ref={logRef} role="log" aria-live="polite">
                    <div className="abm-msg abm-msg--assistant">
                        <div className="abm-bubble abm-bubble--assistant abm-bubble--intro">
                            <span className="abm-bubble__eyebrow font-section">
                                <Sparkles size={13} strokeWidth={1.8} /> ABM analyst
                            </span>
                            <p className="abm-bubble__content">
                                Name a company below, or open <strong>Bulk research</strong> to upload a list, and I'll
                                research it live, grade the ICP fit against your saved brand and ICP, and pull the
                                leaders worth pitching.
                            </p>
                        </div>
                    </div>

                    {transcript.length === 0 && (
                        <EmptyState message="No research yet. Enter a company below, or open Bulk research to upload a list." />
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
                            {e.status === 'cancelled' && <p className="abm-note">Cancelled. Not researched.</p>}
                            {e.status === 'error' && <p className="brand-intel-module__error" role="alert">{e.error}</p>}
                            {e.status === 'done' && (
                                <AbmResultCard
                                    workspaceId={workspaceId}
                                    result={e.result}
                                    readOnly={!!e.result.persisted}
                                    crmIndex={crmIndex}
                                    entryId={e.id}
                                    selected={bulk.selected}
                                    onToggleContact={bulk.toggle}
                                    onToggleCardAll={(keys, add) => (add ? bulk.addMany(keys) : bulk.removeMany(keys))}
                                    onDeselect={bulk.removeMany}
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

            <AddToListModal
                workspaceId={workspaceId}
                prospectIds={listProspectIds}
                isOpen={addListOpen}
                onClose={() => setAddListOpen(false)}
                onAdded={(added, listName, requested) => {
                    setNotice(`Added ${added} to “${listName}”${requested > added ? ` (${requested - added} already in it)` : ''}.`);
                    bulk.clear();
                }}
            />
        </ModuleScreen>
    );
};

export default AbmResearch;
