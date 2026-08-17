import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { prospectListsService } from '../../services/prospectListsService';
import { toUserMessage } from '../../lib/errors';

// Add N selected prospects to a prospect list — create a new one or pick an
// existing one. Shared by Audiences (Find prospects) + Research (both have a
// multi-select). Lists
// are the reusable audience a sequence targets. onAdded(count, listName) lets
// the caller show a notice + clear its selection.
const AddToListModal = ({ workspaceId, prospectIds = [], isOpen, onClose, onAdded }) => {
    const [lists, setLists] = useState([]);
    const [mode, setMode] = useState('existing'); // 'existing' | 'new'
    const [listId, setListId] = useState('');
    const [newName, setNewName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen || !workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const rows = await prospectListsService.listLists(workspaceId);
                if (cancelled) return;
                setLists(rows);
                // Default to creating a new list when none exist yet.
                setMode(rows.length ? 'existing' : 'new');
                setListId(rows[0]?.id ?? '');
                setError('');
            } catch (err) {
                if (!cancelled) setError(toUserMessage(err, 'Could not load lists.'));
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen, workspaceId]);

    const confirm = async () => {
        if (!prospectIds.length) { setError('Select at least one prospect first.'); return; }
        setBusy(true);
        setError('');
        try {
            let targetId = listId;
            let targetName = lists.find((l) => l.id === listId)?.name ?? '';
            if (mode === 'new') {
                const created = await prospectListsService.createList(workspaceId, newName);
                targetId = created.id;
                targetName = created.name;
            }
            if (!targetId) { setError('Pick or name a list.'); setBusy(false); return; }
            const added = await prospectListsService.addMembers(workspaceId, targetId, prospectIds);
            onAdded?.(added.length, targetName, prospectIds.length);
            setNewName('');
            onClose?.();
        } catch (err) {
            setError(toUserMessage(err, 'Could not add to the list.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { if (!busy) onClose?.(); }}
            title={`Add ${prospectIds.length || ''} to a list`.replace('  ', ' ')}
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
                        {busy ? 'Adding…' : 'Add to list'}
                    </button>
                </>
            }
        >
            {lists.length > 0 && (
                <div className="platform-pills" style={{ marginBottom: '0.75rem' }}>
                    <button type="button" className={`btn btn-secondary platform-pill ${mode === 'existing' ? 'active' : ''}`} onClick={() => setMode('existing')}>Existing list</button>
                    <button type="button" className={`btn btn-secondary platform-pill ${mode === 'new' ? 'active' : ''}`} onClick={() => setMode('new')}>New list</button>
                </div>
            )}
            {mode === 'existing' && lists.length > 0 ? (
                <div className="input-group">
                    <label className="label-text">List</label>
                    <select className="intel-input" value={listId} onChange={(e) => setListId(e.target.value)}>
                        {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.memberCount})</option>)}
                    </select>
                </div>
            ) : (
                <div className="input-group">
                    <label className="label-text">New list name</label>
                    <input className="intel-input" type="text" placeholder="e.g. Q3 enterprise targets" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                </div>
            )}
            {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
        </Modal>
    );
};

export default AddToListModal;
