import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Telescope, Download, Trash2 } from '../../lib/icons';
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

/**
 * Outreach / Research — MASTER-DETAIL.
 *
 * This replaced a chat transcript. The result card is the densest object in the
 * product (an account brief, a fact row, tech signals, grounding prose, a sources
 * disclosure, a fit-scored contacts table and a CRM-dedupe note), and a
 * twelve-company bulk run stacked twelve of them in a scrolling log. That is not
 * a screen anyone can work in, and it made the cross-account selection bar and
 * the batch report effectively unreachable.
 *
 * Now: an Accounts rail carries this run's queue above the saved accounts, with
 * ONE full card on the right. The composer stays at the foot of the rail, because
 * that is where a new company enters the list.
 *
 * The two lists in the rail do not overlap. Research auto-persists, so a
 * completed account GRADUATES out of the run queue into Saved rather than
 * appearing in both - the near-duplicate trap that Audiences had. The one
 * exception is a result whose persistence failed: it stays in the queue, because
 * that is the only place it can still be reached.
 */

let turnCounter = 0;
const PACE_MS = 12000;   // >=12s/company keeps us <=5/min = <=15 AI calls/min (ai-proxy limit)
const FIT_THRESHOLD = 60; // "save all qualifying" cutoff
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const TIER_LABEL = { enterprise: 'Enterprise', 'mid-market': 'Mid-market', smb: 'SMB' };
// Falls back to the raw tier: research can return its own tiering ("Tier 1"),
// which a strict label map dropped silently.
const accountSub = (a) => [
    a.tier && (TIER_LABEL[a.tier] ?? a.tier),
    a.icpFit && `${a.icpFit} ICP fit`,
    a.employeeSize,
].filter(Boolean).join(' · ');

const QUEUE_NOTE = {
    queued: 'Queued',
    loading: 'Researching…',
    cancelled: 'Cancelled. Not researched.',
};

