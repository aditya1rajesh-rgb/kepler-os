import { useEffect, useMemo, useState } from 'react';
import { UserSearch, Check, X } from '../../lib/icons';
import EmptyState from '../ui/EmptyState';
import { useWorkspaceConfig } from '../../hooks/useWorkspaceConfig';
import { integrationService } from '../../services/integrationService';
import { prospectsService } from '../../services/prospectsService';
import { usageService } from '../../services/usageService';
import { toUserMessage } from '../../lib/errors';
import './ProspectRow.css';
import './FindProspectsDrawer.css';

/**
 * Find prospects, as a DRAWER over Audiences.
 *
 * Extracted from the retired `Prospecting` screen, which is where filling an
 * audience used to live as a sibling of the thing it fills. It keeps the search
 * form and the results; it deliberately does NOT keep that screen's
 * saved-prospects panel, which was a second rendering of the same prospects the
 * People table shows - selection state was per-panel, so picking six people in
 * one and switching to the other showed nothing selected.
 *
 * The form stays a form on a surface, not a rail: it was tried in the 320px tool
 * rail and the placeholders truncated to "e.g. Hea…". A form that feeds the
 * screen's own primary action must not be behind a toggle.
 */

const splitList = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const fullName = (p) => [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'Unknown';

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

const FindProspectsDrawer = ({ workspaceId, isOpen, onClose, onSaved }) => {
    const { personas } = useWorkspaceConfig(workspaceId);
    const [apolloConnected, setApolloConnected] = useState(null); // null = not yet known
    const [selectedIcps, setSelectedIcps] = useState(() => new Set());
    const [selectedSeniorities, setSelectedSeniorities] = useState(() => new Set());
    const [selectedSizes, setSelectedSizes] = useState(() => new Set());
    const [form, setForm] = useState({ titles: '', keywords: '', location: '' });
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchInfo, setSearchInfo] = useState('');
    const [savedIds, setSavedIds] = useState(() => new Set());
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        if (!workspaceId || !isOpen) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const apollo = await integrationService.getStatus(workspaceId, 'apollo');
                if (!cancelled) setApolloConnected(apollo?.status === 'connected');
            } catch {
                if (!cancelled) setApolloConnected(false);
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId, isOpen]);

    // Close on Escape, like every other overlay.
    useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    const alreadySaved = useMemo(() => savedIds, [savedIds]);

    const toggleIn = (setter) => (v) => setter((prev) => {
        const n = new Set(prev);
        if (n.has(v)) n.delete(v); else n.add(v);
        return n;
    });
    const toggleIcp = toggleIn(setSelectedIcps);
    const toggleSeniority = toggleIn(setSelectedSeniorities);
    const toggleSize = toggleIn(setSelectedSizes);

    const search = async () => {
        usageService.run(workspaceId, 'prospecting', 'apollo_search');
        // Selected ICPs seed the filters from saved personas; typed values merge on
        // top. Locations stay manual: persona geography is free text and rarely
        // matches Apollo's taxonomy, which would zero out every result.
        const icpPersonas = personas.filter((p) => selectedIcps.has(p.id));
        const icpTitles = icpPersonas.flatMap((p) => (p.titles?.length ? p.titles : (p.role ? [p.role] : [])));
        const titles = Array.from(new Set([...icpTitles, ...splitList(form.titles)].filter(Boolean)));
        const locations = splitList(form.location);
        const keywords = form.keywords.trim();
        if (!titles.length && !locations.length && !keywords) {
            setError('Pick an ICP or enter a title, keyword, or location to search.');
            return;
        }
        setSearching(true); setError(''); setNotice(''); setSearchInfo('');
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
            // A count is a RESULT, not an empty state, and must not be dressed as one.
            setSearchInfo(people.length
                ? `${people.length} shown${total ? ` of ${total} matches` : ''} · emails need Apollo enrichment (not returned by search).`
                : `No matches (${total} found). Try a broader title or fewer filters.`);
        } catch (err) {
            // Connector edge errors are already curated: show them directly.
            setError(err?.message || 'Apollo search failed.');
        } finally {
            setSearching(false);
        }
    };

    const keyOf = (p) => p.externalId || `${p.firstName}-${p.lastName}-${p.company}`;

    const saveOne = async (p) => {
        setError('');
        try {
            const created = await prospectsService.save(workspaceId, [p]);
            setSavedIds((prev) => new Set(prev).add(keyOf(p)));
            if (created.length) onSaved?.(created.length);
        } catch (err) {
            setError(toUserMessage(err, 'Could not save the prospect.'));
        }
    };

    const saveAll = async () => {
        setError('');
        try {
            const created = await prospectsService.save(workspaceId, results);
            setSavedIds(new Set(results.map(keyOf)));
            if (created.length) {
                setNotice(`Saved ${created.length} new prospect${created.length === 1 ? '' : 's'}. They are in All people.`);
                onSaved?.(created.length);
            } else {
                setNotice('Those prospects are already in All people.');
            }
        } catch (err) {
            setError(toUserMessage(err, 'Could not save prospects.'));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fpd">
            <button type="button" className="fpd__scrim" onClick={onClose} aria-label="Close Find prospects" />
            <aside className="fpd__panel" role="dialog" aria-label="Find prospects">
                <header className="fpd__head">
                    <h2 className="fpd__title">Find prospects</h2>
                    <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
                        <X size={16} strokeWidth={1.8} />
                    </button>
                </header>

                <div className="fpd__body">
                    {apolloConnected === null ? (
                        <EmptyState loading message="Checking your Apollo connection…" />
                    ) : !apolloConnected ? (
                        <p className="fpd__hint">
                            Connect Apollo in <strong>Integrations</strong> to search for prospects.
                        </p>
                    ) : (
                        <>
                            {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
                            {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}

                            {personas.length > 0 && (
                                <div className="input-group">
                                    <label className="label-text">Target ICPs (optional, fills job titles from your saved personas)</label>
                                    <div className="platform-pills">
                                        {personas.map((p) => (
                                            <button key={p.id} type="button"
                                                className={`btn btn-secondary platform-pill ${selectedIcps.has(p.id) ? 'active' : ''}`}
                                                onClick={() => toggleIcp(p.id)}>
                                                {p.role}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

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
                            <div className="input-group">
                                <label className="label-text">Seniority (optional signal)</label>
                                <div className="platform-pills">
                                    {SENIORITIES.map((s) => (
                                        <button key={s.value} type="button"
                                            className={`btn btn-secondary platform-pill ${selectedSeniorities.has(s.value) ? 'active' : ''}`}
                                            onClick={() => toggleSeniority(s.value)}>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="input-group">
                                <label className="label-text">Company size (optional signal)</label>
                                <div className="platform-pills">
                                    {COMPANY_SIZES.map((c) => (
                                        <button key={c.value} type="button"
                                            className={`btn btn-secondary platform-pill ${selectedSizes.has(c.value) ? 'active' : ''}`}
                                            onClick={() => toggleSize(c.value)}>
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {searchInfo && <p className="brand-intel-module__source-label">{searchInfo}</p>}

                            {results.length > 0 && (
                                <ul className="prospect-list">
                                    {results.map((p) => {
                                        const isSaved = alreadySaved.has(keyOf(p));
                                        return (
                                            <li key={keyOf(p)} className="prospect-row">
                                                <div className="prospect-row__main">
                                                    <span className="prospect-row__name">{fullName(p)}</span>
                                                    <span className="prospect-row__sub">
                                                        {[p.title, p.company, p.location].filter(Boolean).join(' · ')}
                                                    </span>
                                                </div>
                                                <div className="prospect-row__actions">
                                                    {isSaved ? (
                                                        <span className="prospect-row__saved">
                                                            <Check size={14} strokeWidth={2.2} /> Saved
                                                        </span>
                                                    ) : (
                                                        <button type="button" className="btn btn-secondary" onClick={() => saveOne(p)}>
                                                            Save
                                                        </button>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </>
                    )}
                </div>

                {apolloConnected && (
                    <footer className="fpd__foot">
                        {results.length > 0 && (
                            <button type="button" className="btn btn-secondary" onClick={saveAll}>
                                Save all to All people
                            </button>
                        )}
                        <button type="button" className="btn btn-primary" onClick={search} disabled={searching}>
                            <UserSearch size={16} strokeWidth={1.8} /> {searching ? 'Searching…' : 'Search prospects'}
                        </button>
                    </footer>
                )}
            </aside>
        </div>
    );
};

export default FindProspectsDrawer;
