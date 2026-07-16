import { useState } from 'react';
import { ExternalLink, Check } from '../../lib/icons';
import { PanelHeader } from '../ui/Panel';
import EmptyState from '../ui/EmptyState';
import RatingControl from '../ui/RatingControl';
import { abmService } from '../../services/abmService';
import { prospectsService } from '../../services/prospectsService';
import { feedbackService } from '../../services/feedbackService';
import { toUserMessage } from '../../lib/errors';

// One completed research result: the account brief (classification) + a validated,
// fit-scored contacts table. Self-contained - owns its own selection + save state
// so the page is just a transcript of these cards. "Save to prospect list" is the
// bridge into the existing outreach/CRM rails (prospects is the recipient spine).

const TIER_LABEL = { enterprise: 'Enterprise', 'mid-market': 'Mid-market', smb: 'SMB' };
const fullName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || '(name pending)';
// Index-free stable key: works on both abm contacts and mapped prospects so we
// can match created prospects back to their abm_contact row for the backlink.
const matchKey = (c) =>
    c.externalId
    || (c.email ? `e:${String(c.email).toLowerCase()}` : `n:${String(c.firstName).toLowerCase()}|${String(c.lastName).toLowerCase()}|${String(c.title).toLowerCase()}`);

const toProspect = (c, account) => ({
    firstName: c.firstName,
    lastName: c.lastName,
    title: c.title,
    company: c.company || account.companyName,
    email: c.email,
    linkedinUrl: c.linkedinUrl,
    location: '',
    source: 'abm',
    externalId: c.externalId,
});

