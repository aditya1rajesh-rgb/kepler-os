import { useEffect, useState } from 'react';
import { ArrowLeft, Trash2, Check, Send } from '../../lib/icons';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import ModuleScreen from '../../components/layout/ModuleScreen';
import Tabs from '../../components/ui/Tabs';
import EmptyState from '../../components/ui/EmptyState';
import SelectionBar from '../../components/ui/SelectionBar';
import AbmResultCard from '../../components/abm-research/AbmResultCard';
import { abmService } from '../../services/abmService';
import { prospectsService } from '../../services/prospectsService';
import { integrationService } from '../../services/integrationService';
import { buildCrmIndex } from '../../lib/crmDedupe';
import { toUserMessage } from '../../lib/errors';
import { useNavigate } from 'react-router-dom';
import AddToListModal from '../../components/outreach/AddToListModal';
import { prospectListsService } from '../../services/prospectListsService';
import { workspacePath } from '../../constants/routes';
import '../../styles/module-kepler.css';
import './AbmResearch.css';
import './Prospecting.css';

// The Saved sub-module of Outreach: the persistent home for everything ABM has
// produced, independent of the prospect list. Two sections — saved accounts
// (master -> drill into the read-only result card) and the prospect list (the
// canonical browse of prospects, with remove + push-to-Zoho). Reads the
// already-built abmService/prospectsService; no new backend.

