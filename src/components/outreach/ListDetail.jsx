import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Download, ExternalLink, Trash2, Send, Sparkles } from '../../lib/icons';
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
import './ProspectRow.css';
import './ListDetail.css';

// The PEOPLE TABLE on the Audiences canvas: member table with per-row + bulk
// select, CSV export (before/after enrichment), remove, Build-sequence hand-off,
// and Apollo email/phone enrichment (emails / phones / both) with a credit
// estimate, batched ≤10 per call with progress + cancel. Enrichment needs the
// connector-proxy `enrich` action deployed + migration 029; until then it errors
// gracefully.
//
// Two modes, because the Lists rail selects between them:
//   listId set  -> the members of that list; remove takes them out of the list.
//   listId null -> ALL people in the workspace; remove deletes the prospect.
// The all-people mode replaces the "Prospects" segment that used to render the
// same people a second time with its own separate selection state. It therefore
// also carries push-to-Zoho, which was that panel's action and would otherwise
// have been lost with it.

const fullName = (m) => [m.firstName, m.lastName].filter(Boolean).join(' ') || '—';
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const EMAIL_CREDITS = 1;
const PHONE_CREDITS = 8;

// Verification status from the free gate (format/disposable/role/MX). "ok" = passed
// the free checks, not mailbox-confirmed (that's the paid verifier). Tooltip says so.
const STATUS_BADGE = {
    ok: { label: 'valid', cls: 'ld-badge--ok', title: 'Passed format + domain (MX) checks. Not mailbox-confirmed until a paid verifier is added.' },
    role: { label: 'role', cls: 'ld-badge--warn', title: 'Role-based address (info@, sales@…) — often not a person.' },
    no_mx: { label: 'no MX', cls: 'ld-badge--warn', title: 'Domain has no mail server — likely undeliverable.' },
    disposable: { label: 'disposable', cls: 'ld-badge--bad', title: 'Disposable/temporary email domain.' },
    invalid: { label: 'invalid', cls: 'ld-badge--bad', title: 'Malformed address.' },
};

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