const AbmResultCard = ({ workspaceId, result, onFeedback }) => {
    const { account, contacts = [], sources = [], note } = result;
    const [selected, setSelected] = useState(() => new Set());
    const [savedKeys, setSavedKeys] = useState(() => new Set());
    const [savedRows, setSavedRows] = useState(null); // persisted abm_contacts (with ids)
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const toggle = (key) => setSelected((prev) => {
        const n = new Set(prev);
        if (n.has(key)) n.delete(key); else n.add(key);
        return n;
    });

    // Persist the account + all contacts once; returns the saved abm_contacts so
    // callers can link them to prospects. Idempotent per card.
    const ensureSaved = async () => {
        if (savedRows) return savedRows;
        const { contacts: rows } = await abmService.saveResearch(workspaceId, { account, contacts });
        setSavedRows(rows);
        return rows;
    };

    const saveResearch = async () => {
        setBusy('research'); setError(''); setNotice('');
        try {
            await ensureSaved();
            setNotice('Saved to your ABM accounts.');
        } catch (err) {
            setError(toUserMessage(err, 'Could not save the research.'));
        } finally { setBusy(''); }
    };

    const saveToProspects = async () => {
        const chosen = contacts.filter((c) => selected.has(matchKey(c)));
        if (!chosen.length) { setError('Select at least one contact to save.'); return; }
        setBusy('prospects'); setError(''); setNotice('');
        try {
            const rows = await ensureSaved();
            const created = await prospectsService.save(workspaceId, chosen.map((c) => toProspect(c, account)));
            // Best-effort backlink abm_contact -> prospect (never blocks the save).
            try {
                const idByKey = new Map(rows.map((r) => [matchKey(r), r.id]));
                const links = created
                    .map((p) => ({ contactId: idByKey.get(matchKey(p)), prospectId: p.id }))
                    .filter((l) => l.contactId);
                if (links.length) await abmService.markSavedToProspects(workspaceId, links);
            } catch { /* backlink is non-essential */ }
            setSavedKeys((prev) => new Set([...prev, ...chosen.map(matchKey)]));
            setSelected(new Set());
            setNotice(created.length
                ? `Saved ${created.length} contact${created.length === 1 ? '' : 's'} to your prospect list - find them under Prospecting.`
                : 'Those contacts are already in your prospect list.');
        } catch (err) {
            setError(toUserMessage(err, 'Could not save to the prospect list.'));
        } finally { setBusy(''); }
    };

    const selectedCount = selected.size;

    return (
        <div className="abm-result">
            {/* Account brief */}
            <div className="abm-account">
                <div className="abm-account__head">
                    <div className="abm-account__title">
                        <h3 className="abm-account__name">{account.companyName || 'Unknown company'}</h3>
                        {account.domain && (
                            <a className="abm-account__domain" href={`https://${account.domain}`} target="_blank" rel="noreferrer">
                                {account.domain} <ExternalLink size={12} strokeWidth={1.8} />
                            </a>
                        )}
                    </div>
                    <div className="abm-account__badges">
                        {account.icpFit && <span className={`abm-badge abm-badge--fit-${account.icpFit}`}>{account.icpFit} ICP fit</span>}
                        {account.tier && <span className="abm-badge">{TIER_LABEL[account.tier] ?? account.tier}</span>}
                    </div>
                </div>

                <div className="abm-account__facts">
                    {account.employeeSize && <span className="abm-fact"><span className="abm-fact__label">Size</span> {account.employeeSize}</span>}
                    {account.revenue && <span className="abm-fact"><span className="abm-fact__label">Revenue</span> {account.revenue}</span>}
                    {account.recommendedChannel && <span className="abm-fact"><span className="abm-fact__label">Channel</span> {account.recommendedChannel}</span>}
                </div>

                {account.techSignals?.length > 0 && (
                    <div className="abm-chips">
                        {account.techSignals.map((t) => <span key={t} className="abm-chip">{t}</span>)}
                    </div>
                )}
                {account.whyGrounding && <p className="abm-account__why">{account.whyGrounding}</p>}
                {sources.length > 0 && (
                    <details className="abm-sources">
                        <summary>{sources.length} source{sources.length === 1 ? '' : 's'}</summary>
                        <ul>
                            {sources.map((s, i) => (
                                <li key={`${s.url}-${i}`}>
                                    <a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>
                                </li>
                            ))}
                        </ul>
                    </details>
                )}
            </div>

            {/* Contacts data layer */}
            <PanelHeader
                title={`Target contacts${contacts.length ? ` · ${contacts.length}` : ''}`}
                meta={result.apolloUsed ? 'Pulled from Apollo, validated + scored against your ICP.' : 'Analyst-surfaced targets, scored against your ICP.'}
                action={
                    <div className="module-toolbar module-toolbar--inline">
                        <button type="button" className="btn btn-secondary" onClick={saveResearch} disabled={busy !== '' || savedRows !== null}>
                            {savedRows ? <><Check size={15} strokeWidth={2.1} /> Saved</> : (busy === 'research' ? 'Saving…' : 'Save research')}
                        </button>
                        <button type="button" className="btn btn-primary" onClick={saveToProspects} disabled={busy !== '' || selectedCount === 0}>
                            {busy === 'prospects' ? 'Saving…' : `Save ${selectedCount || ''} to prospect list`}
                        </button>
                    </div>
                }
            />

            {note && <p className="abm-note">{note}</p>}
            {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
            {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}

            {contacts.length === 0 ? (
                <EmptyState message="No qualifying leadership contacts surfaced for this account." />
            ) : (
                <div className="abm-table__scroll">
                    <div className="abm-table" role="table">
                        <div className="abm-table__row abm-table__row--head" role="row">
                            <span className="abm-cell abm-cell--check" role="columnheader" />
                            <span className="abm-cell abm-cell--name" role="columnheader">Contact</span>
                            <span className="abm-cell abm-cell--sen" role="columnheader">Seniority</span>
                            <span className="abm-cell abm-cell--fit" role="columnheader">Fit</span>
                            <span className="abm-cell abm-cell--status" role="columnheader">Status</span>
                            <span className="abm-cell abm-cell--link" role="columnheader" />
                        </div>
                        {contacts.map((c) => {
                            const key = matchKey(c);
                            const saved = savedKeys.has(key);
                            const needsEmail = c.flags?.includes('needs-enrichment');
                            return (
                                <div key={key} className="abm-table__row" role="row">
                                    <span className="abm-cell abm-cell--check" role="cell">
                                        <input type="checkbox" checked={selected.has(key)} disabled={saved} onChange={() => toggle(key)} aria-label={`Select ${fullName(c)}`} />
                                    </span>
                                    <span className="abm-cell abm-cell--name" role="cell">
                                        <span className="abm-contact__name">{fullName(c)}</span>
                                        <span className="abm-contact__sub">{[c.title, c.company].filter(Boolean).join(' · ')}</span>
                                        {c.fitReasoning && <span className="abm-contact__why">{c.fitReasoning}</span>}
                                    </span>
                                    <span className="abm-cell abm-cell--sen" role="cell">{c.seniorityTier}</span>
                                    <span className="abm-cell abm-cell--fit" role="cell">
                                        <span className="abm-fit-score" style={{ '--fit': c.fitScore }}>{c.fitScore}</span>
                                    </span>
                                    <span className="abm-cell abm-cell--status" role="cell">
                                        {saved ? (
                                            <span className="abm-saved"><Check size={13} strokeWidth={2.2} /> Saved</span>
                                        ) : needsEmail ? (
                                            <span className="abm-flag" title="No verified email - needs enrichment before email sends">needs email</span>
                                        ) : (
                                            <span className={`abm-src abm-src--${c.source}`}>{c.source === 'apollo' ? 'verified' : 'research'}</span>
                                        )}
                                    </span>
                                    <span className="abm-cell abm-cell--link" role="cell">
                                        {c.linkedinUrl && (
                                            <a className="btn btn-ghost" href={c.linkedinUrl} target="_blank" rel="noreferrer" title="LinkedIn">
                                                <ExternalLink size={15} strokeWidth={1.8} />
                                            </a>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <RatingControl
                label="Rate this research"
                onSubmit={async (rating, improvement) => {
                    await feedbackService.saveFeedback(workspaceId, { module: 'abm', label: account.companyName || '', rating, improvement });
                    onFeedback?.();
                }}
            />
        </div>
    );
};

export default AbmResultCard;