const AbmResearch = ({ workspaceId }) => {
    const [transcript, setTranscript] = useState([]); // { id, query, website?, status, result?, error? }
    const [accounts, setAccounts] = useState(null);   // null = not loaded yet
    const [selectedKey, setSelectedKey] = useState(null);
    const [resultByKey, setResultByKey] = useState({}); // rail key -> result, for whatever is in memory
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [pending, setPending] = useState(false);
    const [text, setText] = useState('');
    const [bulkText, setBulkText] = useState('');
    const [feedbackVersion, setFeedbackVersion] = useState(0);
    const [crmIndex, setCrmIndex] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [savingBulk, setSavingBulk] = useState(false);
    const bulk = useBulkSelect();               // cross-account contact selection
    const [addListOpen, setAddListOpen] = useState(false);
    const [listProspectIds, setListProspectIds] = useState([]);
    const [addingList, setAddingList] = useState(false);
    const cancelRef = useRef(false);
    const fileInputRef = useRef(null);

    // Saved accounts: the durable half of the rail. Moved here from the retired
    // Audiences "Saved research" tab, because this is where research is produced.
    const loadAccounts = useCallback(async () => {
        try {
            const rows = await abmService.listAccounts(workspaceId);
            setAccounts(rows);
            return rows;
        } catch (err) {
            setAccounts([]);
            setError(toUserMessage(err, 'Could not load your saved accounts.'));
            return [];
        }
    }, [workspaceId]);

    useEffect(() => {
        if (!workspaceId) return undefined;
        // Nothing is auto-selected. Marking a row active without loading its detail
        // put a selected rail row next to an empty pane - the screen contradicting
        // itself - and picking one for the user is a guess about intent. The empty
        // pane is a designed state: it says which of the two situations you are in.
        loadAccounts();
        return undefined;
    }, [workspaceId, loadAccounts]);

    // Zoho CRM index (if connected) so contacts already in the CRM can be
    // de-duplicated. Best-effort: dedupe silently disables on any failure.
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
    const failedCount = transcript.filter((e) => e.status === 'error').length;

    /* The run queue: everything from this run that has NOT graduated into Saved.
       A done entry only stays here when persistence failed, which is the one case
       the saved list cannot show it. */
    const queue = transcript.filter((e) => e.status !== 'done' || !e.result?.persisted);
    const researchedCount = transcript.filter((e) => e.status === 'done').length;

    /* Cross-account contact selection spans everything currently in memory: every
       result this run produced, plus every saved account the user has opened. That
       is what "select top N by fit" ranks over, and it is why the bulk run is
       usable at twelve companies. */
    const allRows = useMemo(() => {
        const rows = [];
        const seenAccounts = new Set();
        for (const [key, result] of Object.entries(resultByKey)) {
            if (!result?.account) continue;
            // The same account can be in memory under both a run key and a saved
            // key; count its contacts once.
            const accountKey = result.account.id ?? result.account.companyName ?? key;
            if (seenAccounts.has(accountKey)) continue;
            seenAccounts.add(accountKey);
            for (const c of (result.contacts ?? [])) {
                if (crmMatch(c, crmIndex) === 'email') continue;
                rows.push({ selKey: `${key}::${contactMatchKey(c)}`, contact: c, account: result.account, fit: c.fitScore ?? 0 });
            }
        }
        return rows;
    }, [resultByKey, crmIndex]);
    const orderedKeys = useMemo(() => [...allRows].sort((a, b) => b.fit - a.fit).map((r) => r.selKey), [allRows]);
    const inMemoryResults = useMemo(() => Object.values(resultByKey).filter((r) => r?.account), [resultByKey]);

    const remember = (key, result) => setResultByKey((prev) => ({ ...prev, [key]: result }));

    const openSaved = async (a) => {
        const key = `saved:${a.id}`;
        setSelectedKey(key);
        if (resultByKey[key]) return;           // already in memory
        setLoadingDetail(true);
        setError('');
        try {
            const res = await abmService.getAccountWithContacts(workspaceId, a.id);
            if (res) {
                remember(key, {
                    account: res.account, contacts: res.contacts,
                    sources: res.account.sources ?? [], persisted: true,
                });
            }
        } catch (err) {
            setError(toUserMessage(err, 'Could not open that account.'));
        } finally { setLoadingDetail(false); }
    };

    const removeAccount = async (id) => {
        try {
            await abmService.removeAccount(workspaceId, id);
            setAccounts((prev) => (prev ?? []).filter((a) => a.id !== id));
            const key = `saved:${id}`;
            setResultByKey((prev) => { const n = { ...prev }; delete n[key]; return n; });
            if (selectedKey === key) setSelectedKey(null);
        } catch (err) {
            setError(toUserMessage(err, 'Could not remove the account.'));
        }
    };

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
            if (!ids.length) { setNotice('Those contacts are already in Audiences.'); return; }
            setListProspectIds(ids);
            setAddListOpen(true);
        } catch (err) {
            setError(toUserMessage(err, 'Could not prepare the contacts for a list.'));
        } finally { setAddingList(false); }
    };

    const downloadAllReport = () => openReport(buildBatchReportHtml(inMemoryResults));

    // Run companies sequentially, paced under the rate limit, cancellable.
    const runCompanies = async (companies, autoPersist) => {
        if (pending || !companies.length) return;
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
                    // Persisted results graduate into the saved rail; unpersisted
                    // ones stay reachable under their run key.
                    const key = result.persisted && result.account?.id ? `saved:${result.account.id}` : `run:${item.id}`;
                    remember(key, result);
                    setSelectedKey(key);
                    if (result.persisted) await loadAccounts();
                } else {
                    setTranscript((t) => t.map((e) => (e.id === item.id ? { ...e, status: 'error', error: res.error } : e)));
                }
            } catch (err) {
                setTranscript((t) => t.map((e) => (e.id === item.id ? { ...e, status: 'error', error: err.message } : e)));
            }
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

    const saveAllQualifying = async () => {
        const seen = new Set();
        const picks = [];
        for (const result of inMemoryResults) {
            for (const c of result.contacts ?? []) {
                if ((c.fitScore ?? 0) < FIT_THRESHOLD) continue;
                if (crmMatch(c, crmIndex) === 'email') continue;
                const k = contactMatchKey(c);
                if (seen.has(k)) continue;
                seen.add(k);
                picks.push(toProspectInsert(c, result.account));
            }
        }
        if (!picks.length) { setNotice(`No contacts at or above ${FIT_THRESHOLD} fit to save.`); return; }
        setSavingBulk(true); setError(''); setNotice('');
        try {
            const created = await prospectsService.save(workspaceId, picks);
            setNotice(created.length
                ? `Saved ${created.length} contact${created.length === 1 ? '' : 's'} (fit ≥ ${FIT_THRESHOLD}) to Audiences.`
                : 'Those contacts are already in Audiences.');
        } catch (err) {
            setError(toUserMessage(err, 'Could not bulk-save those contacts.'));
        } finally { setSavingBulk(false); }
    };

    /* Bulk research is a main way in, not an aside - it sat in the rail briefly,
       which hid one of the two ways to start work on this screen. It is a
       collapsible strip on the canvas: visible, but subordinate to the rail. */
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
                    {inMemoryResults.length > 0 && (
                        <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={downloadAllReport}>
                                <Download size={14} strokeWidth={1.8} /> Report ({inMemoryResults.length})
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

    const selectedResult = selectedKey ? resultByKey[selectedKey] : null;
    const selectedQueueEntry = selectedKey?.startsWith('run:')
        ? transcript.find((e) => `run:${e.id}` === selectedKey)
        : null;

    return (
        <ModuleScreen
            className="abm-research-module module-kepler"
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
                    {accounts !== null && <span><strong>{accounts.length}</strong> saved</span>}
                    {researchedCount > 0 && <span>{researchedCount} researched this run</span>}
                    {pending && remaining > 0 && <span className="text-accent">{remaining} in progress</span>}
                    {failedCount > 0 && !pending && <span className="text-error">{failedCount} failed</span>}
                </>
            }
        >
            {bulkSection}

            <div className="abm__canvas">
                <nav className="abm__rail" aria-label="Accounts">
                    <div className="abm__rail-scroll">
                        {queue.length > 0 && (
                            <>
                                <p className="abm__rail-label">This run</p>
                                {queue.map((e) => {
                                    const key = `run:${e.id}`;
                                    const isDoneUnsaved = e.status === 'done' && e.result;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`abm__rail-row ${selectedKey === key ? 'is-active' : ''} abm__rail-row--${e.status}`}
                                            onClick={() => { if (isDoneUnsaved) { remember(key, e.result); setSelectedKey(key); } }}
                                            aria-current={selectedKey === key ? 'true' : undefined}
                                        >
                                            <span className="abm__rail-name">{e.query}</span>
                                            <span className="abm__rail-sub">
                                                {e.status === 'error'
                                                    ? e.error
                                                    : isDoneUnsaved
                                                        ? 'Researched, not saved'
                                                        : QUEUE_NOTE[e.status]}
                                            </span>
                                        </button>
                                    );
                                })}
                            </>
                        )}

                        <p className="abm__rail-label">Saved accounts</p>
                        {accounts === null ? (
                            <p className="abm__rail-note">Loading accounts…</p>
                        ) : accounts.length === 0 ? (
                            <p className="abm__rail-note">
                                No accounts yet. Name a company below to research one.
                            </p>
                        ) : (
                            accounts.map((a) => {
                                const key = `saved:${a.id}`;
                                return (
                                    <div key={key} className={`abm__rail-row ${selectedKey === key ? 'is-active' : ''}`}>
                                        <button
                                            type="button"
                                            className="abm__rail-btn"
                                            onClick={() => openSaved(a)}
                                            aria-current={selectedKey === key ? 'true' : undefined}
                                        >
                                            <span className="abm__rail-name">{a.companyName || 'Unknown company'}</span>
                                            <span className="abm__rail-sub">{accountSub(a) || 'Open to view contacts'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost abm__rail-del"
                                            onClick={() => removeAccount(a.id)}
                                            title={`Remove ${a.companyName || 'account'}`}
                                            aria-label={`Remove ${a.companyName || 'account'}`}
                                        >
                                            <Trash2 size={14} strokeWidth={1.8} />
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* The composer lives at the foot of the rail: a new company
                        enters the LIST, so that is where you add one. */}
                    <div className="abm-composer abm__rail-composer">
                        <input
                            className="intel-input abm-composer__input"
                            type="text"
                            placeholder="Company name or website"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSingle(); } }}
                            disabled={pending}
                            aria-label="Company name or website"
                        />
                        <button type="button" className="btn btn-primary" onClick={runSingle} disabled={pending || !text.trim()}>
                            <Telescope size={16} strokeWidth={1.8} /> Research
                        </button>
                    </div>
                </nav>

                <div className="abm__pane">
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

                    {loadingDetail ? (
                        <EmptyState loading message="Opening that account…" />
                    ) : selectedResult ? (
                        <AbmResultCard
                            workspaceId={workspaceId}
                            result={selectedResult}
                            readOnly={!!selectedResult.persisted}
                            crmIndex={crmIndex}
                            entryId={selectedKey}
                            selected={bulk.selected}
                            onToggleContact={bulk.toggle}
                            onToggleCardAll={(keys, add) => (add ? bulk.addMany(keys) : bulk.removeMany(keys))}
                            onDeselect={bulk.removeMany}
                            onFeedback={() => setFeedbackVersion((v) => v + 1)}
                        />
                    ) : selectedQueueEntry ? (
                        /* A queue row that has no card yet says which of the four
                           things it is, rather than borrowing the empty pane. */
                        <Panel variant="quiet">
                            <p className="brand-intel-module__source-label">
                                {selectedQueueEntry.status === 'error'
                                    ? selectedQueueEntry.error
                                    : QUEUE_NOTE[selectedQueueEntry.status]}
                            </p>
                        </Panel>
                    ) : (
                        /* New with master-detail: nothing is picked. This is not "no
                           research exists" - the rail says whether any does. */
                        <EmptyState
                            message={accounts && accounts.length
                                ? 'Pick an account from the list to see its brief, grounding and contacts.'
                                : 'No research yet. Name a company in the box on the left, or open Bulk research to upload a list.'}
                        />
                    )}
                </div>
            </div>

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