const ListDetail = ({ workspaceId, listId, listName = 'List', onBack, onBuildSequence, onChanged }) => {
    const allPeople = !listId;
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [apolloConnected, setApolloConnected] = useState(false);
    const [zohoConnected, setZohoConnected] = useState(false);
    const [pushing, setPushing] = useState(false);
    const [enrichOpen, setEnrichOpen] = useState(false);
    const [enrichFields, setEnrichFields] = useState('both'); // 'email' | 'phone' | 'both'
    const [enriching, setEnriching] = useState(false);
    const [progress, setProgress] = useState(null); // { done, total }
    const [statusById, setStatusById] = useState({}); // memberId -> email verification status
    const cancelRef = useRef(false);
    const bulk = useBulkSelect();

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        setLoading(true); setError('');
        // Selection is NOT cleared here: the canvas keys this component on the
        // selected list, so switching audiences remounts it and stale picks cannot
        // survive the switch. One less setState in an effect.
        Promise.all([
            listId
                ? prospectListsService.listMembers(workspaceId, listId)
                : prospectsService.list(workspaceId),
            integrationService.getStatus(workspaceId, 'apollo').catch(() => null),
            integrationService.getStatus(workspaceId, 'zoho').catch(() => null),
        ])
            .then(([rows, apollo, zoho]) => {
                if (cancelled) return;
                setMembers(rows);
                setApolloConnected(apollo?.status === 'connected');
                setZohoConnected(zoho?.status === 'connected');
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(toUserMessage(err, listId ? 'Could not load this list.' : 'Could not load your people.'));
                }
            })
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

    /* Removal means different things in the two modes, and the wrong one is
       destructive: taking someone out of a list must not delete them from the
       workspace. */
    const removeMember = async (prospectId) => {
        try {
            if (allPeople) await prospectsService.remove(workspaceId, prospectId);
            else await prospectListsService.removeMember(workspaceId, listId, prospectId);
            setMembers((prev) => prev.filter((m) => m.id !== prospectId));
            bulk.removeMany([prospectId]);
            onChanged?.();
        } catch (err) {
            setError(toUserMessage(err, allPeople ? 'Could not remove that person.' : 'Could not remove that contact.'));
        }
    };

    // Carried over from the retired Prospects segment: pushed rows lose their
    // checkbox, so a second push cannot double-create the same lead.
    const pushable = members.filter((m) => bulk.selected.has(m.id) && m.status !== 'pushed');

    const pushToZoho = async () => {
        if (!pushable.length) { setError('Select at least one person who is not already in Zoho.'); return; }
        setPushing(true); setError(''); setMsg('');
        try {
            await integrationService.pushToCrm(workspaceId, 'zoho', {
                prospects: pushable.map((p) => ({
                    firstName: p.firstName, lastName: p.lastName, company: p.company, email: p.email, title: p.title,
                })),
            });
            await prospectsService.markPushed(workspaceId, pushable.map((p) => p.id), 'zoho');
            const ids = new Set(pushable.map((p) => p.id));
            setMembers((prev) => prev.map((m) => (ids.has(m.id) ? { ...m, status: 'pushed', pushedTo: 'zoho' } : m)));
            bulk.clear();
            setMsg(`Pushed ${pushable.length} lead${pushable.length === 1 ? '' : 's'} into Zoho.`);
        } catch (err) {
            setError(toUserMessage(err, 'Could not push to Zoho.'));
        } finally { setPushing(false); }
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
        const statusMap = {};
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
                    if (mm.emailStatus) statusMap[m.id] = mm.emailStatus;
                    if (email || phone) { updates.push({ id: m.id, email: email || undefined, phone: phone || undefined }); applied.set(m.id, { email, phone }); revealed += 1; }
                });
                if (Object.keys(statusMap).length) setStatusById((prev) => ({ ...prev, ...statusMap }));
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
                    {/* No Back link on the canvas: the Lists rail is always visible
                        and is what moves between audiences. onBack survives for any
                        caller that still renders this standalone. */}
                    {onBack && (
                        <button type="button" className="btn btn-ghost" onClick={onBack}>
                            <ArrowLeft size={15} strokeWidth={1.8} /> Lists
                        </button>
                    )}
                    <div className="list-detail__title">
                        <h2 className="font-section">{listName}</h2>
                        <span>
                            {members.length} {allPeople
                                ? `person${members.length === 1 ? '' : 's'}`.replace('persons', 'people')
                                : `contact${members.length === 1 ? '' : 's'}`}
                        </span>
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
                    <p className="list-detail__hint">Connect Apollo in Integrations to reveal emails and phones. Export works without it, before and after.</p>
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
                    <EmptyState loading message={allPeople ? 'Loading your people…' : 'Loading list…'} />
                ) : members.length === 0 ? (
                    /* Two different absences: nobody in the workspace at all, versus
                       an audience nobody has been added to yet. */
                    <EmptyState message={allPeople
                        ? 'No people yet. Use Find prospects, or save contacts from Research.'
                        : 'This list has no contacts yet. Add people from All people, or save contacts from Research.'} />
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
                            {allPeople && zohoConnected && (
                                <button type="button" className="btn btn-primary" onClick={pushToZoho} disabled={pushing || pushable.length === 0}>
                                    {pushing ? 'Pushing…' : `Push ${pushable.length || ''} to Zoho`}
                                </button>
                            )}
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
                                                <input
                                                    type="checkbox"
                                                    checked={bulk.selected.has(m.id)}
                                                    disabled={m.status === 'pushed'}
                                                    onChange={() => bulk.toggle(m.id)}
                                                    aria-label={`Select ${fullName(m)}`}
                                                />
                                            </td>
                                            <td className="list-table__name">{fullName(m)}</td>
                                            <td>{m.title || <span className="list-table__muted">—</span>}</td>
                                            <td>{m.company || <span className="list-table__muted">—</span>}</td>
                                            <td>
                                                {m.email || <span className="list-table__muted">—</span>}
                                                {STATUS_BADGE[statusById[m.id]] && (
                                                    <span className={`ld-badge ${STATUS_BADGE[statusById[m.id]].cls}`} title={STATUS_BADGE[statusById[m.id]].title}>
                                                        {STATUS_BADGE[statusById[m.id]].label}
                                                    </span>
                                                )}
                                            </td>
                                            <td>{m.phone || <span className="list-table__muted">—</span>}</td>
                                            <td>
                                                {m.linkedinUrl ? (
                                                    <a className="btn btn-ghost" href={m.linkedinUrl} target="_blank" rel="noreferrer" title="LinkedIn">
                                                        <ExternalLink size={15} strokeWidth={1.8} />
                                                    </a>
                                                ) : <span className="list-table__muted">—</span>}
                                            </td>
                                            <td>
                                                {m.status === 'pushed' ? (
                                                    <span className="prospect-row__saved" title="Already a lead in Zoho">
                                                        <Check size={14} strokeWidth={2.2} /> In Zoho
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost"
                                                        onClick={() => removeMember(m.id)}
                                                        title={allPeople ? 'Remove person' : 'Remove from list'}
                                                    >
                                                        <Trash2 size={15} strokeWidth={1.8} />
                                                    </button>
                                                )}
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