const TIER_LABEL = { enterprise: 'Enterprise', 'mid-market': 'Mid-market', smb: 'SMB' };
const fullName = (p) => [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'Unknown';
// Fall back to the raw tier: TIER_LABEL only covers enterprise/mid-market/smb, and
// research can return its own tiering ("Tier 1"), which was being dropped silently.
const accountSub = (a) =>
    [a.tier && (TIER_LABEL[a.tier] ?? a.tier), a.icpFit && `${a.icpFit} ICP fit`, a.employeeSize].filter(Boolean).join(' · ');

const AbmSaved = ({ workspaceId }) => {
    const [accounts, setAccounts] = useState(null); // null = loading
    const [detail, setDetail] = useState(null);     // { account, contacts, sources, persisted }
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [prospects, setProspects] = useState([]);
    const [selected, setSelected] = useState(() => new Set());
    const [zohoConnected, setZohoConnected] = useState(false);
    const [crmIndex, setCrmIndex] = useState(null);
    const [pushing, setPushing] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [lists, setLists] = useState([]);
    const [addListOpen, setAddListOpen] = useState(false);
    const [view, setView] = useState('accounts'); // accounts | prospects | lists — one at a time, no long scroll
    const navigate = useNavigate();

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const [accts, list, lls, zoho] = await Promise.all([
                    abmService.listAccounts(workspaceId),
                    prospectsService.list(workspaceId),
                    prospectListsService.listLists(workspaceId),
                    integrationService.getStatus(workspaceId, 'zoho'),
                ]);
                if (cancelled) return;
                setAccounts(accts);
                setProspects(list);
                setLists(lls);
                setZohoConnected(zoho?.status === 'connected');
                if (zoho?.status === 'connected') {
                    try {
                        const res = await integrationService.fetchFromConnector(workspaceId, 'zoho', { resource: 'contacts-all' });
                        if (!cancelled) setCrmIndex(buildCrmIndex(res?.result?.items ?? []));
                    } catch { /* dedupe best-effort */ }
                }
            } catch (err) {
                if (!cancelled) { setAccounts([]); setError(toUserMessage(err, 'Could not load saved research.')); }
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    const openAccount = async (a) => {
        setLoadingDetail(true);
        setError('');
        try {
            const res = await abmService.getAccountWithContacts(workspaceId, a.id);
            if (res) setDetail({ account: res.account, contacts: res.contacts, sources: res.account.sources ?? [], persisted: true });
        } catch (err) {
            setError(toUserMessage(err, 'Could not open that account.'));
        } finally { setLoadingDetail(false); }
    };

    const removeAccount = async (id) => {
        try {
            await abmService.removeAccount(workspaceId, id);
            setAccounts((prev) => (prev ?? []).filter((a) => a.id !== id));
        } catch (err) {
            setError(toUserMessage(err, 'Could not remove the account.'));
        }
    };

    const reloadLists = async () => {
        try { setLists(await prospectListsService.listLists(workspaceId)); } catch { /* non-fatal */ }
    };

    const deleteList = async (id) => {
        try {
            await prospectListsService.deleteList(workspaceId, id);
            setLists((prev) => prev.filter((l) => l.id !== id));
        } catch (err) {
            setError(toUserMessage(err, 'Could not delete the list.'));
        }
    };

    const toggle = (id) => setSelected((prev) => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    const removeProspect = async (id) => {
        try {
            await prospectsService.remove(workspaceId, id);
            setProspects((prev) => prev.filter((p) => p.id !== id));
            setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
        } catch (err) {
            setError(toUserMessage(err, 'Could not remove the prospect.'));
        }
    };

    const pushToZoho = async () => {
        const chosen = prospects.filter((p) => selected.has(p.id) && p.status !== 'pushed');
        if (!chosen.length) { setError('Select at least one un-pushed prospect.'); return; }
        setPushing(true); setError(''); setNotice('');
        try {
            await integrationService.pushToCrm(workspaceId, 'zoho', {
                prospects: chosen.map((p) => ({ firstName: p.firstName, lastName: p.lastName, company: p.company, email: p.email, title: p.title })),
            });
            await prospectsService.markPushed(workspaceId, chosen.map((p) => p.id), 'zoho');
            setProspects((prev) => prev.map((p) => (selected.has(p.id) ? { ...p, status: 'pushed', pushedTo: 'zoho' } : p)));
            setSelected(new Set());
            setNotice(`Pushed ${chosen.length} lead${chosen.length === 1 ? '' : 's'} into Zoho.`);
        } catch (err) {
            setError(err?.message || 'Could not push to Zoho.');
        } finally { setPushing(false); }
    };

    const selectedCount = prospects.filter((p) => selected.has(p.id) && p.status !== 'pushed').length;

    // Drill-in: a single saved account rendered read-only.
    if (detail) {
        return (
            <div className="abm-saved-module module-kepler">
                <button type="button" className="btn btn-ghost abm-saved-back" onClick={() => setDetail(null)}>
                    <ArrowLeft size={15} strokeWidth={1.8} /> Back to saved
                </button>
                <AbmResultCard workspaceId={workspaceId} result={detail} readOnly crmIndex={crmIndex} />
            </div>
        );
    }

    return (
        <ModuleScreen
            moduleKey="abm-saved"
            className="abm-saved-module module-kepler"
            banner={error ? <p className="brand-intel-module__error" role="alert">{error}</p> : null}
            /* The three segments already carry their own counts, so the panel
               headers that repeated those counts ("Saved accounts · 12") and
               explained the tab are gone. */
            status={
                <Tabs
                    tabs={[
                        { id: 'accounts', label: `Accounts · ${accounts?.length ?? 0}` },
                        { id: 'prospects', label: `Prospects · ${prospects.length}` },
                        { id: 'lists', label: `Lists · ${lists.length}` },
                    ]}
                    activeTab={view}
                    onTabChange={setView}
                    variant="kepler"
                />
            }
        >
            {view === 'accounts' && (
            <Panel variant="quiet">
                {accounts === null || loadingDetail ? (
                    <EmptyState loading message="Loading…" />
                ) : accounts.length === 0 ? (
                    <EmptyState message="No saved research yet. Research an account in the ABM Research tab and hit Save research." />
                ) : (
                    <ul className="prospect-list">
                        {accounts.map((a) => (
                            <li key={a.id} className="prospect-row">
                                <button type="button" className="prospect-row__main abm-saved-open" onClick={() => openAccount(a)}>
                                    <span className="prospect-row__name">{a.companyName || 'Unknown company'}</span>
                                    <span className="prospect-row__sub">{accountSub(a) || 'Open to view contacts'}</span>
                                </button>
                                <div className="prospect-row__actions">
                                    <button type="button" className="btn btn-ghost" onClick={() => removeAccount(a.id)} title="Remove"><Trash2 size={15} strokeWidth={1.8} /></button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>
            )}
            {view === 'prospects' && (
            <Panel variant="quiet">
                <PanelHeader
                    title="Prospects"
                    meta={zohoConnected ? 'Zoho connected' : 'Connect Zoho to push into your CRM'}
                />
                {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
                {prospects.length === 0 ? (
                    <EmptyState message="No prospects yet. Save contacts from Research or Find prospects." />
                ) : (
                    <>
                    <SelectionBar
                        total={prospects.filter((p) => p.status !== 'pushed').length}
                        selectedCount={selected.size}
                        onSelectAll={() => setSelected(new Set(prospects.filter((p) => p.status !== 'pushed').map((p) => p.id)))}
                        onSelectN={(n) => setSelected(new Set(prospects.filter((p) => p.status !== 'pushed').slice(0, n).map((p) => p.id)))}
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
                        {prospects.map((p) => {
                            const pushed = p.status === 'pushed';
                            return (
                                <li key={p.id} className="prospect-row">
                                    <div className="prospect-row__main">
                                        <label className="prospect-row__select">
                                            <input type="checkbox" disabled={pushed} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                                            <span className="prospect-row__name">{fullName(p)}</span>
                                        </label>
                                        <span className="prospect-row__sub">{[p.title, p.company].filter(Boolean).join(' · ')}</span>
                                    </div>
                                    <div className="prospect-row__actions">
                                        {pushed ? (
                                            <span className="prospect-row__saved"><Check size={14} strokeWidth={2.2} /> In Zoho</span>
                                        ) : (
                                            <button type="button" className="btn btn-ghost" onClick={() => removeProspect(p.id)} title="Remove"><Trash2 size={15} strokeWidth={1.8} /></button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    </>
                )}
            </Panel>
            )}
            {view === 'lists' && (
            <Panel variant="quiet">
                <PanelHeader title={`Lists${lists.length ? ` · ${lists.length}` : ''}`} meta="Named audiences — open one to view contacts, export, and enrich." />
                {lists.length === 0 ? (
                    <EmptyState message="No lists yet. Select prospects in the Prospects tab and “Add to list”." />
                ) : (
                    <ul className="prospect-list">
                        {lists.map((l) => {
                            // E30: Lists is a view inside Audiences now. The retired
                            // /outreach/lists route still redirects here, but link to
                            // the canonical target rather than lean on the hop.
                            const openList = () => navigate(`${workspacePath(workspaceId, 'outreach', 'audiences')}?view=lists&listId=${l.id}`);
                            return (
                                <li
                                    key={l.id}
                                    className="prospect-row prospect-row--clickable"
                                    role="button"
                                    tabIndex={0}
                                    onClick={openList}
                                    onKeyDown={(e) => { if (e.key === 'Enter') openList(); }}
                                >
                                    <div className="prospect-row__main">
                                        <span className="prospect-row__name">{l.name}</span>
                                        <span className="prospect-row__sub">{l.memberCount} prospect{l.memberCount === 1 ? '' : 's'}</span>
                                    </div>
                                    <div className="prospect-row__actions">
                                        <button type="button" className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); openList(); }}>
                                            Open
                                        </button>
                                        <button type="button" className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); navigate(`${workspacePath(workspaceId, 'outreach', 'sequences')}?list=${l.id}`); }} title="Build sequence">
                                            <Send size={15} strokeWidth={1.8} />
                                        </button>
                                        <button type="button" className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); deleteList(l.id); }} title="Delete list"><Trash2 size={15} strokeWidth={1.8} /></button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Panel>
            )}

            <AddToListModal
                workspaceId={workspaceId}
                prospectIds={[...selected]}
                isOpen={addListOpen}
                onClose={() => setAddListOpen(false)}
                onAdded={(added, listName, requested) => {
                    setNotice(`Added ${added} to “${listName}”${requested > added ? ` (${requested - added} already in it)` : ''}.`);
                    setSelected(new Set());
                    reloadLists();
                }}
            />
        </ModuleScreen>
    );
};

export default AbmSaved;
