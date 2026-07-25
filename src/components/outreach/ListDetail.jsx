import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, Trash2, Send, Sparkles } from '../../lib/icons';
import Panel from '../ui/Panel';
import Modal from '../ui/Modal';
import EmptyState from '../ui/EmptyState';
import SelectionBar from '../ui/SelectionBar';
import { prospectListsService } from '../../services/prospectListsService';
import { prospectsService } from '../../services/prospectsService';
import { integrationService } from '../../services/integrationService';
import { downloadCsv } from '../../lib/exportCsv';
import { useBulkSelect } from '../../hooks/useBulkSelect';
import { toUserMessage } from '../../lib/errors';
import './ListDetail.css';

// Apollo-style detail for one list: member table with per-row + bulk select, CSV
// export (before/after enrichment), remove-from-list, Build-sequence hand-off, and
// Apollo email/phone enrichment (emails / phones / both) with a credit estimate,
// batched ≤10 per call with progress + cancel. Enrichment needs the connector-proxy
// `enrich` action deployed + migration 029; until then it errors gracefully.

const fullName = (m) => [m.firstName, m.lastName].filter(Boolean).join(' ') || '—';
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const EMAIL_CREDITS = 1;
const PHONE_CREDITS = 8;

const EXPORT_COLUMNS = [
    { key: 'firstName', label: 'First name' },
    { key: 'lastName', label: 'Last name' },
    { key: 'title', label: 'Title' },
    { key: 'company', label: 'Company' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'location', label: 'Location' },
    { key: 'linkedinUrl', label: 'LinkedIn' },
    { key: 'status', label: 'Status' },
];

