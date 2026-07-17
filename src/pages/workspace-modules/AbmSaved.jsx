import { useEffect, useState } from 'react';
import { ArrowLeft, Trash2, Check } from '../../lib/icons';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import EmptyState from '../../components/ui/EmptyState';
import AbmResultCard from '../../components/abm-research/AbmResultCard';
import { abmService } from '../../services/abmService';
import { prospectsService } from '../../services/prospectsService';
import { integrationService } from '../../services/integrationService';
import { buildCrmIndex } from '../../lib/crmDedupe';
import { toUserMessage } from '../../lib/errors';
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
const accountSub = (a) =>
    [TIER_LABEL[a.tier], a.icpFit && `${a.icpFit} fit`, a.employeeSize].filter(Boolean).join(' · ');

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

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const [accts, list, zoho] = await Promise.all([
                    abmService.listAccounts(workspaceId),
                    prospectsService.list(workspaceId),
                    integrationService.getStatus(workspaceId, 'zoho'),
                ]);
                if (cancelled) return;
                setAccounts(accts);
                setProspects(list);
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
        <div className="abm-saved-module module-kepler">
            <Panel className="module-panel">
                <PanelHeader title={`Saved accounts${accounts?.length ? ` · ${accounts.length}` : ''}`} meta="Researched accounts — click to reopen the brief and contacts." />
                {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
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

            <Panel className="module-panel">
                <PanelHeader
                    title={`Prospect list${prospects.length ? ` · ${prospects.length}` : ''}`}
                    meta={zohoConnected ? 'Select prospects and push them into Zoho as Leads.' : 'Contacts saved from ABM + Prospecting. Connect Zoho to push them into your CRM.'}
                    action={zohoConnected && prospects.length > 0 && (
                        <button type="button" className="btn btn-primary" onClick={pushToZoho} disabled={pushing || selectedCount === 0}>
                            {pushing ? 'Pushing…' : `Push ${selectedCount || ''} to Zoho`}
                        </button>
                    )}
                />
                {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}
                {prospects.length === 0 ? (
                    <EmptyState message="No prospects yet. Save contacts from ABM Research or Prospecting." />
                ) : (
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
                )}
            </Panel>
        </div>
    );
};

export default AbmSaved;
