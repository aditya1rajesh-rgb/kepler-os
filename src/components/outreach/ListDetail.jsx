import { useEffect, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, Trash2, Send } from '../../lib/icons';
import Panel from '../ui/Panel';
import EmptyState from '../ui/EmptyState';
import SelectionBar from '../ui/SelectionBar';
import { prospectListsService } from '../../services/prospectListsService';
import { downloadCsv } from '../../lib/exportCsv';
import { useBulkSelect } from '../../hooks/useBulkSelect';
import { toUserMessage } from '../../lib/errors';
import './ListDetail.css';

// The Apollo-style detail for one list: a table of its members with per-row +
// bulk selection, CSV export (selected or all — works before and after
// enrichment), remove-from-list, and a "Build sequence" hand-off. Email/phone
// enrichment (Apollo) lands with migration 029 + the connector-proxy update; the
// Phone column is present now and simply fills in once enrichment ships.

const fullName = (m) => [m.firstName, m.lastName].filter(Boolean).join(' ') || '—';

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
    const bulk = useBulkSelect();

    useEffect(() => {
        if (!workspaceId || !listId) return;
        let cancelled = false;
        setLoading(true); setError('');
        prospectListsService.listMembers(workspaceId, listId)
            .then((rows) => { if (!cancelled) setMembers(rows); })
            .catch((err) => { if (!cancelled) setError(toUserMessage(err, 'Could not load this list.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [workspaceId, listId]);

    const ids = members.map((m) => m.id);
    const allSelected = ids.length > 0 && ids.every((id) => bulk.selected.has(id));

    const exportRows = () => {
        const rows = bulk.size ? members.filter((m) => bulk.selected.has(m.id)) : members;
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

                <p className="list-detail__hint">
                    Email &amp; phone enrichment (Apollo) arrives with the next update — export already works, before and after.
                </p>

                {error && <p className="brand-intel-module__error" role="alert">{error}</p>}

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
        </div>
    );
};

export default ListDetail;