const ListDetail = ({ workspaceId, listId, listName = 'List', onBack, onBuildSequence }) => {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [apolloConnected, setApolloConnected] = useState(false);
    const [enrichOpen, setEnrichOpen] = useState(false);
    const [enrichFields, setEnrichFields] = useState('both'); // 'email' | 'phone' | 'both'
    const [enriching, setEnriching] = useState(false);
    const [progress, setProgress] = useState(null); // { done, total }
    const cancelRef = useRef(false);
    const bulk = useBulkSelect();

    useEffect(() => {
        if (!workspaceId || !listId) return undefined;
        let cancelled = false;
        setLoading(true); setError('');
        Promise.all([
            prospectListsService.listMembers(workspaceId, listId),
            integrationService.getStatus(workspaceId, 'apollo').catch(() => null),
        ])
            .then(([rows, apollo]) => {
                if (cancelled) return;
                setMembers(rows);
                setApolloConnected(apollo?.status === 'connected');
            })
            .catch((err) => { if (!cancelled) setError(toUserMessage(err, 'Could not load this list.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [workspaceId, listId]);

    const ids = members.map((m) => m.id);
    const allSelected = ids.length > 0 && ids.every((id) => bulk.selected.has(id));
    const targets = () => (bulk.size ? members.filter((m) => bulk.selected.has(m.id)) : members);
    const targetCount = bulk.size || members.length;
    const wantEmail = enrichFields !== 'phone';
    const wantPhone = enrichFields !== 'email';
    const estCredits = targetCount * ((wantEmail ? EMAIL_CREDITS : 0) + (wantPhone ? PHONE_CREDITS : 0));

    const exportRows = () => {
        const rows = targets();
        const name = (listName || 'list').replace(/[^\w-]+/g, '-').toLowerCase();
        downloadCsv(name, rows, EXPORT_COLUMNS);
    };

    const removeMember = async (prospectId) => {
        try {
            await prospectListsService.removeMember(workspaceId, listId, prospectId);
            setMembers((prev) => prev.filter((m) => m.id !== prospectId));
            bulk.removeMany([prospectId]);
        } catch (err) { setError(toUserMessage(err, 'Could not remove that contact.')); }
    };

    const runEnrich = async () => {
        const list = targets();
        if (!list.length) { setEnrichOpen(false); return; }
        setEnrichOpen(false); setEnriching(true); setError(''); setMsg('');
        cancelRef.current = false;
        setProgress({ done: 0, total: list.length });
        const fields = { email: wantEmail, phone: wantPhone };
        const batches = chunk(list, 10);
        const applied = new Map();
        let done = 0;
        let revealed = 0;
        try {
            for (let b = 0; b < batches.length; b += 1) {
                if (cancelRef.current) break;
                const batch = batches[b];
                const contacts = batch.map((m) => ({
                    externalId: m.externalId, firstName: m.firstName, lastName: m.lastName,
                    company: m.company, linkedinUrl: m.linkedinUrl, email: m.email,
                }));
                const res = await integrationService.enrichContacts(workspaceId, 'apollo', { contacts, fields });
                const matches = res?.result?.matches ?? [];
                const updates = [];
                batch.forEach((m, i) => {
                    const mm = matches[i] || {};
                    const email = fields.email && mm.email ? mm.email : '';
                    const phone = fields.phone && mm.phone ? mm.phone : '';
                    if (email || phone) { updates.push({ id: m.id, email: email || undefined, phone: phone || undefined }); applied.set(m.id, { email, phone }); revealed += 1; }
                });
                if (updates.length) await prospectsService.updateEnrichment(workspaceId, updates);
                done += batch.length;
                setProgress({ done, total: list.length });
                if (b < batches.length - 1 && !cancelRef.current) await new Promise((r) => setTimeout(r, 400));
            }
            setMembers((prev) => prev.map((m) => (applied.has(m.id)
                ? { ...m, email: applied.get(m.id).email || m.email, phone: applied.get(m.id).phone || m.phone }
                : m)));
            setMsg(`Enriched ${revealed} of ${list.length} contact${list.length === 1 ? '' : 's'}${cancelRef.current ? ' (stopped early)' : ''}.`);
        } catch (err) {
            setError(toUserMessage(err, 'Enrichment failed. If Apollo was just connected/updated, try again shortly.'));
        } finally {
            setEnriching(false); setProgress(null);
        }
    };

    return (
        <div className="module-kepler list-detail">
            <Panel>
                <div className="list-detail__head">
                    <button type="button" className="btn btn-ghost" onClick={onBack}>
                        <ArrowLeft size={15} strokeWidth={1.8} /> Lists
                    </button>
                    <div className="list-detail__title">
                        <h2 className="font-section">{listName}</h2>
                        <span>{members.length} contact{members.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="module-toolbar module-toolbar--inline">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setEnrichOpen(true)}
                            disabled={!members.length || enriching || !apolloConnected}
                            title={apolloConnected ? 'Reveal emails/phones via Apollo' : 'Connect Apollo in Integrations to enrich'}
                        >
                            <Sparkles size={15} strokeWidth={1.8} /> {enriching ? 'Enriching…' : 'Enrich'}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={exportRows} disabled={!members.length}>
                            <Download size={15} strokeWidth={1.8} /> Export {bulk.size ? `(${bulk.size})` : 'CSV'}
                        </button>
                        {onBuildSequence && (
                            <button type="button" className="btn btn-primary" onClick={onBuildSequence} disabled={!members.length}>
                                <Send size={15} strokeWidth={1.8} /> Build sequence
                            </button>
                        )}
                    </div>
                </div>

                {!apolloConnected && (
                    <p className="list-detail__hint">Connect Apollo in Integrations to reveal emails &amp; phones. Export works without it, before and after.</p>
                )}
                {enriching && progress && (
                    <p className="brand-intel-module__source-label" role="status">
                        Enriching… {progress.done}/{progress.total}.{' '}
                        <button type="button" className="abm-linkbtn" onClick={() => { cancelRef.current = true; }}>Stop</button>
                    </p>
                )}
                {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                {msg && <p className="brand-intel-module__source-label" role="status">{msg}</p>}

                {loading ? (
                    <EmptyState loading message="Loading list…" />
                ) : members.length === 0 ? (
                    <EmptyState message="This list has no contacts yet. Add prospects from ABM Research or Prospecting." />
                ) : (
                    <>
                        <SelectionBar
                            total={members.length}
                            selectedCount={bulk.size}
                            onSelectAll={() => bulk.selectAll(ids)}
                            onSelectN={(n) => bulk.selectTop(n, ids)}
                            onClear={bulk.clear}
                        >
                            <button type="button" className="btn btn-secondary" onClick={() => setEnrichOpen(true)} disabled={enriching || !apolloConnected}>
                                <Sparkles size={15} strokeWidth={1.8} /> Enrich {bulk.size}
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={exportRows}>
                                <Download size={15} strokeWidth={1.8} /> Export {bulk.size}
                            </button>
                        </SelectionBar>
                        <div className="list-table__scroll">
                            <table className="list-table">
                                <thead>
                                    <tr>
                                        <th className="list-table__check">
                                            <input type="checkbox" checked={allSelected} onChange={(e) => (e.target.checked ? bulk.selectAll(ids) : bulk.clear())} aria-label="Select all" />
                                        </th>
                                        <th>Name</th>
                                        <th>Title</th>
                                        <th>Company</th>
                                        <th>Email</th>
                                        <th>Phone</th>
                                        <th>LinkedIn</th>
                                        <th aria-label="Actions" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {members.map((m) => (
                                        <tr key={m.id}>
                                            <td className="list-table__check">
                                                <input type="checkbox" checked={bulk.selected.has(m.id)} onChange={() => bulk.toggle(m.id)} aria-label={`Select ${fullName(m)}`} />
                                            </td>
                                            <td className="list-table__name">{fullName(m)}</td>
                                            <td>{m.title || <span className="list-table__muted">—</span>}</td>
                                            <td>{m.company || <span className="list-table__muted">—</span>}</td>
                                            <td>{m.email || <span className="list-table__muted">—</span>}</td>
                                            <td>{m.phone || <span className="list-table__muted">—</span>}</td>
                                            <td>
                                                {m.linkedinUrl ? (
                                                    <a className="btn btn-ghost" href={m.linkedinUrl} target="_blank" rel="noreferrer" title="LinkedIn">
                                                        <ExternalLink size={15} strokeWidth={1.8} />
                                                    </a>
                                                ) : <span className="list-table__muted">—</span>}
                                            </td>
                                            <td>
                                                <button type="button" className="btn btn-ghost" onClick={() => removeMember(m.id)} title="Remove from list">
                                                    <Trash2 size={15} strokeWidth={1.8} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Panel>

            <Modal
                isOpen={enrichOpen}
                onClose={() => setEnrichOpen(false)}
                title={`Enrich ${targetCount} contact${targetCount === 1 ? '' : 's'}`}
                footer={(
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setEnrichOpen(false)}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={runEnrich}>Enrich {targetCount} (~{estCredits} credits)</button>
                    </>
                )}
            >
                <p>Reveal contact details via Apollo{bulk.size ? ` for the ${bulk.size} selected` : ' for the whole list'}. Choose what to fetch:</p>
                <div className="platform-pills" style={{ margin: '0.75rem 0' }}>
                    <button type="button" className={`btn btn-secondary platform-pill ${enrichFields === 'email' ? 'active' : ''}`} onClick={() => setEnrichFields('email')}>Emails only</button>
                    <button type="button" className={`btn btn-secondary platform-pill ${enrichFields === 'phone' ? 'active' : ''}`} onClick={() => setEnrichFields('phone')}>Phones only</button>
                    <button type="button" className={`btn btn-secondary platform-pill ${enrichFields === 'both' ? 'active' : ''}`} onClick={() => setEnrichFields('both')}>Both</button>
                </div>
                <p className="list-detail__hint">
                    Estimated ~{estCredits} Apollo credits (emails ≈ {EMAIL_CREDITS}, phones ≈ {PHONE_CREDITS} each). Phone reveal can be delayed on some Apollo plans.
                </p>
            </Modal>
        </div>
    );
};

export default ListDetail;
