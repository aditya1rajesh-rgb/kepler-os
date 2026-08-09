import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Trash2, ArrowUpRight } from '../../lib/icons';
import ModuleScreen from '../../components/layout/ModuleScreen';
import EmptyState from '../../components/ui/EmptyState';
import ListDetail from '../../components/outreach/ListDetail';
import { prospectListsService } from '../../services/prospectListsService';
import { workspacePath } from '../../constants/routes';
import { toUserMessage } from '../../lib/errors';
import '../../styles/module-kepler.css';

// Lists sub-tab: browse named audiences, then open one (?listId=) into the
// Apollo-style detail table (view / export / enrich later). Drill-in is a query
// param so it's shareable and the browser back button closes the detail.
const OutreachLists = ({ workspaceId }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const listId = searchParams.get('listId');
    const [lists, setLists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const reload = () => {
        setLoading(true); setError('');
        prospectListsService.listLists(workspaceId)
            .then(setLists)
            .catch((err) => setError(toUserMessage(err, 'Could not load your lists.')))
            .finally(() => setLoading(false));
    };
    useEffect(() => { if (workspaceId) reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId]);

    const openList = (id) => setSearchParams({ listId: id });
    const closeList = () => setSearchParams({});

    const deleteList = async (id) => {
        try {
            await prospectListsService.deleteList(workspaceId, id);
            setLists((prev) => prev.filter((l) => l.id !== id));
        } catch (err) { setError(toUserMessage(err, 'Could not delete the list.')); }
    };

    if (listId) {
        const meta = lists.find((l) => l.id === listId);
        return (
            <ListDetail
                workspaceId={workspaceId}
                listId={listId}
                listName={meta?.name || 'List'}
                onBack={closeList}
                onBuildSequence={() => navigate(`${workspacePath(workspaceId, 'outreach', 'sequences')}?list=${listId}`)}
            />
        );
    }

    return (
        <ModuleScreen
            moduleKey="outreach-lists"
            className="module-kepler"
            banner={error ? <p className="brand-intel-module__error" role="alert">{error}</p> : null}
            status={lists.length ? (
                <span><strong>{lists.length}</strong> list{lists.length === 1 ? '' : 's'}</span>
            ) : null}
        >
            <>
                {loading ? (
                    <EmptyState loading message="Loading lists…" />
                ) : lists.length === 0 ? (
                    <EmptyState message="No lists yet. Save prospects in ABM Research or Prospecting, then “Add to list”." />
                ) : (
                    <ul className="prospect-list">
                        {lists.map((l) => (
                            <li
                                key={l.id}
                                className="prospect-row prospect-row--clickable"
                                role="button"
                                tabIndex={0}
                                onClick={() => openList(l.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter') openList(l.id); }}
                            >
                                <div className="prospect-row__main">
                                    <span className="prospect-row__name">{l.name}</span>
                                    <span className="prospect-row__sub">{l.memberCount} prospect{l.memberCount === 1 ? '' : 's'}</span>
                                </div>
                                <div className="prospect-row__actions">
                                    <button type="button" className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); openList(l.id); }}>
                                        Open <ArrowUpRight size={14} strokeWidth={1.8} />
                                    </button>
                                    <button type="button" className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); deleteList(l.id); }} title="Delete list">
                                        <Trash2 size={15} strokeWidth={1.8} />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </>
        </ModuleScreen>
    );
};

export default OutreachLists;
