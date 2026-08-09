import { useEffect, useMemo, useState } from 'react';
import { UserSearch, Check, Trash2, ExternalLink } from '../../lib/icons';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import ModuleScreen from '../../components/layout/ModuleScreen';
import EmptyState from '../../components/ui/EmptyState';
import SelectionBar from '../../components/ui/SelectionBar';
import { useWorkspaceConfig } from '../../hooks/useWorkspaceConfig';
import { integrationService } from '../../services/integrationService';
import { prospectsService } from '../../services/prospectsService';
import { toUserMessage } from '../../lib/errors';
import AddToListModal from '../../components/outreach/AddToListModal';
import { usageService } from '../../services/usageService';
import '../../styles/module-kepler.css';
import './Prospecting.css';

const splitList = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const fullName = (p) => [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'Unknown';

// Signal filters (cold-outreach: build the list on signals, not title alone).
const SENIORITIES = [
    { value: 'founder', label: 'Founder' },
    { value: 'c_suite', label: 'C-Suite' },
    { value: 'vp', label: 'VP' },
    { value: 'head', label: 'Head' },
    { value: 'director', label: 'Director' },
    { value: 'manager', label: 'Manager' },
];
const COMPANY_SIZES = [
    { value: '1,10', label: '1-10' },
    { value: '11,50', label: '11-50' },
    { value: '51,200', label: '51-200' },
    { value: '201,500', label: '201-500' },
    { value: '501,1000', label: '501-1k' },
    { value: '1001,5000', label: '1k-5k' },
    { value: '5001,10000', label: '5k-10k' },
    { value: '10001,100000', label: '10k+' },
];

const Prospecting = ({ workspaceId }) => {
    const [apolloConnected, setApolloConnected] = useState(null); // null = loading
    const [zohoConnected, setZohoConnected] = useState(false);
    const { personas } = useWorkspaceConfig(workspaceId);
    const [selectedIcps, setSelectedIcps] = useState(() => new Set());
    const [selectedSeniorities, setSelectedSeniorities] = useState(() => new Set());
    const [selectedSizes, setSelectedSizes] = useState(() => new Set());

    const [form, setForm] = useState({ titles: '', keywords: '', location: '' });
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchInfo, setSearchInfo] = useState('');

    const [saved, setSaved] = useState([]);
    const [selected, setSelected] = useState(() => new Set());
    const [pushing, setPushing] = useState(false);
    const [addListOpen, setAddListOpen] = useState(false);

    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    // Connection statuses + saved list on mount (state set only after await).
    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const [apollo, zoho, list] = await Promise.all([
                    integrationService.getStatus(workspaceId, 'apollo'),
                    integrationService.getStatus(workspaceId, 'zoho'),
                    prospectsService.list(workspaceId),
                ]);
                if (cancelled) return;
                setApolloConnected(apollo?.status === 'connected');
                setZohoConnected(zoho?.status === 'connected');
                setSaved(list);
            } catch {
                if (!cancelled) setApolloConnected(false);
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    const savedExternalIds = useMemo(
        () => new Set(saved.map((p) => p.externalId).filter(Boolean)),
        [saved],
    );

    const search = async () => {
        usageService.run(workspaceId, 'prospecting', 'apollo_search');
        // Selected ICPs seed the Apollo filters (titles from persona titles/role,
        // locations from persona geography); typed values are merged in on top.
        const icpPersonas = personas.filter((p) => selectedIcps.has(p.id));
        const icpTitles = icpPersonas.flatMap((p) => (p.titles?.length ? p.titles : (p.role ? [p.role] : [])));
        const titles = Array.from(new Set([...icpTitles, ...splitList(form.titles)].filter(Boolean)));
        // Locations are manual only - persona geography is free-text and rarely
        // matches Apollo's location taxonomy, which would zero out every result.
        const locations = splitList(form.location);
        const keywords = form.keywords.trim();
        if (!titles.length && !locations.length && !keywords) {
            setError('Pick an ICP or enter a title, keyword, or location to search.');
            return;
        }
        setSearching(true);
        setError('');
        setNotice('');
        setSearchInfo('');
        try {
            const res = await integrationService.fetchFromConnector(workspaceId, 'apollo', {
                titles, locations, keywords,
                seniorities: [...selectedSeniorities],
                employeeRanges: [...selectedSizes],
                perPage: 25,
            });
            const people = res?.result?.people ?? [];
            const total = res?.result?.total ?? people.length;
            setResults(people);
            setSearchInfo(people.length
                ? `${people.length} shown${total ? ` of ${total} matches` : ''} · emails need Apollo enrichment (not returned by search).`
                : `No matches (${total} found) - try a broader title or fewer filters.`);
        } catch (err) {
            // Connector edge errors are already curated + safe - show them directly.
            setError(err?.message || 'Apollo search failed.');
        } finally {
            setSearching(false);
        }
    };

    const saveOne = async (p) => {
        setError('');
        try {
            const created = await prospectsService.save(workspaceId, [p]);
            if (created.length) setSaved((prev) => [...created, ...prev]);
        } catch (err) {
            setError(toUserMessage(err, 'Could not save the prospect.'));
        }
    };

    const saveAll = async () => {
        setError('');
        try {
            const created = await prospectsService.save(workspaceId, results);
            if (created.length) {
                setSaved((prev) => [...created, ...prev]);
                setNotice(`Saved ${created.length} new prospect${created.length === 1 ? '' : 's'} to your list.`);
            } else {
                setNotice('Those prospects are already in your list.');
            }
        } catch (err) {
            setError(toUserMessage(err, 'Could not save prospects.'));
        }
    };

    const removeSaved = async (id) => {
        try {
            await prospectsService.remove(workspaceId, id);
            setSaved((prev) => prev.filter((p) => p.id !== id));
            setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
        } catch (err) {
            setError(toUserMessage(err, 'Could not remove the prospect.'));
        }
    };

    const toggleSelect = (id) => setSelected((prev) => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    const toggleIcp = (id) => setSelectedIcps((prev) => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    const toggleSeniority = (v) => setSelectedSeniorities((prev) => {
        const n = new Set(prev);
        if (n.has(v)) n.delete(v); else n.add(v);
        return n;
    });

    const toggleSize = (v) => setSelectedSizes((prev) => {
        const n = new Set(prev);
        if (n.has(v)) n.delete(v); else n.add(v);
        return n;
    });

    const pushToZoho = async () => {
        const chosen = saved.filter((p) => selected.has(p.id) && p.status !== 'pushed');
        if (!chosen.length) { setError('Select at least one un-pushed prospect.'); return; }
        setPushing(true);
        setError('');
        setNotice('');
        try {
            const res = await integrationService.pushToCrm(workspaceId, 'zoho', {
                prospects: chosen.map((p) => ({ firstName: p.firstName, lastName: p.lastName, company: p.company, email: p.email, title: p.title })),
            });
            const ids = chosen.map((p) => p.id);
            await prospectsService.markPushed(workspaceId, ids, 'zoho');
            setSaved((prev) => prev.map((p) => (selected.has(p.id) ? { ...p, status: 'pushed', pushedTo: 'zoho' } : p)));
            setSelected(new Set());
            const n = res?.result?.leadsCreated ?? chosen.length;
            setNotice(`Pushed ${n} lead${n === 1 ? '' : 's'} into Zoho.`);
        } catch (err) {
            setError(err?.message || 'Could not push to Zoho.');
        } finally {
            setPushing(false);
        }
    };

    if (apolloConnected === null) {
        return <div className="prospecting-module module-kepler"><EmptyState loading message="Loading…" /></div>;
    }

    const selectedCount = saved.filter((p) => selected.has(p.id) && p.status !== 'pushed').length;

    /* Searching Apollo IS this screen's job, so the form lives on the canvas.
       It briefly sat in the 320px tool rail, which mangled a six-field form
       (placeholders truncated to "e.g. Hea…") — a form that feeds the screen's
       own primary action must never be behind a toggle. */
    const searchSection = apolloConnected ? (
        <Panel variant="quiet" className="prospecting__search">
            <PanelHeader
                title="Find prospects"
                meta={results.length ? `${results.length} results` : 'Apollo'}
            />
            <div className="prospecting__search-body">
                    {personas.length > 0 && (
                        <div className="input-group">
                            <label className="label-text">Target ICPs (optional - fills job titles from your saved personas)</label>
                            <div className="platform-pills">
                                {personas.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        className={`btn btn-secondary platform-pill ${selectedIcps.has(p.id) ? 'active' : ''}`}
                                        onClick={() => toggleIcp(p.id)}
                                    >
                                        {p.role}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="builder-grid">
                        <div className="input-group">
                            <label className="label-text">Job titles (comma-separated)</label>
                            <input className="intel-input" type="text" placeholder="e.g. Head of Marketing, VP Growth"
                                value={form.titles} onChange={(e) => setForm({ ...form, titles: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label className="label-text">Keywords</label>
                            <input className="intel-input" type="text" placeholder="e.g. B2B SaaS"
                                value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label className="label-text">Locations (comma-separated)</label>
                            <input className="intel-input" type="text" placeholder="e.g. United States, London"
                                value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                        </div>
                    </div>
                    <div className="builder-grid">
                        <div className="input-group">
                            <label className="label-text">Seniority (optional signal)</label>
                            <div className="platform-pills">
                                {SENIORITIES.map((s) => (
                                    <button key={s.value} type="button" className={`btn btn-secondary platform-pill ${selectedSeniorities.has(s.value) ? 'active' : ''}`} onClick={() => toggleSeniority(s.value)}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="input-group">
                            <label className="label-text">Company size (optional signal)</label>
                            <div className="platform-pills">
                                {COMPANY_SIZES.map((c) => (
                                    <button key={c.value} type="button" className={`btn btn-secondary platform-pill ${selectedSizes.has(c.value) ? 'active' : ''}`} onClick={() => toggleSize(c.value)}>
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="module-toolbar module-toolbar--inline">
                        <button type="button" className="btn btn-primary" onClick={search} disabled={searching}>
                            <UserSearch size={16} strokeWidth={1.8} /> {searching ? 'Searching…' : 'Search prospects'}
                        </button>
                        {results.length > 0 && (
                            <button type="button" className="btn btn-secondary" onClick={saveAll}>Save all to list</button>
                        )}
                    </div>
                    {searchInfo && <p className="brand-intel-module__source-label">{searchInfo}</p>}

                    {results.length > 0 && (
                        <ul className="prospect-list">
                            {results.map((p) => {
                                const isSaved = p.externalId && savedExternalIds.has(p.externalId);
                                return (
                                    <li key={p.externalId || `${p.firstName}-${p.lastName}-${p.company}`} className="prospect-row">
                                        <div className="prospect-row__main">
                                            <span className="prospect-row__name">{fullName(p)}</span>
                                            <span className="prospect-row__sub">{[p.title, p.company].filter(Boolean).join(' · ')}{p.location ? ` - ${p.location}` : ''}</span>
                                        </div>
                                        <div className="prospect-row__actions">
                                            {p.linkedinUrl && (
                                                <a className="btn btn-ghost" href={p.linkedinUrl} target="_blank" rel="noreferrer" title="LinkedIn"><ExternalLink size={15} strokeWidth={1.8} /></a>
                                            )}
                                            {isSaved ? (
                                                <span className="prospect-row__saved"><Check size={14} strokeWidth={2.2} /> Saved</span>
                                            ) : (
                                                <button type="button" className="btn btn-secondary" onClick={() => saveOne(p)}>Save</button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
            </div>
        </Panel>
    ) : null;

    return (
        <ModuleScreen
            moduleKey="prospecting"
            className="prospecting-module module-kepler"
            banner={
                <>
                    {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                    {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
                    {!apolloConnected && (
                        <p className="cockpit__intel-hint">
                            Connect Apollo in <strong>Profile &amp; settings → Connectors</strong> to search for prospects.
                        </p>
                    )}
                </>
            }
            status={
                <>
                    <span><strong>{saved.length}</strong> saved</span>
                    <span>{zohoConnected ? 'Zoho connected' : 'Connect Zoho to push to CRM'}</span>
                </>
            }
        >
            {searchSection}
            <Panel variant="quiet">
                {saved.length === 0 ? (
                    <EmptyState message="No saved prospects yet. Search Apollo above and save the good ones." />
                ) : (
                    <>
                    <SelectionBar
                        total={saved.filter((p) => p.status !== 'pushed').length}
                        selectedCount={selected.size}
                        onSelectAll={() => setSelected(new Set(saved.filter((p) => p.status !== 'pushed').map((p) => p.id)))}
                        onSelectN={(n) => setSelected(new Set(saved.filter((p) => p.status !== 'pushed').slice(0, n).map((p) => p.id)))}
                        onClear={() => setSelected(new Set())}
                    >
                        <button type="button" className="btn btn-secondary" onClick={() => setAddListOpen(true)}>
                            Add {selected.size} to list
                        </button>
                        {zohoConnected && (
                            <button type="button" className="btn btn-primary" onClick={pushToZoho} disabled={pushing || selectedCount === 0}>
                                {pushing ? 'Pushing…' : `Push ${selectedCount || ''} to Zoho`}
                            </button>
                        )}
                    </SelectionBar>
                    <ul className="prospect-list">
                        {saved.map((p) => {
                            const pushed = p.status === 'pushed';
                            return (
                                <li key={p.id} className="prospect-row">
                                    <div className="prospect-row__main">
                                        <label className="prospect-row__select">
                                            <input type="checkbox" disabled={pushed} checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                                            <span className="prospect-row__name">{fullName(p)}</span>
                                        </label>
                                        <span className="prospect-row__sub">{[p.title, p.company].filter(Boolean).join(' · ')}{p.location ? ` - ${p.location}` : ''}</span>
                                    </div>
                                    <div className="prospect-row__actions">
                                        {pushed ? (
                                            <span className="prospect-row__saved"><Check size={14} strokeWidth={2.2} /> In Zoho</span>
                                        ) : (
                                            <button type="button" className="btn btn-ghost" onClick={() => removeSaved(p.id)} title="Remove"><Trash2 size={15} strokeWidth={1.8} /></button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    </>
                )}
            </Panel>

            <AddToListModal
                workspaceId={workspaceId}
                prospectIds={[...selected]}
                isOpen={addListOpen}
                onClose={() => setAddListOpen(false)}
                onAdded={(added, listName, requested) => {
                    setNotice(`Added ${added} to “${listName}”${requested > added ? ` (${requested - added} already in it)` : ''}.`);
                    setSelected(new Set());
                }}
            />
        </ModuleScreen>
    );
};

export default Prospecting;
