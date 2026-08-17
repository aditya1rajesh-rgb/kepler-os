import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Trash2, UserSearch } from '../../lib/icons';
import ModuleScreen from '../../components/layout/ModuleScreen';
import EmptyState from '../../components/ui/EmptyState';
import ListDetail from '../../components/outreach/ListDetail';
import FindProspectsDrawer from '../../components/outreach/FindProspectsDrawer';
import { prospectListsService } from '../../services/prospectListsService';
import { prospectsService } from '../../services/prospectsService';
import { workspacePath } from '../../constants/routes';
import { toUserMessage } from '../../lib/errors';
import '../../styles/module-kepler.css';
import './Outreach.css';
import './OutreachAudiences.css';

/**
 * Outreach / Audiences — ONE CANVAS.
 *
 * This replaced a three-tab strip (Lists · Saved research · Find prospects) that
 * held seven panels and four objects, two of which were rendered twice:
 *
 *   - Prospects appeared under Saved research AND under Find prospects. Both read
 *     the same service and rendered the same row, but selection state was
 *     per-panel, so picking six people in one and switching showed none selected.
 *   - Lists appeared as its own tab AND as a segment of Saved research, with two
 *     different action sets and two different open behaviours for one object.
 *
 * Now each object exists exactly once with one action set. A Lists rail on the
 * left selects what the People table on the right shows; Find prospects is a
 * drawer over it, because filling an audience is a thing you do TO this screen
 * rather than a sibling of it. Saved accounts left for Research, which is where
 * research is produced.
 *
 * The rail reuses the segmented control's own idiom at a different scale: a
 * recessed track whose selected row lifts to a raised surface. Selection looks
 * the same whether it is three tabs or five lists, so nothing new had to be
 * invented for "which audience am I looking at".
 */
const ALL = 'all';

const OutreachAudiences = ({ workspaceId }) => {
    // ?listId= keeps a specific audience shareable and back-navigable, as it was
    // when Lists was its own screen. ?view= is honoured for old deep links.
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const requestedList = searchParams.get('listId');
    const selected = requestedList || ALL;

    const [lists, setLists] = useState([]);
    const [peopleCount, setPeopleCount] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [drawerOpen, setDrawerOpen] = useState(searchParams.get('view') === 'find');
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        // No synchronous setState here: `loading` starts true, and a REFRESH keeps
        // the current rail on screen while it refetches rather than flashing a
        // spinner over data that is about to be the same.
        Promise.all([
            prospectListsService.listLists(workspaceId),
            prospectsService.list(workspaceId).catch(() => []),
        ])
            .then(([ls, people]) => {
                if (cancelled) return;
                setLists(ls);
                setPeopleCount(people.length);
                setError('');
            })
            .catch((err) => { if (!cancelled) setError(toUserMessage(err, 'Could not load your audiences.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [workspaceId, reloadKey]);

    const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

    const select = (id) => {
        if (id === ALL) setSearchParams({});
        else setSearchParams({ listId: id });
    };

    const deleteList = async (id) => {
        try {
            await prospectListsService.deleteList(workspaceId, id);
            setLists((prev) => prev.filter((l) => l.id !== id));
            if (selected === id) setSearchParams({});
        } catch (err) { setError(toUserMessage(err, 'Could not delete the list.')); }
    };

    const activeList = lists.find((l) => l.id === selected) ?? null;

    return (
        <ModuleScreen
            moduleKey="outreach-audiences"
            className="module-kepler audiences"
            banner={error ? <p className="brand-intel-module__error" role="alert">{error}</p> : null}
            status={
                <>
                    {peopleCount !== null && (
                        <span><strong>{peopleCount}</strong> {peopleCount === 1 ? 'person' : 'people'}</span>
                    )}
                    <span><strong>{lists.length}</strong> list{lists.length === 1 ? '' : 's'}</span>
                </>
            }
            primary={
                <button type="button" className="btn btn-primary" onClick={() => setDrawerOpen(true)}>
                    <UserSearch size={16} strokeWidth={1.8} /> Find prospects
                </button>
            }
        >
            <div className="audiences__canvas">
                <nav className="audiences__rail" aria-label="Audiences">
                    <p className="audiences__rail-label">Audiences</p>

                    <button
                        type="button"
                        className={`audiences__rail-row ${selected === ALL ? 'is-active' : ''}`}
                        aria-current={selected === ALL ? 'true' : undefined}
                        onClick={() => select(ALL)}
                    >
                        <span className="audiences__rail-main">
                            {/* No icon here: the list rows below have none, and an
                                icon forces this into a flex container, which
                                disables the ellipsis every other row relies on. */}
                            <span className="audiences__rail-name">All people</span>
                            <span className="audiences__rail-sub">
                                {peopleCount === null ? '—' : `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`}
                            </span>
                        </span>
                    </button>

                    {loading && lists.length === 0 ? (
                        <p className="audiences__rail-note">Loading lists…</p>
                    ) : lists.length === 0 ? (
                        /* Not an error and not "nothing here": there ARE people, they
                           are just not grouped yet. */
                        <p className="audiences__rail-note">
                            No lists yet. Select people and “Add to list” to make one.
                        </p>
                    ) : (
                        lists.map((l) => (
                            <div key={l.id} className={`audiences__rail-row ${selected === l.id ? 'is-active' : ''}`}>
                                <button
                                    type="button"
                                    className="audiences__rail-main audiences__rail-btn"
                                    aria-current={selected === l.id ? 'true' : undefined}
                                    onClick={() => select(l.id)}
                                >
                                    <span className="audiences__rail-name">{l.name}</span>
                                    <span className="audiences__rail-sub">
                                        {l.memberCount} {l.memberCount === 1 ? 'person' : 'people'}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost audiences__rail-del"
                                    onClick={() => deleteList(l.id)}
                                    title={`Delete ${l.name}`}
                                    aria-label={`Delete ${l.name}`}
                                >
                                    <Trash2 size={14} strokeWidth={1.8} />
                                </button>
                            </div>
                        ))
                    )}
                </nav>

                <div className="audiences__pane">
                    {loading && peopleCount === null ? (
                        <EmptyState loading message="Loading your audiences…" />
                    ) : (
                        /* Keyed on the selection so switching audiences remounts the
                           table: a fresh fetch AND a cleared selection, without
                           clearing state inside an effect. */
                        <ListDetail
                            key={selected}
                            workspaceId={workspaceId}
                            listId={selected === ALL ? null : selected}
                            listName={selected === ALL ? 'All people' : (activeList?.name || 'List')}
                            onChanged={refresh}
                            onBuildSequence={selected === ALL ? null : () => navigate(
                                `${workspacePath(workspaceId, 'outreach', 'sequences')}?list=${selected}`,
                            )}
                        />
                    )}
                </div>
            </div>

            <FindProspectsDrawer
                workspaceId={workspaceId}
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onSaved={refresh}
            />
        </ModuleScreen>
    );
};

export default OutreachAudiences;
